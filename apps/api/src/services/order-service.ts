import { randomUUID } from 'node:crypto';
import {
  Money,
  ArrivalError,
  generateGuestSecret,
  hashGuestSecret,
  isCapabilityActive,
  canTransitionOrder,
  type CreateOrderRequest,
  type OrderCreated,
  type OrderView,
  type OrderEventsResponse,
  type GuestOrderGrantRecord,
} from '@arrival/contracts';
import type {
  IQuotesRepository,
  IOrderRepository,
  IGuestSessionRepository,
  ICapabilityRepository,
  IPlacesRepository,
  IOutboxRepository,
} from '../repositories/interfaces.js';
import type { IMerchantPosAdapter, IPaymentAdapter } from '../adapters/provider-adapters.js';
import { parseBearerToken, validateHexToken } from '../middleware/auth.js';

export class OrderService {
  constructor(
    private readonly quotesRepo: IQuotesRepository,
    private readonly orderRepo: IOrderRepository,
    private readonly guestRepo: IGuestSessionRepository,
    private readonly capabilityRepo: ICapabilityRepository,
    private readonly placesRepo: IPlacesRepository,
    private readonly posAdapter: IMerchantPosAdapter,
    private readonly paymentAdapter: IPaymentAdapter,
    private readonly outboxRepo?: IOutboxRepository
  ) {}

  async submitOrder(
    request: CreateOrderRequest,
    options: {
      idempotencyKey: string;
      guestSessionId?: string;
      customerId?: string;
    }
  ): Promise<OrderCreated> {
    // 1. Fetch quote
    const quoteRecord = await this.quotesRepo.getById(request.quoteId);
    if (!quoteRecord) {
      throw ArrivalError.notFound(`Checkout quote not found: ${request.quoteId}`);
    }
    if (quoteRecord.consumedAt) {
      throw ArrivalError.conflict(`Quote ${request.quoteId} has already been submitted and consumed`);
    }

    const { quote, locationId, destinationCountry } = quoteRecord;
    const now = Date.now();
    if (new Date(quote.expiresAt).getTime() <= now) {
      throw ArrivalError.unprocessableEntity(
        `Checkout quote has expired at ${quote.expiresAt}. Re-quote required.`,
        'EXPIRED_QUOTE'
      );
    }

    // 2. Capability verification (Fail-closed)
    const location = await this.placesRepo.getLocation(locationId);
    if (!location) {
      throw ArrivalError.notFound(`Location ${locationId} not found`);
    }

    const posCap = await this.capabilityRepo.getCapability(
      this.posAdapter.providerKey,
      'order_create',
      location.countryCode,
      location.id
    );
    if (!posCap || !isCapabilityActive(posCap)) {
      throw ArrivalError.unprocessableEntity(
        `Merchant location does not have an active production-verified POS integration. Native ordering is not permitted.`,
        'CAPABILITY_UNSUPPORTED'
      );
    }

    const payCap = await this.capabilityRepo.getCapability(
      this.paymentAdapter.providerKey,
      'charge_collect',
      destinationCountry
    );
    if (!payCap || !isCapabilityActive(payCap)) {
      throw ArrivalError.unprocessableEntity(
        `Payment route for country ${destinationCountry} is not verified.`,
        'CAPABILITY_UNSUPPORTED'
      );
    }

    const orderId = randomUUID();
    const orderTotal = Money.fromJson(quote.total);

    // 3. Collect payment via adapter
    const paymentResult = await this.paymentAdapter.collectPayment({
      paymentMethodToken: request.paymentMethodToken,
      amount: orderTotal,
      orderId,
      idempotencyKey: options.idempotencyKey,
    });

    if (paymentResult.status === 'failed') {
      throw ArrivalError.unprocessableEntity('Payment authorization was declined by issuer', 'PAYMENT_DECLINED');
    }

    // 4. Generate scoped guest order grants if guest order
    let guestSecret: string | undefined;
    let guestCancelSecret: string | undefined;
    if (options.guestSessionId) {
      guestSecret = generateGuestSecret();
      guestCancelSecret = generateGuestSecret();

      const readGrantRecord: GuestOrderGrantRecord = {
        id: randomUUID(),
        orderId,
        tokenDigest: hashGuestSecret(guestSecret),
        scope: 'read_order',
        expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        createdAt: new Date().toISOString(),
      };
      await this.guestRepo.createOrderGrant(readGrantRecord);

      const cancelGrantRecord: GuestOrderGrantRecord = {
        id: randomUUID(),
        orderId,
        tokenDigest: hashGuestSecret(guestCancelSecret),
        scope: 'cancel_order',
        expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        createdAt: new Date().toISOString(),
      };
      await this.guestRepo.createOrderGrant(cancelGrantRecord);
    }

    // 5. Create order and outbox records
    const orderCreated: OrderCreated = {
      orderId,
      orderState: 'submitted',
      paymentState: paymentResult.status === 'captured' ? 'captured' : 'authorized',
      fulfilmentState: 'quote_pending',
      updatedAt: new Date().toISOString(),
      ...(guestSecret ? { guestAccessGrant: guestSecret } : {}),
      ...(guestCancelSecret ? { guestCancelGrant: guestCancelSecret } : {}),
    };

    const outboxPayload = {
      orderId,
      locationId,
      total: quote.total,
      providerPaymentRef: paymentResult.providerRef,
    };

    await this.orderRepo.createOrder(orderCreated, quote, outboxPayload);
    await this.quotesRepo.markConsumed(quote.quoteId);

    // Forward to POS with authoritative quoted line prices
    const posItems = (quoteRecord.items || []).map((i: any) => ({
      name: i.name || i.menuItemId,
      quantity: i.quantity,
      priceMinor: i.unitPriceMinor ? BigInt(i.unitPriceMinor) : 0n,
    }));

    const posResult = await this.posAdapter.submitOrder({
      merchantLocationId: locationId,
      orderId,
      items: posItems,
      currency: quote.currency,
    });

    if (posResult.status === 'rejected') {
      // Order state must transition to 'rejected'
      await this.orderRepo.updateState(orderId, 'rejected');
      await this.orderRepo.recordEvent(orderId, {
        eventType: 'order_merchant_rejected',
        occurredAt: new Date().toISOString(),
        source: 'merchant',
        message: 'Merchant POS declined the order submission',
      });

      // Compensation: refund or void the collected payment
      await this.paymentAdapter.refundPayment(
        paymentResult.providerRef,
        orderTotal,
        `${options.idempotencyKey}-pos-rejection-refund`
      );

      // Record compensation event in outbox if available
      if (this.outboxRepo) {
        await this.outboxRepo.publish({
          id: randomUUID(),
          aggregateType: 'order',
          aggregateId: orderId,
          eventType: 'order_compensation_refunded',
          payload: {
            orderId,
            reason: 'POS_REJECTION',
            providerPaymentRef: paymentResult.providerRef,
            amount: quote.total,
          },
          createdAt: new Date().toISOString(),
          availableAt: new Date().toISOString(),
          attempts: 0,
        });
      }

      throw ArrivalError.unprocessableEntity(
        'Merchant POS declined the order submission',
        'MERCHANT_REJECTED'
      );
    }

    return orderCreated;
  }

  async getOrder(orderId: string, authHeader?: string): Promise<OrderView> {
    const token = parseBearerToken(authHeader);
    if (!token || !validateHexToken(token)) {
      // Prevent order enumeration: return 404
      throw ArrivalError.notFound(`Order ${orderId} not found`);
    }

    const digest = hashGuestSecret(token);
    const grant = await this.guestRepo.getOrderGrantByDigest(digest);
    if (!grant || grant.orderId !== orderId || grant.revokedAt || new Date(grant.expiresAt).getTime() <= Date.now()) {
      throw ArrivalError.notFound(`Order ${orderId} not found`);
    }

    const order = await this.orderRepo.getById(orderId);
    if (!order) {
      throw ArrivalError.notFound(`Order ${orderId} not found`);
    }

    return order;
  }

  async getOrderEvents(orderId: string, authHeader?: string): Promise<OrderEventsResponse> {
    const token = parseBearerToken(authHeader);
    if (!token || !validateHexToken(token)) {
      throw ArrivalError.notFound(`Order ${orderId} not found`);
    }

    const digest = hashGuestSecret(token);
    const grant = await this.guestRepo.getOrderGrantByDigest(digest);
    if (!grant || grant.orderId !== orderId || grant.revokedAt || new Date(grant.expiresAt).getTime() <= Date.now()) {
      throw ArrivalError.notFound(`Order ${orderId} not found`);
    }

    const events = await this.orderRepo.getEvents(orderId);
    return { items: events };
  }

  async cancelOrder(orderId: string, authHeader?: string, reason?: string): Promise<OrderView> {
    const token = parseBearerToken(authHeader);
    if (!token || !validateHexToken(token)) {
      throw ArrivalError.notFound(`Order ${orderId} not found`);
    }

    const digest = hashGuestSecret(token);
    const grant = await this.guestRepo.getOrderGrantByDigest(digest);
    if (!grant || grant.orderId !== orderId || grant.revokedAt || new Date(grant.expiresAt).getTime() <= Date.now()) {
      throw ArrivalError.notFound(`Order ${orderId} not found`);
    }

    if (grant.scope !== 'cancel_order') {
      throw ArrivalError.forbidden(
        'Insufficient permissions to cancel order. Scope cancel_order is required.',
        'INSUFFICIENT_SCOPE'
      );
    }

    const order = await this.orderRepo.getById(orderId);
    if (!order) {
      throw ArrivalError.notFound(`Order ${orderId} not found`);
    }

    if (!canTransitionOrder(order.orderState, 'customer_cancelled')) {
      throw ArrivalError.conflict(`Cannot cancel order in state "${order.orderState}"`);
    }

    await this.orderRepo.updateState(orderId, 'customer_cancelled');
    await this.orderRepo.recordEvent(orderId, {
      eventType: 'customer_cancelled',
      occurredAt: new Date().toISOString(),
      message: reason || 'Customer requested order cancellation',
      source: 'merchant',
    });

    return {
      ...order,
      orderState: 'customer_cancelled',
      updatedAt: new Date().toISOString(),
    };
  }
}

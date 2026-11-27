import { randomUUID } from 'node:crypto';
import {
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
  type PurchaseSnapshot,
} from '@arrival/contracts';
import type {
  IQuotesRepository,
  IOrderRepository,
  IGuestSessionRepository,
  ICapabilityRepository,
  IPlacesRepository,
  IOutboxRepository,
  IPaymentRepository,
  IFulfilmentRepository,
  IAuditRepository,
} from '../repositories/interfaces.js';
import type { IMerchantPosAdapter, IPaymentAdapter } from '../adapters/provider-adapters.js';
import { parseBearerToken, validateHexToken } from '../middleware/auth.js';
import { PaymentOrchestrationService } from './payment-service.js';
import { OrderOrchestrator } from './order-orchestrator.js';

export class OrderService {
  private readonly paymentService?: PaymentOrchestrationService;
  private readonly orchestrator: OrderOrchestrator;

  constructor(
    private readonly quotesRepo: IQuotesRepository,
    private readonly orderRepo: IOrderRepository,
    private readonly guestRepo: IGuestSessionRepository,
    private readonly capabilityRepo: ICapabilityRepository,
    private readonly placesRepo: IPlacesRepository,
    private readonly posAdapter: IMerchantPosAdapter,
    private readonly paymentAdapter: IPaymentAdapter,
    private readonly outboxRepo?: IOutboxRepository,
    private readonly paymentRepo?: IPaymentRepository,
    private readonly fulfilmentRepo?: IFulfilmentRepository,
    auditRepo?: IAuditRepository
  ) {
    if (paymentRepo) {
      this.paymentService = new PaymentOrchestrationService(paymentRepo, paymentAdapter, auditRepo);
    }
    this.orchestrator = new OrderOrchestrator(
      orderRepo,
      posAdapter,
      paymentAdapter,
      outboxRepo,
      paymentRepo,
      auditRepo
    );
  }

  getOrchestrator(): OrderOrchestrator {
    return this.orchestrator;
  }

  async submitOrder(
    request: CreateOrderRequest,
    options: {
      idempotencyKey: string;
      idempotencyRecordId?: string;
      guestSessionId?: string;
      customerId?: string;
      asyncOnly?: boolean;
    }
  ): Promise<OrderCreated> {
    // 1. Fetch & validate quote
    const quoteRecord = await this.quotesRepo.getById(request.quoteId);
    if (!quoteRecord) {
      throw ArrivalError.notFound(`Checkout quote not found: ${request.quoteId}`);
    }
    if (quoteRecord.guestSessionId && options.guestSessionId && quoteRecord.guestSessionId !== options.guestSessionId) {
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

    // 3. Build immutable purchase snapshot & guest grants BEFORE committing order
    const orderId = randomUUID();
    const nowIso = new Date(now).toISOString();

    const purchaseSnapshot: PurchaseSnapshot = {
      quoteId: quote.quoteId,
      locationId: location.id,
      ...(location.merchantId ? { merchantId: location.merchantId } : {}),
      locationDisplayName: location.displayName,
      destinationCountry: location.countryCode,
      catalogueVersion: quote.catalogueVersion,
      currency: quote.currency,
      items: quoteRecord.items || [],
      pricing: {
        currency: quote.currency,
        subtotal: quote.subtotal,
        tax: quote.tax,
        taxRateBasisPoints: 0,
        taxInclusive: quote.taxInclusive ?? true,
        deliveryFee: quote.delivery,
        serviceFee: quote.serviceFee || { amountMinor: '0', currency: quote.currency },
        total: quote.total,
      },
      ...(quote.deliveryQuoteRef ? { deliveryQuoteRef: quote.deliveryQuoteRef } : {}),
      capturedAt: nowIso,
    };

    let guestSecret: string | undefined;
    let guestCancelSecret: string | undefined;
    const guestGrants: GuestOrderGrantRecord[] = [];
    if (options.guestSessionId) {
      guestSecret = generateGuestSecret();
      guestCancelSecret = generateGuestSecret();

      guestGrants.push(
        {
          id: randomUUID(),
          orderId,
          tokenDigest: hashGuestSecret(guestSecret),
          scope: 'read_order',
          expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
          createdAt: nowIso,
        },
        {
          id: randomUUID(),
          orderId,
          tokenDigest: hashGuestSecret(guestCancelSecret),
          scope: 'cancel_order',
          expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
          createdAt: nowIso,
        }
      );
    }

    const orderCreated: OrderCreated = {
      orderId,
      orderState: 'submitted',
      paymentState: 'requires_action',
      fulfilmentState: 'quoted',
      merchantOrderState: 'submission_requested',
      updatedAt: nowIso,
      purchaseSnapshot,
      ...(guestSecret ? { guestAccessGrant: guestSecret } : {}),
      ...(guestCancelSecret ? { guestCancelGrant: guestCancelSecret } : {}),
    };

    const outboxMsgId = randomUUID();

    // 4. Atomically consume quote, persist order + snapshot + items + grants + outbox in ONE DB transaction
    const { quoteConsumed } = await this.orderRepo.createOrder({
      order: orderCreated,
      quote,
      locationId,
      purchaseSnapshot,
      items: quoteRecord.items || [],
      guestSessionId: options.guestSessionId,
      customerId: options.customerId,
      idempotencyRecordId: options.idempotencyRecordId || randomUUID(),
      guestGrants,
      outboxMessages: [
        {
          id: outboxMsgId,
          aggregateType: 'order',
          aggregateId: orderId,
          eventType: 'order_submitted',
          payload: {
            orderId,
            locationId,
            total: quote.total,
            idempotencyKey: options.idempotencyKey,
          },
          createdAt: nowIso,
          availableAt: nowIso,
          attempts: 0,
        },
      ],
    });

    if (!quoteConsumed) {
      throw ArrivalError.conflict(`Quote ${request.quoteId} has already been consumed or expired`);
    }

    if (this.paymentRepo) {
      await this.paymentRepo.createAttempt({
        id: randomUUID(),
        orderId,
        providerKey: this.paymentAdapter.providerKey,
        providerAccountRef: 'default',
        state: 'requires_action',
        amountMinor: quote.total.amountMinor,
        currency: quote.currency,
        idempotencyKey: `pay-${options.idempotencyKey}`,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    if (this.fulfilmentRepo) {
      await this.fulfilmentRepo.createAttempt({
        id: randomUUID(),
        orderId,
        providerKey: 'mock_delivery',
        providerAccountRef: 'default',
        state: 'quoted',
        quoteRef: quote.deliveryQuoteRef || null,
        feeMinor: quote.delivery.amountMinor,
        currency: quote.currency,
        idempotencyKey: `ful-${options.idempotencyKey}`,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    if (options.asyncOnly) {
      return orderCreated;
    }

    // Execute recoverable orchestration step; claim outbox message if available so worker won't duplicate
    const orchestrated = await this.orchestrator.processSubmittedOrder({
      orderId,
      paymentMethodToken: request.paymentMethodToken,
      idempotencyKey: options.idempotencyKey,
      throwOnBusinessDecline: true,
    });

    if (this.outboxRepo) {
      const claimed = await this.outboxRepo.claimBatch('api-inline', 20, 30_000);
      for (const msg of claimed) {
        if (msg.id === outboxMsgId && msg.leaseToken) {
          await this.outboxRepo.complete(msg.id, msg.leaseToken);
        } else if (msg.leaseToken) {
          await this.outboxRepo.scheduleRetry(
            msg.id,
            msg.leaseToken,
            new Date().toISOString(),
            'Deferred to background worker'
          );
        }
      }
    }

    return {
      ...orderCreated,
      orderState: orchestrated.orderState,
      paymentState: orchestrated.paymentState,
      fulfilmentState: orchestrated.fulfilmentState,
      ...(orchestrated.merchantOrderState !== undefined
        ? { merchantOrderState: orchestrated.merchantOrderState }
        : {}),
      updatedAt: orchestrated.updatedAt,
    };
  }

  async getOrder(orderId: string, authHeader?: string): Promise<OrderView> {
    const token = parseBearerToken(authHeader);
    if (!token || !validateHexToken(token)) {
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

    const transitioned = await this.orderRepo.updateState(orderId, 'customer_cancelled', order.orderState);
    if (!transitioned) {
      throw ArrivalError.conflict(`Order ${orderId} state changed concurrently`);
    }

    await this.orderRepo.recordEvent(orderId, {
      eventType: 'customer_cancelled',
      occurredAt: new Date().toISOString(),
      message: reason || 'Customer requested order cancellation',
      source: 'arrival_api',
      fromState: order.orderState,
      toState: 'customer_cancelled',
    });

    let updatedPaymentState = order.paymentState;
    if (this.paymentService) {
      const compRes = await this.paymentService.refundOrVoid({
        orderId,
        reason: reason || 'CUSTOMER_CANCELLATION',
        idempotencyKey: `cancel-${orderId}`,
      });
      updatedPaymentState = compRes.state;
    }

    return {
      ...order,
      orderState: 'customer_cancelled',
      paymentState: updatedPaymentState,
      updatedAt: new Date().toISOString(),
    };
  }
}

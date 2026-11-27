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
import {
  ProviderTimeoutError,
  type IMerchantPosAdapter,
  type IPaymentAdapter,
} from '../adapters/provider-adapters.js';
import { parseBearerToken, validateHexToken } from '../middleware/auth.js';
import { PaymentOrchestrationService } from './payment-service.js';

export class OrderService {
  private readonly paymentService?: PaymentOrchestrationService;

  constructor(
    private readonly quotesRepo: IQuotesRepository,
    private readonly orderRepo: IOrderRepository,
    private readonly guestRepo: IGuestSessionRepository,
    private readonly capabilityRepo: ICapabilityRepository,
    private readonly placesRepo: IPlacesRepository,
    private readonly posAdapter: IMerchantPosAdapter,
    private readonly paymentAdapter: IPaymentAdapter,
    private readonly outboxRepo?: IOutboxRepository,
    paymentRepo?: IPaymentRepository,
    private readonly fulfilmentRepo?: IFulfilmentRepository,
    private readonly auditRepo?: IAuditRepository
  ) {
    if (paymentRepo) {
      this.paymentService = new PaymentOrchestrationService(paymentRepo, paymentAdapter, auditRepo);
    }
  }

  async submitOrder(
    request: CreateOrderRequest,
    options: {
      idempotencyKey: string;
      idempotencyRecordId?: string;
      guestSessionId?: string;
      customerId?: string;
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
    const orderTotal = Money.fromJson(quote.total);
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
    //    (No external network calls inside the DB transaction!)
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
          payload: { orderId, locationId, total: quote.total },
          createdAt: nowIso,
          availableAt: nowIso,
          attempts: 0,
        },
      ],
    });

    if (!quoteConsumed) {
      throw ArrivalError.conflict(`Quote ${request.quoteId} has already been consumed or expired`);
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

    // 5. Execute payment authorization outside DB transaction
    let paymentState: OrderCreated['paymentState'] = 'authorized';
    let providerPaymentRef: string | undefined;

    if (this.paymentService) {
      const payOutcome = await this.paymentService.createAndAuthorize({
        orderId,
        amount: orderTotal,
        currency: quote.currency,
        paymentMethodToken: request.paymentMethodToken,
        idempotencyKey: `pay-${options.idempotencyKey}`,
      });

      if (payOutcome.outcome === 'failed') {
        await this.orderRepo.updateState(orderId, 'failed', 'submitted');
        await this.orderRepo.recordEvent(orderId, {
          eventType: 'payment_declined',
          occurredAt: new Date().toISOString(),
          source: 'payment',
          message: 'Payment authorization was declined by issuer',
          fromState: 'submitted',
          toState: 'failed',
        });
        throw ArrivalError.unprocessableEntity('Payment authorization was declined by issuer', 'PAYMENT_DECLINED');
      }

      if (payOutcome.outcome === 'reconciliation_required') {
        await this.orderRepo.recordEvent(orderId, {
          eventType: 'payment_reconciliation_required',
          occurredAt: new Date().toISOString(),
          source: 'payment',
          message: 'Payment authorization outcome uncertain due to provider timeout; queued for reconciliation',
          toState: 'submitted',
        });
        return {
          ...orderCreated,
          paymentState: 'reconciliation_required',
          updatedAt: new Date().toISOString(),
        };
      }

      paymentState = payOutcome.outcome === 'captured' ? 'captured' : 'authorized';
      providerPaymentRef = payOutcome.attempt.providerPaymentRef || undefined;
    } else {
      const paymentResult = await this.paymentAdapter.collectPayment({
        paymentMethodToken: request.paymentMethodToken,
        amount: orderTotal,
        orderId,
        idempotencyKey: options.idempotencyKey,
      });
      if (paymentResult.status === 'failed') {
        await this.orderRepo.updateState(orderId, 'failed', 'submitted');
        throw ArrivalError.unprocessableEntity('Payment authorization was declined by issuer', 'PAYMENT_DECLINED');
      }
      paymentState = paymentResult.status === 'captured' ? 'captured' : 'authorized';
      providerPaymentRef = paymentResult.providerRef;
    }

    // 6. Forward to POS with authoritative quoted line prices
    const posItems = (quoteRecord.items || []).map((i) => ({
      name: i.name || i.menuItemId,
      quantity: i.quantity,
      priceMinor: i.unitPriceMinor ? BigInt(i.unitPriceMinor) : 0n,
    }));

    try {
      const posResult = await this.posAdapter.submitOrder({
        merchantLocationId: locationId,
        orderId,
        items: posItems,
        currency: quote.currency,
        idempotencyKey: `pos-${options.idempotencyKey}`,
      });

      if (posResult.status === 'rejected') {
        await this.orderRepo.updateState(orderId, 'rejected', 'submitted');
        await this.orderRepo.updateMerchantOrderState(orderId, 'merchant_rejected', posResult.providerRef);
        await this.orderRepo.recordEvent(orderId, {
          eventType: 'order_merchant_rejected',
          occurredAt: new Date().toISOString(),
          source: 'merchant',
          message: 'Merchant POS declined the order submission',
          fromState: 'submitted',
          toState: 'rejected',
        });

        // Recoverable compensation
        if (this.paymentService) {
          await this.paymentService.refundOrVoid({
            orderId,
            reason: 'POS_REJECTION',
            idempotencyKey: `${options.idempotencyKey}-pos-rejection-refund`,
          });
        } else {
          await this.paymentAdapter.refundPayment(
            providerPaymentRef || orderId,
            orderTotal,
            `${options.idempotencyKey}-pos-rejection-refund`
          );
        }

        if (this.outboxRepo) {
          await this.outboxRepo.publish({
            id: randomUUID(),
            aggregateType: 'order',
            aggregateId: orderId,
            eventType: 'order_compensation_refunded',
            payload: {
              orderId,
              reason: 'POS_REJECTION',
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

      // POS accepted for processing (NOT yet merchant_accepted!)
      await this.orderRepo.updateState(orderId, 'awaiting_merchant', 'submitted');
      await this.orderRepo.updateMerchantOrderState(orderId, 'submission_accepted_for_processing', posResult.providerRef);
      await this.orderRepo.recordEvent(orderId, {
        eventType: 'order_awaiting_merchant',
        occurredAt: new Date().toISOString(),
        source: 'arrival_api',
        message: 'Order transmitted to merchant POS; awaiting merchant acceptance',
        fromState: 'submitted',
        toState: 'awaiting_merchant',
      });

      return {
        ...orderCreated,
        orderState: 'awaiting_merchant',
        paymentState,
        merchantOrderState: 'submission_accepted_for_processing',
        updatedAt: new Date().toISOString(),
      };
    } catch (err) {
      if (err instanceof ProviderTimeoutError) {
        await this.orderRepo.updateMerchantOrderState(orderId, 'submission_timeout');
        await this.orderRepo.recordEvent(orderId, {
          eventType: 'pos_submission_timeout',
          occurredAt: new Date().toISOString(),
          source: 'merchant',
          message: 'Merchant POS request timed out; reconciliation required',
          toState: 'submitted',
        });

        if (this.auditRepo) {
          await this.auditRepo.createCompensation({
            id: randomUUID(),
            orderId,
            operationType: 'manual_reconciliation',
            state: 'reconciliation_required',
            idempotencyKey: `${options.idempotencyKey}-pos-timeout`,
            attempts: 1,
            lastError: err.message,
            reason: 'POS submission timed out; uncertain whether merchant received order',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }

        return {
          ...orderCreated,
          paymentState,
          merchantOrderState: 'submission_timeout',
          updatedAt: new Date().toISOString(),
        };
      }
      throw err;
    }
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

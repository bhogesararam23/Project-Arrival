import { randomUUID } from 'node:crypto';
import {
  Money,
  ArrivalError,
  type OrderView,
  type OutboxMessage,
  type QuoteLineSnapshot,
} from '@arrival/contracts';
import type {
  IOrderRepository,
  IPaymentRepository,
  IOutboxRepository,
  IAuditRepository,
} from '../repositories/interfaces.js';
import {
  ProviderTimeoutError,
  type IMerchantPosAdapter,
  type IPaymentAdapter,
} from '../adapters/provider-adapters.js';
import { PaymentOrchestrationService } from './payment-service.js';

export class OrderOrchestrator {
  private readonly paymentService?: PaymentOrchestrationService;

  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly posAdapter: IMerchantPosAdapter,
    private readonly paymentAdapter: IPaymentAdapter,
    private readonly outboxRepo?: IOutboxRepository,
    paymentRepo?: IPaymentRepository,
    private readonly auditRepo?: IAuditRepository
  ) {
    if (paymentRepo) {
      this.paymentService = new PaymentOrchestrationService(paymentRepo, paymentAdapter, auditRepo);
    }
  }

  /**
   * Returns a map of deliberate outbox event handlers for OutboxWorker.
   */
  getOutboxHandlers(): Record<string, (msg: OutboxMessage) => Promise<void>> {
    return {
      order_submitted: async (msg) => {
        const payload = (msg.payload || {}) as {
          orderId?: string;
          paymentMethodToken?: string;
          idempotencyKey?: string;
        };
        const orderId = payload.orderId || msg.aggregateId;
        await this.processSubmittedOrder({
          orderId,
          paymentMethodToken: payload.paymentMethodToken || 'tok_sandbox_recovery',
          idempotencyKey: payload.idempotencyKey || msg.id,
          throwOnBusinessDecline: false,
        });
      },
      order_compensation_requested: async (msg) => {
        const payload = (msg.payload || {}) as {
          orderId?: string;
          reason?: string;
        };
        const orderId = payload.orderId || msg.aggregateId;
        if (this.paymentService) {
          await this.paymentService.refundOrVoid({
            orderId,
            reason: payload.reason || 'ORCHESTRATION_COMPENSATION',
            idempotencyKey: `comp-${orderId}`,
          });
        }
      },
      order_compensation_refunded: async (msg) => {
        const payload = (msg.payload || {}) as { orderId?: string; reason?: string };
        const orderId = payload.orderId || msg.aggregateId;
        const order = await this.orderRepo.getById(orderId);
        if (!order) return;
        const events = await this.orderRepo.getEvents(orderId);
        if (!events.some((e) => e.eventType === 'order_compensation_refunded')) {
          await this.orderRepo.recordEvent(orderId, {
            eventType: 'order_compensation_refunded',
            occurredAt: new Date().toISOString(),
            source: 'payment',
            message: `Compensation completed (${payload.reason || 'POS_REJECTION'})`,
            toState: order.orderState,
          });
        }
      },
    };
  }

  async processSubmittedOrder(params: {
    orderId: string;
    paymentMethodToken: string;
    idempotencyKey: string;
    throwOnBusinessDecline?: boolean;
  }): Promise<OrderView> {
    const order = await this.orderRepo.getById(params.orderId);
    if (!order) {
      throw ArrivalError.notFound(`Order ${params.orderId} not found for orchestration`);
    }

    // Idempotent guard: if order already progressed beyond 'submitted', do not re-execute
    if (order.orderState !== 'submitted') {
      return order;
    }

    const snapshot = order.purchaseSnapshot;
    const totalMoney = snapshot
      ? Money.fromJson(snapshot.pricing.total)
      : new Money(0n, 'GBP');
    const locationId = snapshot?.locationId || '';
    const currency = snapshot?.currency || totalMoney.currency;

    // Step 1: Payment Authorization (only if not already authorized/captured/reconciling)
    let currentPaymentState = order.paymentState;
    let providerPaymentRef: string | undefined;

    if (currentPaymentState === 'requires_action' || currentPaymentState === null) {
      if (this.paymentService) {
        const payOutcome = await this.paymentService.authorizeOrder({
          orderId: params.orderId,
          amount: totalMoney,
          currency,
          paymentMethodToken: params.paymentMethodToken,
          idempotencyKey: `pay-${params.idempotencyKey}`,
        });

        currentPaymentState = payOutcome.attempt.state;
        providerPaymentRef = payOutcome.attempt.providerPaymentRef || undefined;

        if (payOutcome.outcome === 'failed') {
          await this.orderRepo.updateState(params.orderId, 'failed', 'submitted');
          await this.orderRepo.recordEvent(params.orderId, {
            eventType: 'payment_declined',
            occurredAt: new Date().toISOString(),
            source: 'payment',
            message: 'Payment authorization was declined by issuer',
            fromState: 'submitted',
            toState: 'failed',
          });
          if (params.throwOnBusinessDecline) {
            throw ArrivalError.unprocessableEntity('Payment authorization was declined by issuer', 'PAYMENT_DECLINED');
          }
          return (await this.orderRepo.getById(params.orderId))!;
        }

        if (payOutcome.outcome === 'reconciliation_required') {
          await this.orderRepo.recordEvent(params.orderId, {
            eventType: 'payment_reconciliation_required',
            occurredAt: new Date().toISOString(),
            source: 'payment',
            message: 'Payment authorization outcome uncertain due to provider timeout; queued for reconciliation',
            toState: 'submitted',
          });
          return {
            ...order,
            paymentState: 'reconciliation_required',
            updatedAt: new Date().toISOString(),
          };
        }
      } else {
        const payRes = await this.paymentAdapter.collectPayment({
          paymentMethodToken: params.paymentMethodToken,
          amount: totalMoney,
          orderId: params.orderId,
          idempotencyKey: params.idempotencyKey,
        });
        if (payRes.status === 'failed') {
          await this.orderRepo.updateState(params.orderId, 'failed', 'submitted');
          if (params.throwOnBusinessDecline) {
            throw ArrivalError.unprocessableEntity('Payment authorization was declined by issuer', 'PAYMENT_DECLINED');
          }
          return (await this.orderRepo.getById(params.orderId))!;
        }
        currentPaymentState = payRes.status === 'captured' ? 'captured' : 'authorized';
        providerPaymentRef = payRes.providerRef;
      }
    }

    // If payment is in reconciliation_required, do not submit to POS
    if (currentPaymentState === 'reconciliation_required') {
      return order;
    }

    // Step 2: Merchant POS submission (idempotent on merchantOrderState)
    if (order.merchantOrderState === 'submission_requested' || !order.merchantOrderState) {
      const posItems = (snapshot?.items || []).map((i: QuoteLineSnapshot) => ({
        name: i.name || i.menuItemId,
        quantity: i.quantity,
        priceMinor: i.unitPriceMinor ? BigInt(i.unitPriceMinor) : 0n,
      }));

      try {
        const posResult = await this.posAdapter.submitOrder({
          merchantLocationId: locationId,
          orderId: params.orderId,
          items: posItems,
          currency,
          idempotencyKey: `pos-${params.idempotencyKey}`,
        });

        if (posResult.status === 'rejected') {
          await this.orderRepo.updateState(params.orderId, 'rejected', 'submitted');
          await this.orderRepo.updateMerchantOrderState(
            params.orderId,
            'merchant_rejected',
            posResult.providerRef
          );
          await this.orderRepo.recordEvent(params.orderId, {
            eventType: 'order_merchant_rejected',
            occurredAt: new Date().toISOString(),
            source: 'merchant',
            message: 'Merchant POS declined the order submission',
            fromState: 'submitted',
            toState: 'rejected',
          });

          if (this.paymentService) {
            await this.paymentService.refundOrVoid({
              orderId: params.orderId,
              reason: 'POS_REJECTION',
              idempotencyKey: `${params.idempotencyKey}-pos-rejection-refund`,
            });
          } else {
            await this.paymentAdapter.refundPayment(
              providerPaymentRef || params.orderId,
              totalMoney,
              `${params.idempotencyKey}-pos-rejection-refund`
            );
          }

          if (this.outboxRepo) {
            await this.outboxRepo.publish({
              id: randomUUID(),
              aggregateType: 'order',
              aggregateId: params.orderId,
              eventType: 'order_compensation_refunded',
              payload: {
                orderId: params.orderId,
                reason: 'POS_REJECTION',
                amount: snapshot?.pricing.total,
              },
              createdAt: new Date().toISOString(),
              availableAt: new Date().toISOString(),
              attempts: 0,
            });
          }

          if (params.throwOnBusinessDecline) {
            throw ArrivalError.unprocessableEntity(
              'Merchant POS declined the order submission',
              'MERCHANT_REJECTED'
            );
          }
          return (await this.orderRepo.getById(params.orderId))!;
        }

        await this.orderRepo.updateState(params.orderId, 'awaiting_merchant', 'submitted');
        await this.orderRepo.updateMerchantOrderState(
          params.orderId,
          'submission_accepted_for_processing',
          posResult.providerRef
        );
        await this.orderRepo.recordEvent(params.orderId, {
          eventType: 'order_awaiting_merchant',
          occurredAt: new Date().toISOString(),
          source: 'arrival_api',
          message: 'Order transmitted to merchant POS; awaiting merchant acceptance',
          fromState: 'submitted',
          toState: 'awaiting_merchant',
        });

        return {
          ...order,
          orderState: 'awaiting_merchant',
          paymentState: currentPaymentState,
          merchantOrderState: 'submission_accepted_for_processing',
          updatedAt: new Date().toISOString(),
        };
      } catch (err) {
        if (err instanceof ProviderTimeoutError) {
          await this.orderRepo.updateMerchantOrderState(params.orderId, 'submission_timeout');
          await this.orderRepo.recordEvent(params.orderId, {
            eventType: 'pos_submission_timeout',
            occurredAt: new Date().toISOString(),
            source: 'merchant',
            message: 'Merchant POS request timed out; reconciliation required',
            toState: 'submitted',
          });

          if (this.auditRepo) {
            await this.auditRepo.createCompensation({
              id: randomUUID(),
              orderId: params.orderId,
              operationType: 'manual_reconciliation',
              state: 'reconciliation_required',
              idempotencyKey: `${params.idempotencyKey}-pos-timeout`,
              attempts: 1,
              lastError: err.message,
              reason: 'POS submission timed out; uncertain whether merchant received order',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }

          return {
            ...order,
            paymentState: currentPaymentState,
            merchantOrderState: 'submission_timeout',
            updatedAt: new Date().toISOString(),
          };
        }
        throw err;
      }
    }

    return (await this.orderRepo.getById(params.orderId)) || order;
  }
}

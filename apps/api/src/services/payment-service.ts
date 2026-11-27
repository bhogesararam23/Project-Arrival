import { randomUUID } from 'node:crypto';
import {
  Money,
  ArrivalError,
  canTransitionPayment,
  type CurrencyCode,
  type PaymentAttemptRecord,
  type PaymentState,
} from '@arrival/contracts';
import type { IPaymentRepository, IAuditRepository } from '../repositories/interfaces.js';
import { ProviderTimeoutError, type IPaymentAdapter } from '../adapters/provider-adapters.js';

export class PaymentOrchestrationService {
  constructor(
    private readonly paymentRepo: IPaymentRepository,
    private readonly paymentAdapter: IPaymentAdapter,
    private readonly auditRepo?: IAuditRepository
  ) {}

  async createAndAuthorize(params: {
    orderId: string;
    amount: Money;
    currency: CurrencyCode;
    paymentMethodToken: string;
    idempotencyKey: string;
  }): Promise<{
    attempt: PaymentAttemptRecord;
    outcome: 'authorized' | 'captured' | 'failed' | 'reconciliation_required';
  }> {
    const nowIso = new Date().toISOString();
    const attempt: PaymentAttemptRecord = {
      id: randomUUID(),
      orderId: params.orderId,
      providerKey: this.paymentAdapter.providerKey,
      providerAccountRef: 'default',
      state: 'requires_action',
      amountMinor: params.amount.amountMinor.toString(),
      currency: params.currency,
      idempotencyKey: params.idempotencyKey,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await this.paymentRepo.createAttempt(attempt);

    try {
      const result = await this.paymentAdapter.collectPayment({
        paymentMethodToken: params.paymentMethodToken,
        amount: params.amount,
        orderId: params.orderId,
        idempotencyKey: params.idempotencyKey,
      });

      const targetState: PaymentState =
        result.status === 'captured' ? 'captured' : result.status === 'authorized' ? 'authorized' : 'failed';

      if (!canTransitionPayment(attempt.state, targetState)) {
        throw ArrivalError.conflict(`Invalid payment transition from ${attempt.state} to ${targetState}`);
      }

      const updated = await this.paymentRepo.updateState(attempt.id, targetState, result.providerRef);
      await this.paymentRepo.recordEvent({
        id: randomUUID(),
        paymentAttemptId: attempt.id,
        eventType: `payment_${targetState}`,
        amountMinor: params.amount.amountMinor.toString(),
        providerEventRef: result.providerRef,
      });

      return { attempt: updated || { ...attempt, state: targetState }, outcome: result.status };
    } catch (err) {
      if (err instanceof ProviderTimeoutError) {
        // Query provider before deciding; never blindly retry a financial charge
        if (this.paymentAdapter.queryPaymentStatus) {
          const queried = await this.paymentAdapter.queryPaymentStatus(params.orderId, params.idempotencyKey);
          if (queried.status === 'authorized' || queried.status === 'captured') {
            const updated = await this.paymentRepo.updateState(attempt.id, queried.status, queried.providerRef);
            return { attempt: updated || { ...attempt, state: queried.status }, outcome: queried.status };
          }
        }

        const reconciled = await this.paymentRepo.updateState(attempt.id, 'reconciliation_required');
        await this.paymentRepo.recordEvent({
          id: randomUUID(),
          paymentAttemptId: attempt.id,
          eventType: 'payment_timeout_reconciliation_required',
          redactedPayload: { reason: err.message },
        });

        if (this.auditRepo) {
          await this.auditRepo.createCompensation({
            id: randomUUID(),
            orderId: params.orderId,
            operationType: 'manual_reconciliation',
            state: 'reconciliation_required',
            idempotencyKey: `${params.idempotencyKey}-timeout-recon`,
            attempts: 1,
            lastError: err.message,
            reason: 'Payment authorization timed out; provider outcome uncertain',
            createdAt: nowIso,
            updatedAt: nowIso,
          });
        }

        return {
          attempt: reconciled || { ...attempt, state: 'reconciliation_required' },
          outcome: 'reconciliation_required',
        };
      }
      throw err;
    }
  }

  async refundOrVoid(params: {
    orderId: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<{ state: PaymentState; refundRef?: string }> {
    const attempt = await this.paymentRepo.getLatestByOrderId(params.orderId);
    if (!attempt) {
      throw ArrivalError.notFound(`No payment attempt found for order ${params.orderId}`);
    }

    if (attempt.state === 'voided' || attempt.state === 'refunded') {
      return { state: attempt.state };
    }

    const amount = new Money(attempt.amountMinor, attempt.currency);
    const nowIso = new Date().toISOString();
    const compId = randomUUID();

    if (this.auditRepo) {
      await this.auditRepo.createCompensation({
        id: compId,
        orderId: params.orderId,
        operationType: attempt.state === 'authorized' && this.paymentAdapter.voidPayment ? 'payment_void' : 'payment_refund',
        state: 'pending',
        idempotencyKey: params.idempotencyKey,
        attempts: 0,
        reason: params.reason,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    try {
      if (attempt.state === 'authorized' && this.paymentAdapter.voidPayment && attempt.providerPaymentRef) {
        const voidRes = await this.paymentAdapter.voidPayment(attempt.providerPaymentRef, params.idempotencyKey);
        if (voidRes.status === 'voided') {
          await this.paymentRepo.updateState(attempt.id, 'voided');
          if (this.auditRepo) {
            await this.auditRepo.updateCompensationState(compId, 'succeeded', attempt.providerPaymentRef);
          }
          return { state: 'voided' };
        }
      }

      const refundRes = await this.paymentAdapter.refundPayment(
        attempt.providerPaymentRef || attempt.id,
        amount,
        params.idempotencyKey
      );
      await this.paymentRepo.updateState(attempt.id, 'refunded');
      await this.paymentRepo.recordEvent({
        id: randomUUID(),
        paymentAttemptId: attempt.id,
        eventType: 'payment_refunded',
        amountMinor: amount.amountMinor.toString(),
        providerEventRef: refundRes.refundRef,
      });
      if (this.auditRepo) {
        await this.auditRepo.updateCompensationState(compId, 'succeeded', refundRes.refundRef);
      }
      return { state: 'refunded', refundRef: refundRes.refundRef };
    } catch (err) {
      await this.paymentRepo.updateState(attempt.id, 'reconciliation_required');
      if (this.auditRepo) {
        await this.auditRepo.updateCompensationState(
          compId,
          'reconciliation_required',
          undefined,
          err instanceof Error ? err.message : String(err)
        );
      }
      return { state: 'reconciliation_required' };
    }
  }
}

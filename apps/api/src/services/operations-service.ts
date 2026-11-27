import { randomUUID } from 'node:crypto';
import {
  ArrivalError,
  canTransitionPayment,
  type OrderView,
  type OrderEventItem,
  type OutboxMessage,
  type WebhookInboxMessage,
  type PaymentAttemptRecord,
  type PaymentState,
  type ProviderCapability,
  type CompensationRecord,
  type AuditRecord,
  type OperatorRole,
} from '@arrival/contracts';
import type {
  IOrderRepository,
  IPaymentRepository,
  IFulfilmentRepository,
  IOutboxRepository,
  IWebhookInboxRepository,
  ICapabilityRepository,
  IAuditRepository,
} from '../repositories/interfaces.js';

export interface OperationalOverview {
  ordersCount: number;
  pendingOrdersCount: number;
  awaitingMerchantCount: number;
  outboxPendingCount: number;
  outboxDeadLetterCount: number;
  failedWebhooksCount: number;
  reconciliationRequiredCount: number;
  activeCapabilitiesCount: number;
  expiringCapabilitiesCount: number;
  sampleBounded: boolean;
  sampleLimit: number;
}

export interface OrderInvestigationView {
  order: OrderView;
  paymentAttempt: PaymentAttemptRecord | null;
  fulfilmentAttempt: unknown | null;
  events: OrderEventItem[];
  compensations: CompensationRecord[];
  audits: AuditRecord[];
  piiMasked: true;
}

export class OperationsService {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly paymentRepo: IPaymentRepository,
    private readonly fulfilmentRepo: IFulfilmentRepository,
    private readonly outboxRepo: IOutboxRepository,
    private readonly webhookRepo: IWebhookInboxRepository,
    private readonly capabilityRepo: ICapabilityRepository,
    private readonly auditRepo: IAuditRepository
  ) {}

  async getOverview(): Promise<OperationalOverview> {
    const [orders, outboxMetrics, failedWebhooks, reconPayments, allCaps] = await Promise.all([
      this.orderRepo.listOrders({ limit: 200 }),
      this.outboxRepo.getMetrics(),
      this.webhookRepo.listFailed(200),
      this.paymentRepo.listReconciliationRequired(200),
      this.capabilityRepo.listAllCapabilities(),
    ]);

    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const expiringCaps = allCaps.filter(
      (c) =>
        c.status === 'production_verified' &&
        c.expiresAt &&
        new Date(c.expiresAt).getTime() > now &&
        new Date(c.expiresAt).getTime() - now <= sevenDaysMs
    );

    return {
      ordersCount: orders.length,
      pendingOrdersCount: orders.filter((o) => o.orderState === 'submitted').length,
      awaitingMerchantCount: orders.filter((o) => o.orderState === 'awaiting_merchant').length,
      outboxPendingCount: outboxMetrics.pendingCount,
      outboxDeadLetterCount: outboxMetrics.deadLetteredCount,
      failedWebhooksCount: failedWebhooks.length,
      reconciliationRequiredCount: reconPayments.length,
      activeCapabilitiesCount: allCaps.filter((c) => c.status === 'production_verified' && !c.revokedAt).length,
      expiringCapabilitiesCount: expiringCaps.length,
      sampleBounded: orders.length >= 200 || failedWebhooks.length >= 200 || reconPayments.length >= 200,
      sampleLimit: 200,
    };
  }

  async investigateOrder(orderId: string): Promise<OrderInvestigationView> {
    const order = await this.orderRepo.getById(orderId);
    if (!order) {
      throw ArrivalError.notFound(`Order ${orderId} not found`);
    }

    const [paymentAttempt, fulfilmentAttempt, events, compensations, audits] = await Promise.all([
      this.paymentRepo.getLatestByOrderId(orderId),
      this.fulfilmentRepo.getLatestByOrderId(orderId),
      this.orderRepo.getEvents(orderId),
      this.auditRepo.listCompensationsByOrder(orderId),
      this.auditRepo.listAuditByResource('order', orderId),
    ]);

    return {
      order,
      paymentAttempt,
      fulfilmentAttempt,
      events,
      compensations,
      audits,
      piiMasked: true,
    };
  }

  async listDeadLetterOutbox(): Promise<OutboxMessage[]> {
    return this.outboxRepo.listDeadLetter(100);
  }

  async replayDeadLetterOutbox(params: {
    messageId: string;
    actorId: string;
    actorRole: OperatorRole;
    reason: string;
    requestId?: string;
  }): Promise<{ replayed: boolean }> {
    if (!params.reason || params.reason.trim().length < 5) {
      throw ArrivalError.badRequest('A descriptive reason (min 5 chars) is required for operational replay');
    }

    const dlq = await this.outboxRepo.listDeadLetter(200);
    const target = dlq.find((m) => m.id === params.messageId);
    if (!target) {
      throw ArrivalError.notFound(`Dead-letter outbox message ${params.messageId} not found or already published`);
    }

    // Record mandatory audit evidence BEFORE mutating state so privileged actions never succeed unaudited
    await this.auditRepo.recordAudit({
      id: randomUUID(),
      actorId: params.actorId,
      actorRole: params.actorRole,
      action: 'outbox_dead_letter_replay',
      resourceType: 'outbox',
      resourceId: params.messageId,
      reason: params.reason,
      requestId: params.requestId || null,
      occurredAt: new Date().toISOString(),
      metadataRedacted: { eventType: target.eventType },
    });

    const replayed = await this.outboxRepo.replayDeadLetter(params.messageId);
    if (!replayed) {
      throw ArrivalError.notFound(`Dead-letter outbox message ${params.messageId} not found or already published`);
    }

    return { replayed: true };
  }

  async listFailedWebhooks(): Promise<WebhookInboxMessage[]> {
    return this.webhookRepo.listFailed(100);
  }

  async listReconciliationPayments(): Promise<PaymentAttemptRecord[]> {
    return this.paymentRepo.listReconciliationRequired(100);
  }

  async resolvePaymentReconciliation(params: {
    orderId: string;
    resolvedState: PaymentState;
    actorId: string;
    actorRole: OperatorRole;
    reason: string;
    requestId?: string;
  }): Promise<PaymentAttemptRecord> {
    if (!params.reason || params.reason.trim().length < 5) {
      throw ArrivalError.badRequest('A descriptive resolution reason is required');
    }

    const attempt = await this.paymentRepo.getLatestByOrderId(params.orderId);
    if (!attempt) {
      throw ArrivalError.notFound(`No payment attempt found for order ${params.orderId}`);
    }
    if (attempt.state !== 'reconciliation_required') {
      throw ArrivalError.conflict(`Payment attempt is in state "${attempt.state}", not "reconciliation_required"`);
    }
    if (!canTransitionPayment(attempt.state, params.resolvedState)) {
      throw ArrivalError.unprocessableEntity(
        `Cannot resolve reconciliation_required payment to "${params.resolvedState}"`
      );
    }

    await this.auditRepo.recordAudit({
      id: randomUUID(),
      actorId: params.actorId,
      actorRole: params.actorRole,
      action: 'payment_reconciliation_resolved',
      resourceType: 'order',
      resourceId: params.orderId,
      reason: params.reason,
      requestId: params.requestId || null,
      occurredAt: new Date().toISOString(),
      metadataRedacted: {
        paymentAttemptId: attempt.id,
        fromState: attempt.state,
        toState: params.resolvedState,
      },
    });

    const updated = await this.paymentRepo.updateState(attempt.id, params.resolvedState);
    return updated!;
  }

  async listCapabilities(): Promise<ProviderCapability[]> {
    return this.capabilityRepo.listAllCapabilities();
  }

  async suspendCapability(params: {
    capabilityId: string;
    actorId: string;
    actorRole: OperatorRole;
    reason: string;
    requestId?: string;
  }): Promise<{ suspended: boolean }> {
    if (!params.reason || params.reason.trim().length < 5) {
      throw ArrivalError.badRequest('A descriptive reason is required to suspend a capability');
    }

    const allCaps = await this.capabilityRepo.listAllCapabilities();
    if (!allCaps.some((c) => c.id === params.capabilityId)) {
      throw ArrivalError.notFound(`Capability ${params.capabilityId} not found`);
    }

    await this.auditRepo.recordAudit({
      id: randomUUID(),
      actorId: params.actorId,
      actorRole: params.actorRole,
      action: 'capability_suspended',
      resourceType: 'provider_capability',
      resourceId: params.capabilityId,
      reason: params.reason,
      requestId: params.requestId || null,
      occurredAt: new Date().toISOString(),
      metadataRedacted: {},
    });

    const suspended = await this.capabilityRepo.suspendCapability(params.capabilityId, params.reason);
    if (!suspended) {
      throw ArrivalError.notFound(`Capability ${params.capabilityId} not found`);
    }

    return { suspended: true };
  }
}

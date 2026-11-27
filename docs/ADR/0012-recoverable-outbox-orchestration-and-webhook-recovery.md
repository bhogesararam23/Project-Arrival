# 0012 — Recoverable Outbox Orchestration and Pending Webhook Recovery

**Status:** Accepted  
**Date:** 2026-11-27  
**Author:** Principal Engineer / Distributed Systems Architect  

## Context

In Milestone 3, `OrderService.submitOrder()` executed payment and POS calls synchronously after committing the order, while `index.ts` registered no-op logging handlers on `OutboxWorker`. Similarly, `WebhookService` dispatched webhook events inline immediately after `webhook_inbox` insertion, leaving no recovery mechanism if a process crashed between inbox persistence and event dispatch.

## Decision

1. **Idempotent `OrderOrchestrator` Bound to `OutboxWorker`:**
   - `OrderService.submitOrder()` atomically commits the quote consumption, `orders` (`submitted`), `payment_attempts` (`requires_action`), `fulfilment_attempts` (`quoted`), `order_items`, `guest_order_grants`, and `outbox` (`order_submitted`) in a single database transaction before any external call.
   - `OrderOrchestrator` provides idempotent handlers (`order_submitted`, `order_compensation_requested`, `order_compensation_refunded`) wired directly into `OutboxWorker`.
   - Supporting `asyncOnly: true` allows pure asynchronous API-to-worker execution, while inline orchestration claims and completes the outbox message safely without breaking synchronous callers.

2. **Durable Webhook Recovery & Bounded Payment Refunds:**
   - `PgWebhookInboxRepository.claimPendingBatch()` claims `status = 'pending'` verified inbox rows with `FOR UPDATE SKIP LOCKED`, enabling `WebhookService.recoverPendingEvents()` to recover events stranded by a crash.
   - `PaymentOrchestrationService` enforces `capture()` and `partialRefund()` strictly bounded by `capturedAmount - refundedAmount`, preventing over-refunds.

3. **Mandatory Audit-Before-Mutation:**
   - `OperationsService` validates preconditions and persists `audit_records` before executing privileged state mutations so an audit failure never leaves an unaudited mutation.

## Consequences

- Crash recovery is verified across both `order_submitted` outbox jobs and `webhook_inbox` pending rows.
- Financial operations remain bounded and idempotent under retries and partial failures.

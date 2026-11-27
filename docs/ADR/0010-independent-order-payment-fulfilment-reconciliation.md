# 0010 — Independent Order, Payment, and Fulfilment Orchestration & Reconciliation

**Status:** Accepted  
**Date:** 2026-11-27  
**Author:** Principal Engineer / Backend Architect  

## Context

Previously, `OrderService.submitOrder()` executed `paymentAdapter.collectPayment()` before `createOrder()`, held synchronous external calls across order creation, and `PgOrderRepository.getById()` hardcoded `paymentState: 'authorized'` and `fulfilmentState: 'quote_pending'`. Uncertain provider timeouts had no explicit representation, creating risk of duplicate financial charges or lost orders.

## Decision

1. **Independent State Machines:**
   - Order (`OrderState`), Payment (`PaymentState`), Fulfilment (`FulfilmentState`), and Merchant POS (`MerchantOrderState`) maintain separate explicit transition tables (`canTransitionOrder`, `canTransitionPayment`, `canTransitionFulfilment`, `canTransitionMerchantOrder`).
   - Submitting an order or receiving a 202 HTTP response from a POS API transitions `merchantOrderState` to `submission_accepted_for_processing` and `orderState` to `awaiting_merchant` — never treating API receipt as proof of merchant preparation.

2. **Atomic Persistence Before External Side Effects:**
   - `PgOrderRepository.createOrder()` atomically consumes the quote (`WHERE consumed_at IS NULL AND expires_at > now()`), inserts `orders`, `order_items`, `guest_order_grants`, initial `order_events`, and `outbox` messages in a single PostgreSQL transaction without holding DB locks across external network calls.

3. **Explicit Uncertainty & Recoverable Compensation:**
   - Timeouts (`ProviderTimeoutError`) during payment authorization or POS submission query provider state when supported; if outcome remains uncertain, the operation transitions to `reconciliation_required` (or `submission_timeout`) and creates a `compensation_records` entry rather than blindly retrying a financial charge.
   - Merchant POS rejection transitions the order to `rejected` and triggers idempotent void/refund compensation via `PaymentOrchestrationService`.

## Consequences

- Prevents phantom charges and duplicate quote consumption under concurrency.
- Surfaces ambiguous external outcomes explicitly for operator investigation and safe resolution.

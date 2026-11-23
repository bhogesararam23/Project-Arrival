# Order, Payment and Fulfilment State Machines

The three lifecycles are independent aggregates. This formalizes the earlier illustrative lifecycle. Transitions are proposed; every adapter maps provider states and documents unsupported operations. State, event and outbox records commit atomically.

## Order

SUBMITTED → AWAITING_MERCHANT → ACCEPTED → PREPARING → READY_FOR_PICKUP → COMPLETED.

AWAITING_MERCHANT can transition to REJECTED, FAILED or CUSTOMER_CANCELLED. ACCEPTED/PREPARING can transition to MERCHANT_CANCELLED. READY_FOR_PICKUP can enter DELIVERY_EXCEPTION. Terminal completion/rejection/cancellation/failure is not reopened except by audited correction. DELIVERY_EXCEPTION needs an explicit resolution event. Merchant rejection does not imply payment void succeeded.

## Payment

NOT_STARTED → REQUIRES_ACTION → AUTHORIZED → CAPTURE_PENDING → CAPTURED. Provider-specific flows may collect directly without authorization; retain exact provider phase/evidence. AUTHORIZED → VOID_PENDING → VOIDED. CAPTURED → REFUND_PENDING → PARTIALLY_REFUNDED or REFUNDED. Uncertain/contradictory outcomes enter RECONCILIATION_REQUIRED; timeout does not mean failure. Cumulative refunds cannot exceed captured amount less successful refunds.

## Fulfilment

NOT_REQUESTED → QUOTE_PENDING → QUOTED → REQUESTED → ASSIGNMENT_PENDING → ASSIGNED → AT_PICKUP → PICKED_UP → IN_TRANSIT → DELIVERED. Cancellation/failure is allowed only where provider and operational phase allow; preserve requested action and provider confirmation. Courier location is a timestamped, access-controlled provider event with limited retention.

## Cross-state invariants

- Create order only from an unexpired, unused quote with current catalogue and verified route capability.
- Payment success is not merchant acceptance; merchant acceptance is not dispatch; dispatch is not delivery.
- Scope idempotency keys to operation and principal. Persist request hash and result. Reuse with different body returns conflict.
- Deduplicate inbox events by provider/account/event identity. If no stable event ID, use a documented digest/window.
- Retry documented transient errors only, with bounded exponential backoff and jitter. After a write timeout, query or reconcile before retrying.
- On merchant rejection, void authorization; refund a captured charge. If capture fails after acceptance, request merchant cancellation or operator exception; do not claim cancellation until confirmed.
- Dispatch only when merchant and payment policy permit. If dispatch fails after capture, coordinate cancellation and refund under merchant policy. Courier failure after preparation requires truthful exception handling, not fake progress.
- Partial refunds reference line/amount snapshots and obey cumulative caps.
- Record source, provider/account, occurred/received time, signature result and redacted payload. Browser redirects are not authoritative.
- Reconcile provider transaction/settlement state against internal attempts; provide aging and operator resolution before pilot.

## Adapter contract

Declare each operation's capabilities/markets, schemas, timeout, idempotency guarantee, retryable errors, webhook authentication, event ordering, quote expiry, reconciliation operation, and sandbox/production evidence. Unsupported operations return explicit typed unsupported results; never emulate.

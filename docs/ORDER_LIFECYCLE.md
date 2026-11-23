# Order, Payment and Fulfilment Lifecycles

These lifecycles are independent. Do not compress them into one status column.

## Order lifecycle (illustrative)

- DRAFT
- QUOTED
- SUBMITTED
- AWAITING_MERCHANT
- ACCEPTED
- PREPARING
- READY_FOR_PICKUP
- COMPLETED

Terminal/exception outcomes:
- REJECTED
- CUSTOMER_CANCELLED
- MERCHANT_CANCELLED
- FAILED
- DELIVERY_EXCEPTION

## Payment lifecycle (provider capability dependent)

- NOT_STARTED
- REQUIRES_ACTION
- AUTHORIZED
- CAPTURE_PENDING
- CAPTURED
- FAILED
- VOID_PENDING
- VOIDED
- REFUND_PENDING
- PARTIALLY_REFUNDED
- REFUNDED
- RECONCILIATION_REQUIRED

Do not assume every provider or payment method supports authorization before capture. Define compensation behavior for each integration.

## Fulfilment lifecycle

- NOT_REQUESTED
- QUOTE_PENDING
- QUOTED
- REQUESTED
- ASSIGNMENT_PENDING
- ASSIGNED
- AT_PICKUP
- PICKED_UP
- IN_TRANSIT
- DELIVERED
- FAILED
- CANCELLED

## Invariants

- Every transition is validated by the domain.
- Record event source, provider reference, event time and receipt time.
- Deduplicate provider events.
- Do not advance from a browser redirect alone.
- Do not mark delivery complete without an authoritative source or reviewed manual operation.
- Store an immutable purchase-time item/price/tax snapshot.
- Use idempotency keys for commands that can cause external side effects.
- Reconcile uncertain payment and fulfilment outcomes before retrying dangerous actions.

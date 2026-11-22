# Integration Contracts and Provider Policy

## Adapter domains

- Discovery/place providers.
- Merchant/POS/catalogue/order providers.
- Payment providers.
- Maps/geocoding/routing providers.
- Delivery/fulfilment providers.
- Notification providers.

## Rules

1. Domain code must not depend directly on a vendor SDK or vendor-specific status enum.
2. Each adapter must document supported operations and unsupported capabilities.
3. Normalize provider identifiers, currencies, timestamps and status events at the boundary.
4. Store provider request/response references safely for reconciliation, redacting personal data.
5. Verify webhook signatures and prevent replay/duplicates.
6. Use timeouts, bounded retries, circuit breakers where appropriate, and dead-letter handling.
7. Maintain contract tests against documented provider behavior.
8. Sandbox tests do not establish production approval or service availability.
9. Provider capability is location-specific; country support does not imply every city or address is serviceable.
10. Do not enable native checkout until all required merchant, payment and fulfilment capabilities have been verified.

## Capability vocabulary

A provider integration should declare:
- quote support;
- order create/cancel support;
- authorization/capture/refund support;
- dispatch/cancel support;
- courier assignment visibility;
- pickup/delivery milestones;
- live location support;
- webhook support;
- idempotency support;
- supported countries, currencies and service areas.

Unsupported methods must return explicit unsupported-capability results.

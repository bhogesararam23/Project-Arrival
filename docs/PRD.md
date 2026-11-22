# Product Requirements Document

**Version:** 0.1 · **Status:** Baseline for research and technical design

## 1. Summary

Project Arrival is a global restaurant discovery and native-ordering experience with genuine delivery orchestration. It connects customers, independent merchants, payment providers, and fulfilment operators. Arrival is not the food seller or delivery fleet.

## 2. Personas

- **Guest customer:** discovers restaurants, selects a destination, orders without mandatory registration, and follows the delivery.
- **Registered customer (optional):** receives convenience features such as saved destinations and order history.
- **Merchant operator:** manages menu and availability, accepts/rejects orders, and reports preparation/handover events.
- **Fulfilment operator:** accepts delivery requests and supplies assignment, pickup, tracking, and completion events where supported.
- **Arrival operator:** verifies merchants/providers, configures market capabilities, monitors exceptions, and handles operational support.

## 3. Core journeys

### Discovery
1. Customer opens the app without signing in.
2. Customer searches a country, city, neighbourhood, or restaurant.
3. Customer explores listings and sees clear data freshness and orderability states.
4. Customer may browse without granting location permission.

### Cross-location ordering
1. Customer selects a delivery destination manually or via an explicit location action.
2. Destination is independent of device location.
3. Search results are filtered by the destination's supported merchant/service area.
4. Customer can order for another recipient where providers and local requirements allow.

### Native order
1. Customer chooses one restaurant and menu items.
2. Server validates catalogue version, item availability, options, pricing, currency, taxes, fees, and delivery eligibility.
3. Server returns a time-limited checkout quote.
4. Customer confirms and initiates payment through an approved provider.
5. Merchant receives and explicitly accepts/rejects the order.
6. Payment capture/void/refund follows the provider's supported flow.
7. Fulfilment is created at the correct operational point.
8. Authenticated events update independent order, payment, and delivery timelines.
9. Customer receives a truthful completion or failure outcome.

Initial release should support one merchant per order. Multi-merchant baskets are out of scope.

## 4. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| DISC-01 | Search global destinations without GPS | P0 |
| DISC-02 | Search restaurants by name and geography | P0 |
| DISC-03 | Keep discovery separate from orderability | P0 |
| DATA-01 | Track source, license/terms, retrieval and verification timestamps | P0 |
| DATA-02 | Detect duplicates without destructive automatic merges | P1 |
| MENU-01 | Display merchant-authoritative or appropriately licensed menus | P0 |
| MENU-02 | Validate price and availability at checkout | P0 |
| CART-01 | Support one merchant, quantities, variants and modifiers | P0 |
| CHECK-01 | Calculate final totals on the server | P0 |
| CHECK-02 | Validate delivery eligibility and obtain a current delivery quote | P0 |
| ORDER-01 | Use idempotency for order submission | P0 |
| ORDER-02 | Require merchant acceptance or explicit rejection | P0 |
| PAY-01 | Use an approved market-compatible payment arrangement | P0 |
| PAY-02 | Verify provider webhooks and reconcile transactions | P0 |
| FUL-01 | Support merchant-managed and integrated third-party fulfilment | P0 |
| FUL-02 | Never invent courier location or delivery events | P0 |
| GUEST-01 | Support anonymous browsing and guest checkout | P0 |
| PRIV-01 | Make GPS optional and minimize personal data | P0 |
| ACCOUNT-01 | Support optional accounts without gating core discovery | P1 |
| MERCH-01 | Provide a real merchant order acceptance path for the live pilot | P0 |

P0 means required before a real transaction pilot, not necessarily before a discovery-only preview.

## 5. Capability and availability model

A merchant listing may be:
- discoverable
- verification_pending
- verified
- temporarily_unavailable
- suspended

Ordering capability is independent:
- not_integrated
- catalogue_only
- merchant_ordering_ready
- payment_ready
- fulfilment_ready
- native_orderable

The backend must derive orderability from verified capabilities for the exact merchant location and delivery destination. Country-level support alone is insufficient.

## 6. Quality requirements

- Secure-by-default access control and tenant isolation.
- Explicit currency and integer minor units for money.
- UTC timestamps, local presentation.
- Observable, auditable transactional workflows.
- Idempotent writes and duplicate webhook handling.
- Tested backup/restore and incident recovery.
- Accessible, responsive premium interface.
- Localization-ready data model.
- Honest degraded states when providers fail.
- Documented retention and deletion policies.

## 7. Success measures

Primary outcome: successfully completed real deliveries.

Supporting measures:
- Verified discoverable merchant coverage.
- Native-orderable coverage by service area.
- Menu freshness.
- Merchant acceptance rate.
- Payment success and reconciliation accuracy.
- Delivery assignment and completion rates.
- Delivery exception rate.
- Guest checkout completion.
- Repeat usage.
- Cost and operational effort per completed order.

Do not optimize for raw listing count if data quality or orderability declines.

## 8. Out of scope

General retail, groceries, proprietary inventory, owned courier operations, multi-merchant baskets, loyalty gamification, advertising marketplace, and AI recommendations are deferred.

## 9. Launch gates

No market may accept live orders until merchant contracts/permissions, payment and settlement arrangement, fulfilment capability, consumer disclosures, privacy requirements, support process, refund handling, security review, and operational monitoring are validated.

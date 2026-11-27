# Milestone 3 Forensic Audit — Project Arrival

**Audit Date:** 2026-11-27  
**Baseline Commit:** `f33c0cd86cf312eaf9ba30cc5f914203d01addc3` (Merged PR #4)  
**Target Branch:** `feat/transaction-platform-operations`  
**Environment Notes:** Local Docker Desktop daemon is not running (`npipe:////./pipe/dockerDesktopLinuxEngine` unavailable) and `psql` is not installed locally; PostgreSQL integration tests must be wired into CI with a pinned PostgreSQL/PostGIS service container and gated locally via `TEST_DATABASE_URL`.

---

## Summary of Critical Findings

| Finding ID | Severity | Area | Status |
|---|---|---|---|
| AUD-001 | Critical | PostgreSQL Order Insertion & Foreign Keys | Open |
| AUD-002 | Critical | PostgreSQL Order State & Event Reconstruction | Open |
| AUD-003 | Critical | PostgreSQL Quote Persistence, Items & Atomic Consumption | Open |
| AUD-004 | Critical | Order-to-Payment & Fulfilment State Persistence | Open |
| AUD-005 | High | Order Submission Transaction Boundary & External Calls | Open |
| AUD-006 | Critical | Outbox Atomic Claiming (`FOR UPDATE SKIP LOCKED`), Leases & DLQ | Open |
| AUD-007 | Critical | Webhook Ingress, Signature Verification & Replay Protection | Open |
| AUD-008 | Critical | Idempotency Concurrent Insert Race (`23505`) | Open |
| AUD-009 | Critical | Hardcoded `orderability: 'native_orderable'` in `PgPlacesRepository` | Open |
| AUD-010 | High | Mock Providers Marked `production_verified` in Fixtures | Open |
| AUD-011 | High | Capability Governance Schema Gaps (Account, Merchant, Statuses) | Open |
| AUD-012 | High | Migration Advisory Lock Pool Connection Mismatch & Silent Bypass | Open |
| AUD-013 | Medium | Database Pool Timeouts, Graceful Shutdown & Readiness Check | Open |
| AUD-014 | High | Missing Operations Control Plane & RBAC Enforcement | Open |
| AUD-015 | Medium | Pricing Policy Currency Exponents & US/CA Tax Handling | Open |
| AUD-016 | Medium | Frontend Cart, Quote, Checkout & Order Timeline Missing | Open |
| AUD-017 | Medium | OpenAPI Spec Drift vs Implemented Routes | Open |
| AUD-018 | High | Real PostgreSQL Integration Test Suite Missing | Open |

---

## Detailed Findings

### AUD-001 — PostgreSQL Order Insertion Uses Fabricated Random UUIDs for Relational FKs
- **Severity:** Critical
- **Affected Files:** `packages/database/src/repositories/orders.ts` (lines 20–36)
- **Actual Observed Behavior:** `PgOrderRepository.createOrder` inserts `gen_random_uuid()` for both `delivery_address_id` and `idempotency_record_id`, and leaves `guest_session_id` / `customer_id` unset (violating `CHECK(num_nonnulls(customer_id, guest_session_id) = 1)` in `001_initial_platform.sql:144`). Both `delivery_address_id` and `idempotency_record_id` have `REFERENCES` foreign-key constraints that will fail on a real PostgreSQL instance.
- **Expected Behavior:** `createOrder` must reference the actual persisted `delivery_address_id`, `idempotency_record_id`, `guest_session_id` (or `customer_id`), and `quote_id`, and insert normalized `order_items` rows alongside `purchase_snapshot`.
- **Evidence:** `packages/database/src/repositories/orders.ts:25-35` vs `packages/database/migrations/001_initial_platform.sql:135-145`.
- **Required Correction:** Carry real relational IDs from `QuoteService` -> `OrderService` -> `PgOrderRepository`, insert `delivery_addresses` and `order_items`, and atomically consume the quote in the same transaction.
- **Verification Test:** Real PostgreSQL integration test executing full quote -> order -> retrieval -> FK constraint verification.
- **Status:** Open (to be fixed in Phase 1).

### AUD-002 — PostgreSQL Order Retrieval Hardcodes Payment/Fulfilment States & Corrupts Events
- **Severity:** Critical
- **Affected Files:** `packages/database/src/repositories/orders.ts` (lines 76–139)
- **Actual Observed Behavior:**
  - `getById()` hardcodes `paymentState: 'authorized'` and `fulfilmentState: 'quote_pending'` instead of reading `payment_attempts` and `fulfilment_attempts`.
  - `getEvents()` maps any non-`'merchant'` source to `'arrival_operator'`, losing `'payment'`, `'fulfilment'`, and `'arrival_api'`.
  - `recordEvent()` hardcodes `to_state = 'completed'` regardless of actual state transition.
- **Expected Behavior:** `getById()` must reconstruct `orderState`, latest `paymentState`, and latest `fulfilmentState` from PostgreSQL tables. `recordEvent()` must record the actual `from_state`, `to_state`, and `source`.
- **Evidence:** `packages/database/src/repositories/orders.ts:91-97, 110-131`.
- **Required Correction:** Query `payment_attempts` and `fulfilment_attempts` (or lateral/subquery join) in `getById()`, and pass explicit `fromState`/`toState` into `recordEvent()`.
- **Verification Test:** PostgreSQL integration test verifying `getById()` and `getEvents()` across state transitions.
- **Status:** Open (to be fixed in Phase 1).

### AUD-003 — PostgreSQL Quote Persistence Drops Items, Hardcodes Service Fee, & Lacks Atomic Consumption
- **Severity:** Critical
- **Affected Files:** `packages/database/src/repositories/quotes.ts` (lines 16–107), `packages/database/migrations/001_initial_platform.sql`
- **Actual Observed Behavior:**
  - `PgQuotesRepository.save()` hardcodes `'50'` for `service_fee_minor` instead of persisting the pricing policy's `serviceFeeMinor`, inserts `gen_random_uuid()` for `delivery_address_id` (FK violation), and does not persist `items` (enriched line items & modifier selections) or `quote_ref`.
  - `PgQuotesRepository.getById()` returns `items: []`.
  - `PgQuotesRepository.markConsumed()` runs `UPDATE checkout_quotes SET consumed_at = now() WHERE id = $1` without `AND consumed_at IS NULL`, allowing concurrent order submissions on the same quote.
- **Expected Behavior:** Quotes must persist `delivery_address_id`, `service_fee_minor` from policy, `provider_quote_ref`, and `items_snapshot` (via migration), reconstruct all items on `getById()`, and consume atomically (`WHERE id = $1 AND consumed_at IS NULL AND expires_at > now() RETURNING id`).
- **Evidence:** `packages/database/src/repositories/quotes.ts:23, 40, 97, 104`.
- **Required Correction:** Add migration `004_milestone3_core.sql` adding `items_snapshot jsonb` to `checkout_quotes`, fix `save()`/`getById()`, and implement atomic `consumeQuote()`.
- **Verification Test:** Concurrent quote consumption integration test proving only 1 of N parallel requests succeeds.
- **Status:** Open (to be fixed in Phase 1).

### AUD-004 — Order-to-Payment & Fulfilment State Persistence Missing in PostgreSQL
- **Severity:** Critical
- **Affected Files:** `packages/database/src/repositories/orders.ts`, `apps/api/src/services/order-service.ts`
- **Actual Observed Behavior:** `payment_attempts`, `payment_events`, `refunds`, `fulfilment_attempts`, and `fulfilment_events` tables exist in `001_initial_platform.sql`, but no repository methods read or write to them.
- **Expected Behavior:** Independent repositories/services for Payment Orchestration and Fulfilment Orchestration persisting attempts, provider refs, states, refunds, and events.
- **Evidence:** `grep` across `packages/database/src/repositories/` shows zero references to `payment_attempts`, `payment_events`, `refunds`, `fulfilment_attempts`.
- **Required Correction:** Implement `PgPaymentRepository` and `PgFulfilmentRepository` (and in-memory equivalents) with explicit state machines.
- **Verification Test:** Unit and PostgreSQL integration tests for payment authorization, capture, void, refund, and reconciliation_required transitions.
- **Status:** Open (to be fixed in Phases 1 & 2).

### AUD-005 — Order Submission Holds Synchronous External Calls Inline & Lacks Recoverable Orchestration
- **Severity:** High
- **Affected Files:** `apps/api/src/services/order-service.ts` (lines 98–215)
- **Actual Observed Behavior:** `submitOrder()` calls `paymentAdapter.collectPayment()` BEFORE `createOrder()`, then calls `posAdapter.submitOrder()` synchronously after `createOrder()`. If `posAdapter.submitOrder()` times out or the process crashes between payment collection and `createOrder()`, the customer is charged with no order record, or the order sits in `submitted` without POS reconciliation.
- **Expected Behavior:** Persist quote consumption, order (`submitted`), payment intent, and outbox job atomically in a single DB transaction FIRST; process external payment/POS/fulfilment calls asynchronously via recoverable outbox workers with explicit `reconciliation_required` handling on timeouts.
- **Evidence:** `apps/api/src/services/order-service.ts:99-172`.
- **Required Correction:** Decouple DB commit from external provider calls; introduce Payment & Merchant orchestration services, explicit timeout/uncertainty handling (`reconciliation_required`), and recoverable worker processing.
- **Verification Test:** Scenario C (merchant rejection + compensation) and Scenario D (payment timeout -> `reconciliation_required`).
- **Status:** Open (to be fixed in Phase 2).

### AUD-006 — Outbox Lacks Atomic Claiming (`FOR UPDATE SKIP LOCKED`), Worker Leases, Retries & DLQ
- **Severity:** Critical
- **Affected Files:** `packages/database/src/repositories/outbox.ts`, `packages/contracts/src/outbox.ts`
- **Actual Observed Behavior:** `PgOutboxRepository` only implements `publish()` and a bare `SELECT ... LIMIT $1` in `fetchPending()`. There is no `FOR UPDATE SKIP LOCKED`, no `worker_id` / `lease_token`, no `dead_lettered_at`, no retry backoff, and no worker daemon.
- **Expected Behavior:** Atomic claiming with `FOR UPDATE SKIP LOCKED`, bounded exponential backoff with jitter, max attempts -> dead-letter state, and manual replay.
- **Evidence:** `packages/database/src/repositories/outbox.ts:30-57`.
- **Required Correction:** Add dead-letter/worker columns via migration `004_milestone3_core.sql`, implement `claimBatch()`, `complete()`, `scheduleRetry()`, `deadLetter()`, and `replayDeadLetter()`, plus an outbox worker runner.
- **Verification Test:** Concurrent worker claiming test and lease-expiry crash-recovery test (Scenario E).
- **Status:** Open (to be fixed in Phase 3).

### AUD-007 — Webhook Ingress & Inbox Processing Not Implemented
- **Severity:** Critical
- **Affected Files:** `packages/database/migrations/001_initial_platform.sql` (`webhook_inbox` table exists, zero TypeScript implementation)
- **Actual Observed Behavior:** No webhook route, signature verifier, timestamp replay protection, or inbox repository exists.
- **Expected Behavior:** Provider-neutral webhook ingress verifying HMAC/protocol signatures and timestamps before persisting to `webhook_inbox`, deduplicating on `(provider_key, provider_account_ref, provider_event_ref)`, and dispatching to order/payment/fulfilment orchestrators.
- **Evidence:** `apps/api/src/routes/` has no webhook route; `packages/database/src/repositories/` has no inbox repository.
- **Required Correction:** Implement `PgWebhookInboxRepository`, `WebhookService`, deterministic test signature verifier, and `/v1/webhooks/:providerKey` route.
- **Verification Test:** Scenario F (valid signature, duplicate replay deduplication, invalid signature rejection, expired timestamp rejection).
- **Status:** Open (to be fixed in Phase 3).

### AUD-008 — Idempotency Concurrent Insert Race Condition (`23505`)
- **Severity:** Critical
- **Affected Files:** `packages/database/src/repositories/idempotency.ts` (lines 89–170)
- **Actual Observed Behavior:** `tryReserve` runs `SELECT ... FOR UPDATE`. When no row exists, `FOR UPDATE` acquires 0 locks, allowing two concurrent requests to both attempt `INSERT INTO idempotency_records`, causing a PostgreSQL `23505` unique constraint violation on the second request.
- **Expected Behavior:** Use `INSERT ... ON CONFLICT (principal_scope, operation, idempotency_key) DO NOTHING RETURNING ...` followed by `SELECT ... FOR UPDATE` inside the transaction (or handle conflict cleanly) so concurrent first-time requests never crash with 500.
- **Evidence:** `packages/database/src/repositories/idempotency.ts:89-169`.
- **Required Correction:** Rewrite `tryReserve()` using `INSERT ... ON CONFLICT DO NOTHING` before `SELECT ... FOR UPDATE`.
- **Verification Test:** Concurrent idempotency reservation test against real PostgreSQL.
- **Status:** Open (to be fixed in Phase 1).

### AUD-009 — `PgPlacesRepository` Hardcodes `orderability: 'native_orderable'` for Every Location
- **Severity:** Critical
- **Affected Files:** `packages/database/src/repositories/places.ts` (lines 86, 141)
- **Actual Observed Behavior:** Both `search()` and `getLocation()` unconditionally return `orderability: 'native_orderable'` for all locations, ignoring `provider_capabilities` and `merchant_id` verification state!
- **Expected Behavior:** Derive `orderability` from actual `provider_capabilities` (`production_verified`, unexpired) and `listing_status`, defaulting to `'discovery_only'` or `'catalogue_only'` when native ordering is unverified.
- **Evidence:** `packages/database/src/repositories/places.ts:86, 141`.
- **Required Correction:** Query `provider_capabilities` and `catalogues` status to compute truthful `orderability`.
- **Verification Test:** Integration test verifying an unverified location returns `catalogue_only` or `discovery_only` instead of `native_orderable`.
- **Status:** Open (to be fixed in Phase 1 & 4).

### AUD-010 — Fixture Capabilities Mark Mock Providers as `production_verified`
- **Severity:** High
- **Affected Files:** `apps/api/src/repositories/in-memory.ts` (lines 215–247)
- **Actual Observed Behavior:** `FIXTURE_CAPABILITIES` sets `status: 'production_verified'` for `mock_pos`, `mock_payment`, and `mock_delivery` with internal-looking URLs (`https://arrival.internal/audit/pilot-uk-001`).
- **Expected Behavior:** Default `FIXTURE_CAPABILITIES` must never mark mock providers as `production_verified` in production/default registries. Expanded capability statuses (`not_configured`, `researching`, `sandbox_available`, `sandbox_verified`, `pending_commercial_approval`, `pending_merchant_approval`, `production_verified`, `suspended`, `revoked`, `expired`) must be supported, and tests requiring sandbox/order flow must explicitly inject test-only `SYNTHETIC_TEST_CAPABILITIES`.
- **Evidence:** `apps/api/src/repositories/in-memory.ts:215-247`.
- **Required Correction:** Default `InMemoryCapabilityRepository` to `sandbox_verified` for mock providers (so production capability gates fail closed by default), and provide explicit `SYNTHETIC_TEST_CAPABILITIES` strictly for controlled unit/E2E tests.
- **Verification Test:** Regression tests proving mock providers fail closed by default, and expired/revoked/wrong-merchant/wrong-market capabilities are rejected.
- **Status:** Open (to be fixed in Phase 4).

### AUD-011 — Capability Registry Schema Lacks Account, Merchant, Reviewer, and Revocation Fields
- **Severity:** High
- **Affected Files:** `packages/database/migrations/001_initial_platform.sql:208-215`, `packages/contracts/src/capabilities.ts`
- **Actual Observed Behavior:** `provider_capabilities` lacks `provider_account_ref`, `merchant_id`, `reviewed_by`, `revoked_at`, `revocation_reason`, and the full status enum (`not_configured`, `researching`, `sandbox_available`, `sandbox_verified`, `pending_commercial_approval`, `pending_merchant_approval`, `production_verified`, `suspended`, `revoked`, `expired`).
- **Expected Behavior:** Full capability governance schema and contract supporting all lifecycle states, evidence, reviewer identity, expiry, and revocation.
- **Evidence:** `packages/database/migrations/001_initial_platform.sql:208-215`.
- **Required Correction:** Add columns & update status check constraint in migration `004_milestone3_core.sql`, update `@arrival/contracts` and `PgCapabilityRepository`.
- **Verification Test:** Migration and capability governance tests.
- **Status:** Open (to be fixed in Phase 4).

### AUD-012 — Migration Advisory Lock Pool Connection Mismatch & Silent Bypass
- **Severity:** High
- **Affected Files:** `packages/database/src/migrator.ts` (lines 57–73)
- **Actual Observed Behavior:** `DatabaseMigrator` calls `this.client.query('SELECT pg_advisory_lock($1)')` on `MigrationClient` (which can be a `pg.Pool`), meaning `pg_advisory_lock` and `pg_advisory_unlock` may execute on different pooled connections! Furthermore, `acquireLock()` catches errors and returns `false`, silently continuing without a lock!
- **Expected Behavior:** Pin a dedicated single `pg.PoolClient` for the entire migration run when using a pool, and fail closed if advisory lock acquisition fails in non-mock environments.
- **Evidence:** `packages/database/src/migrator.ts:57-76`.
- **Required Correction:** Support dedicated connection / `requireLock` option (default `true` for real DBs), fail if lock cannot be acquired, and ensure lock+migrations+unlock run on the same session client.
- **Verification Test:** Migrator unit test verifying fail-closed on lock failure + real PG test.
- **Status:** Open (to be fixed in Phase 9).

### AUD-013 — Database Pool Configuration, Graceful Shutdown & Readiness Check Incomplete
- **Severity:** Medium
- **Affected Files:** `packages/database/src/client.ts`, `apps/api/src/routes/health.ts`, `apps/api/src/index.ts`
- **Actual Observed Behavior:** `createDatabasePool` lacks `connectionTimeoutMillis` and `statement_timeout`; `GET /health/ready` hardcodes `{ status: 'ready', database: 'connected' }` without actually querying the database (`SELECT 1`); `index.ts` has no `SIGINT`/`SIGTERM` graceful shutdown for Fastify, workers, and `pool.end()`.
- **Expected Behavior:** Configured pool timeouts, real DB connectivity check in `/health/ready` returning `503` when DB is unreachable, and graceful shutdown hooks.
- **Evidence:** `apps/api/src/routes/health.ts:12-14`, `packages/database/src/client.ts:10-17`.
- **Required Correction:** Update `client.ts`, `health.ts`, and `index.ts`.
- **Verification Test:** Health readiness tests (connected vs disconnected DB).
- **Status:** Open (to be fixed in Phases 9 & 11).

### AUD-014 — Operations Control Plane & RBAC Not Implemented
- **Severity:** High
- **Affected Files:** `apps/api/src/routes/`, `packages/database/migrations/001_initial_platform.sql` (`audit_records` exists, no API/service)
- **Actual Observed Behavior:** No operator overview, order investigation (with masked PII), outbox replay/DLQ inspection, webhook failure inspection, reconciliation resolution, or capability suspension endpoints exist.
- **Expected Behavior:** Authenticated, role-checked (`/v1/ops/...`) endpoints distinguishing `ops_readonly` vs `ops_admin`, writing immutable `audit_records` for every privileged action.
- **Evidence:** `apps/api/src/routes/` directory listing.
- **Required Correction:** Implement `OperationsService`, operator RBAC middleware, and `/v1/ops/*` routes with full audit logging.
- **Verification Test:** Negative RBAC tests (`ops_readonly` cannot mutate; unauthenticated returns 401/403) and audit trail tests.
- **Status:** Open (to be fixed in Phase 7).

### AUD-015 — Currency Exponents & Destination Tax Policies Need Hardening
- **Severity:** Medium
- **Affected Files:** `packages/contracts/src/money.ts`, `apps/api/src/services/pricing-policy.ts`, `apps/web/src/components/RestaurantDetail.tsx`
- **Actual Observed Behavior:** `apps/web` `formatPrice()` divides unconditionally by `100` (incorrect for JPY exponent 0 or KWD/BHD exponent 3). `DefaultPricingPolicy` sets `taxRateBasisPoints: 0` for `US/USD` without destination tax breakdown or tax-inclusive vs tax-exclusive distinction.
- **Expected Behavior:** Exponent-aware formatting in contracts & web; explicit `taxInclusive` flag and auditable breakdown in pricing policy.
- **Evidence:** `apps/web/src/components/RestaurantDetail.tsx:36-40`, `apps/api/src/services/pricing-policy.ts:46-50`.
- **Required Correction:** Add `CURRENCY_EXPONENTS` formatting helper in `@arrival/contracts`, reuse in web, and enrich `PricingBreakdown`.
- **Verification Test:** Zero-decimal (JPY) and three-decimal (KWD) money/pricing tests.
- **Status:** Open (to be fixed in Phase 5).

### AUD-016 — Customer Checkout Preparation & Order Tracking Timeline Incomplete
- **Severity:** Medium
- **Affected Files:** `apps/web/src/App.tsx`, `apps/web/src/components/RestaurantDetail.tsx`, `apps/web/src/api/client.ts`
- **Actual Observed Behavior:** Web app only has a basic item counter (`Cart: N items`), no modifier selection UI, no destination entry, no server-authoritative quote request/breakdown, no order submission/gate explanation, and no persisted order tracking timeline. `RestaurantDetail.tsx` also strips `[SYNTHETIC TEST FIXTURE]` and labels items `"Verified Test Fixture"`.
- **Expected Behavior:** Complete cart, destination input, server-authoritative quote breakdown, clear capability gate (no fake checkout), and secure order timeline from persisted events, with clear synthetic-data labeling.
- **Evidence:** `apps/web/src/App.tsx:53, 95-97`, `apps/web/src/components/RestaurantDetail.tsx:80-81`.
- **Required Correction:** Build Cart, Quote/Checkout Preparation, and Order Tracking components in `apps/web` with accessibility and integration tests.
- **Verification Test:** Frontend component & integration tests covering Scenarios A, B, and G.
- **Status:** Open (to be fixed in Phase 6).

### AUD-017 — OpenAPI Spec Drift & Missing Schemas
- **Severity:** Medium
- **Affected Files:** `docs/api/openapi.yaml`, `apps/api/test/openapi-conformance.test.ts`
- **Actual Observed Behavior:** OpenAPI spec needs synchronization with new operational, webhook, capability, payment/fulfilment, and quote breakdown schemas.
- **Expected Behavior:** `docs/api/openapi.yaml` matches every implemented endpoint, request/response schema, auth requirement, and RFC 9457 error code.
- **Evidence:** Inspection of `docs/api/openapi.yaml` vs `apps/api/src/routes/`.
- **Required Correction:** Update `docs/api/openapi.yaml` and expand `openapi-conformance.test.ts`.
- **Verification Test:** `openapi-conformance.test.ts` verifying route & schema parity.
- **Status:** Open (to be fixed in Phase 12).

### AUD-018 — No Real PostgreSQL Integration Test Suite or CI Postgres Service
- **Severity:** High
- **Affected Files:** `packages/database/test/`, `.github/workflows/ci.yml`
- **Actual Observed Behavior:** Existing tests in `packages/database/test/` (`migrator.test.ts`, `indexes.test.ts`, `schema-validation.test.ts`) only use mock query clients and regex/string assertions on `.sql` files. CI does not run a PostgreSQL/PostGIS service.
- **Expected Behavior:** Real PostgreSQL + PostGIS integration test suite executing all migrations, constraints, repositories, concurrency locks, and rollbacks, wired into `.github/workflows/ci.yml`.
- **Evidence:** `packages/database/test/migrator.test.ts`, `.github/workflows/ci.yml`.
- **Required Correction:** Create `packages/database/test/postgres.integration.test.ts` (and API PG integration tests) and add `postgis/postgis:16-3.4` service to CI.
- **Verification Test:** Executed against real PostgreSQL in CI; locally documented if Docker daemon is stopped.
- **Status:** Open (to be fixed in Phases 1 & 14).

# System Architecture

**Status:** Proposed baseline. Validate through research and architecture decision records before implementation.

## 1. Architecture style

Begin with a modular monolith, not microservices. Keep modules and provider boundaries explicit so independently scaling or extracting a module remains possible later.

## 2. Logical components

- **Customer client:** discovery, menu, destination, cart, checkout, order timeline.
- **Merchant console:** menu/availability administration and order acceptance.
- **Operations console:** merchant/provider verification, market capability configuration, exception handling.
- **API/application:** domain orchestration, authorization, input validation and rate limits.
- **Discovery:** global business records, source provenance, deduplication, geographic search.
- **Catalogue:** menus, items, modifiers, versions, prices and availability.
- **Checkout:** server-side validation and expiring quote.
- **Orders:** immutable purchase snapshot and order state machine.
- **Payments:** provider-neutral intents, authorization/capture/refund/reconciliation.
- **Fulfilment:** provider selection, quote, dispatch and tracking.
- **Notifications:** consent-aware transactional notifications.
- **Research/algorithms:** isolated, benchmarked modules; not on the critical path until justified.

## 3. Language strategy

### TypeScript — product and integration layer
Use for the web/PWA, API orchestration, provider adapters, schemas/contracts, and the initial modular monolith. Strict type checking is required.

### Rust — systems and reliability-sensitive components
Use when there is a concrete need for memory safety, concurrency, isolated workers, robust parsers, high-throughput ingestion, or compute-heavy algorithms. Expose stable contracts (HTTP/gRPC, message schema, or WASM where appropriate). Do not introduce Rust merely for language prestige.

### C++ — algorithm and performance research
Reserve for algorithms where C++'s ecosystem, hardware control, existing libraries, or measured performance justify it. Every component must have a clear interface, tests, benchmark suite, and reproducible build. Avoid duplicate implementations without a comparison objective.

### Dart / Flutter — future mobile client
Introduce when native mobile requirements and product evidence justify it. Reuse API contracts and generated/validated schemas; do not duplicate business rules in the mobile application.

### SQL — data model and database logic
Use migrations and reviewed SQL for PostgreSQL/PostGIS. Keep business-critical calculations testable and explicit.

**No production Python runtime is required by this language strategy.** Research tooling may use any language only when deliberately approved and isolated; it must not silently become a runtime dependency.

## 4. Data flow

Discovery ingestion -> normalization -> provenance/quality checks -> merchant/location records -> geographic search.

Checkout -> server validates menu version and availability -> computes price -> delivery quote and capability validation -> expiring quote -> order submission -> payment/merchant coordination -> fulfilment request -> verified events -> customer timeline.

## 5. Transaction boundaries

Order, payment and delivery are separate state machines. Use a transactional outbox for durable event publication and an inbox/deduplication table for incoming webhooks. External side effects cannot be assumed to participate in a database transaction; use idempotency, retries and explicit compensation/reconciliation.

## 6. Initial infrastructure direction

- React/Next.js + TypeScript customer application.
- TypeScript API, deployable to an edge/serverless runtime where limits fit.
- PostgreSQL with PostGIS.
- Background work through a durable queue/outbox pattern.
- Object storage for assets we have rights to store.
- Observability with structured logs, metrics, traces and error reporting.
- Separate development, test, sandbox and production environments.

Vendor choice and free-tier viability must be validated against current pricing, regional availability, backup, uptime, data-residency and contractual requirements before production.

## 7. Security boundaries

- Public discovery endpoints expose only approved public fields.
- Merchant users are tenant-scoped.
- Guest order access uses high-entropy tokens stored hashed.
- Administrative actions are role-controlled and audited.
- Secrets are not committed or exposed to clients.
- Provider webhooks are signature-verified and replay-resistant.
- Address and contact data are returned only to authorized parties for fulfilment.
- Payment card data remains with a compliant payment provider.

## 8. Failure behavior

Provider timeouts, stale catalogues, expired quotes, payment uncertainty, merchant rejection, courier unavailability and webhook duplication must be explicit states. Never silently treat an uncertain transaction as successful. Use reconciliation and operational queues for ambiguous outcomes.

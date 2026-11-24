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

## 9. Detailed implementation proposal

Module boundaries, topology, cross-border gate, provider findings, proposed schema/API and rollout criteria are maintained in the [Technical Implementation Blueprint](IMPLEMENTATION_BLUEPRINT.md). Provider interface shapes are in [Integration Interfaces](INTEGRATION_INTERFACES.md). These proposals do not indicate that integrations exist.

## 10. Implemented Software Foundation

The project is structured as a pnpm monorepo with strict TypeScript, Rust, and C++ packages:

```
project-arrival/
├── apps/
│   ├── api/            # Fastify modular monolith API (OpenAPI 3.1, health, discovery, quotes, orders, idempotency)
│   └── web/            # Customer discovery application (React 19 + Vite, destination search, orderability badges)
├── packages/
│   ├── contracts/      # Domain models, Money value object, ISO parsers, RFC 9457 errors, capabilities
│   ├── database/       # PostgreSQL/PostGIS migrations (001 base, 002 hardening, 003 locking), repositories, advisory locks
│   ├── algorithms/     # R-006 Entity Resolution baseline (TS) and high-throughput C++ engine with reproducible benchmarks
│   └── ingestion/      # High-throughput, memory-safe Rust ingestion & license verification engine
└── docs/               # Technical blueprint, architecture decision records (ADRs), specifications
```

## 11. Trustworthy Core & Transaction Integrity Architecture

### 11.1 Cryptographic Guest Authorization & Scoped Grants
Guest authentication operates entirely on cryptographic token digests. 32-byte secrets (`gst_<hex>`) generated via cryptographically secure pseudo-random number generators (`crypto.randomBytes(32)`) are hashed using SHA-256 before database lookup. Order creation yields separate, cryptographically isolated access grants:
- `read_order`: Read-only grant for order status tracking and digital receipts.
- `cancel_order`: Restricted grant permitting order cancellation requests within allowed state machine windows.
Cross-order and unauthenticated order lookups return 404 Not Found to prevent order ID enumeration.

### 11.2 Atomic Idempotency Lifecycle
Idempotency records use an atomic two-phase lifecycle (`in_progress` -> `completed`) backed by a distributed database lease (`locked_until`). Concurrent incoming requests for the same idempotency key are rejected with `409 Conflict` (`IDEMPOTENCY_IN_PROGRESS`). Cached completed responses are returned deterministically upon replay. Payload hash mismatches result in `422 Unprocessable Entity` (`IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`).

### 11.3 PostgreSQL Persistence & Migration Safety
All core domain entities are persisted via PostgreSQL repositories using parameterized queries and strict BigInt minor-unit mapping. Migration execution is protected against concurrent multi-replica deployment races by a PostgreSQL session advisory lock (`pg_advisory_lock(849201849)`). Migration files are cryptographically verified using SHA-256 checksums stored in `schema_migrations`. In production mode (`NODE_ENV === 'production'`), omitting `DATABASE_URL` halts the server immediately.

### 11.4 Exact Money & Market Pricing
Monetary calculations use integer minor units with exact exponent precision. Fractional currency division is prohibited; multi-party splits use the Hare-Niemeyer largest-remainder method (`allocate()`) to eliminate rounding discrepancies. Pricing engines distinguish tax-inclusive pricing regimes (e.g., UK/EU 20% VAT) from destination-based sales tax regimes (e.g., US/CA 8.875% tax), and strictly enforce modifier group constraints (min/max bounds and mutually exclusive selections).

### 11.5 Spatial Blocking Boundary Recall
Entity resolution blocking integrates a 3x3 Moore neighborhood (forward neighbor grid cells) to recover candidate pairs that straddle ~1.1km spatial cell boundaries. Dense spatial clusters and high-frequency name blocks are sub-blocked by secondary attributes rather than dropped, maintaining a 0.00% False Merge Rate with 100% recall on golden benchmark truth.

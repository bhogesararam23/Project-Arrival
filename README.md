# Project Arrival

**Discover. Order. Watch it arrive.**

Project Arrival is a global, guest-first restaurant discovery, native-ordering, and delivery-orchestration platform. It connects customers with independent restaurants and legitimate fulfilment providers through one premium experience.

> Discover something. Place a real order. Follow its real delivery.

## What Arrival is

Arrival helps people discover restaurants and cafes around the world, explore trustworthy menu information, choose a delivery destination independently of their current location, and complete an order inside the application where genuine merchant, payment, and fulfilment integrations are supported.

Arrival is a technology intermediary. Restaurants remain responsible for selling and preparing food; payment providers process payments under the relevant commercial arrangement; and restaurant-managed or third-party delivery operators fulfil deliveries.

## Product principles

- **Global discovery, honest availability:** a restaurant can be discoverable without being orderable.
- **Native checkout where supported:** checkout is enabled only when merchant acceptance, current pricing, payment, and real fulfilment are all operationally supported.
- **Guest-first privacy:** browsing does not require an account or GPS permission.
- **Independent destinations:** the delivery destination may differ from the customer's current location and may be in another country.
- **Real events only:** order and courier progress must come from authoritative merchant or provider events, never fabricated simulation.
- **Merchant independence:** Arrival does not own restaurants, prepare food, hold food inventory, or operate its own courier fleet.
- **Provider-independent engineering:** discovery, payment, mapping, merchant, and delivery providers are integrated behind replaceable adapters.

## Initial scope

The initial product focuses exclusively on restaurants, cafes, and food. The first engineering priorities are global discovery, data provenance, destination selection, merchant catalogues, native checkout, order orchestration, and genuine delivery tracking.

Broader commerce categories are explicitly out of scope until the restaurant experience is proven.

## Technology strategy

- **TypeScript:** primary web, API, domain orchestration, and integration layer.
- **Rust:** systems-oriented, reliability-sensitive, or performance-critical components when justified by evidence.
- **C++:** algorithm and performance research where benchmarks and engineering needs justify it.
- **Dart / Flutter:** future mobile client, reusing stable backend contracts.
- **SQL / PostgreSQL / PostGIS:** transactional, relational, and geospatial data.

The initial architecture is a modular TypeScript monolith with explicit domain boundaries and provider adapters. Additional languages are adopted deliberately, not for language-count or prestige. See [System architecture](docs/ARCHITECTURE.md) and [Engineering principles](docs/ENGINEERING.md).

## Documentation

- [Project brief](docs/PROJECT_BRIEF.md)
- [Product requirements](docs/PRD.md)
- [System architecture](docs/ARCHITECTURE.md)
- [Engineering principles](docs/ENGINEERING.md)
- [Security baseline](docs/SECURITY.md)
- [Privacy principles](docs/PRIVACY.md)
- [Data provenance strategy](docs/DATA_PROVENANCE.md)
- [Integration contracts](docs/INTEGRATIONS.md)
- [Technical implementation blueprint](docs/IMPLEMENTATION_BLUEPRINT.md)
- [Provider and data-source research](docs/research/PROVIDERS.md)
- [Proposed database schema and migration](docs/database/README.md)
- [Proposed OpenAPI contract](docs/api/openapi.yaml)
- [Provider integration interfaces](docs/INTEGRATION_INTERFACES.md)
- [Algorithm research roadmap](docs/research/ALGORITHMS.md)
- [Security and reliability design](docs/SECURITY_RELIABILITY.md)
- [Engineering backlog](docs/BACKLOG.md)
- [Order lifecycle](docs/ORDER_LIFECYCLE.md)
- [Roadmap](docs/ROADMAP.md)
- [Architecture decisions](docs/ADR/README.md)
- [Contributing](CONTRIBUTING.md)
- [AI and automation workflow](docs/AI_WORKFLOW.md)

## Current status

**Stage: Milestone 3 — Transaction Orchestration, Event Infrastructure, Operations Control Plane & End-to-End Customer Experience.**
- **PostgreSQL Persistence & Real Integration Suite:** Complete SQL repositories (`orders`, `quotes`, `payments`, `fulfilment`, `outbox`, `webhooks`, `audit`, `capabilities`, `places`, `catalogues`, `guest`, `idempotency`), migration `004_milestone3_core.sql`, dedicated-session advisory locking, pool timeouts, `/health/ready` DB probing, and real PostgreSQL + PostGIS integration tests wired in CI.
- **Recoverable Transaction Orchestration:** Independent state machines for Order, Payment, Fulfilment, and Merchant POS; atomic quote consumption; immutable purchase snapshots; POS rejection compensation; and explicit `reconciliation_required` handling on provider timeouts.
- **Durable Outbox & Webhook Inbox:** `FOR UPDATE SKIP LOCKED` worker claiming, bounded concurrency, exponential backoff + jitter, dead-letter queue, and signature-first replay-resistant webhook ingress.
- **Operations Control Plane & Fail-Closed Capabilities:** Authenticated `/v1/ops/*` endpoints with `ops_readonly` vs `ops_admin` RBAC, PII masking, and immutable `audit_records`. Mock providers default to `sandbox_verified` and fail closed unless explicitly configured for controlled synthetic tests.
- **Customer Checkout Preparation & Order Tracking:** React client basket, destination entry, server-authoritative quote breakdown, capability gate, and persisted order event timeline.
- **Security & Guest Auth:** Cryptographic token digest guest authentication (SHA-256), elimination of simulated tokens, granular scoped access grants (`read_order` vs `cancel_order`), and order enumeration protection (404 on unauthenticated lookup).
- **Transaction Integrity & Money Arithmetic:** Exact integer minor-unit Money calculations using BigInt without floating-point drift, Hare-Niemeyer largest-remainder allocation (`allocate()`), market-specific pricing rules (UK/EU tax-inclusive VAT vs US/CA destination sales tax), modifier group constraints, and POS failure compensation.
- **Atomic Two-Phase Idempotency:** Distributed locking with lease expiration (`in_progress` -> `completed`), concurrent conflict rejection (409 Conflict), and payload mismatch rejection (422 Unprocessable Entity).
- **PostgreSQL Persistence & Migration Safety:** Full suite of typed PostgreSQL repositories, migration concurrent advisory locking (`pg_advisory_lock`), SHA-256 migration file tamper-resistance, and production startup fail-closed invariant without `DATABASE_URL`.
- **Customer Application Discovery Integration:** React 19 customer web application connected to the backend API (`/v1/places/search`, `/v1/catalogues/:locationId`), supporting live debounced search, loading states, empty/error handling, modifier configuration, and synthetic environment provenance disclaimers.
- **Algorithm Research & Native Engines:** Entity resolution blocking with 3x3 Moore neighborhood adjacent cell expansion for boundary recall, large cluster sub-blocking, mathematically exact pairwise evaluation metrics (`TP + FP + FN + TN === totalPossiblePairs`), benchmarked against a shared golden evaluation fixture (`golden_evaluation_pairs.json`). High-throughput C++17 engine running at ~298k pairs/sec with 100% precision and 0.00% False Merge Rate. High-throughput Rust ingestion enforcing `max_retention_days` license policies.

## Getting Started

### Prerequisites
- Node.js 22+ (verified on Node 24)
- pnpm 10+
- Rust & Cargo (stable)
- C++17 compatible compiler (MSVC on Windows, GCC/Clang on Linux/macOS)

### Quick Start

```bash
# 1. Install all dependencies across the monorepo
pnpm install

# 2. Run all unit and integration test suites
pnpm test

# 3. Typecheck all packages
pnpm typecheck

# 4. Build all packages and applications
pnpm build

# 5. Run database migration validator
pnpm db:validate

# 6. Run the entity resolution algorithm benchmark
pnpm benchmark

# 7. Run the Rust ingestion benchmark
cargo run --release --manifest-path packages/ingestion/rust/Cargo.toml

# 8. Start the API server in development mode
pnpm --filter @arrival/api dev

# 9. Start the Customer Discovery web application
pnpm --filter @arrival/web dev
```

## Development philosophy

Arrival should be built in small, reviewable, evidence-backed changes. Each change should have a clear purpose, appropriate tests, and documentation where needed. AI tools may assist development, but the repository remains the source of truth. Humans remain responsible for reviewing decisions, validating results, and understanding the code.

See [AI-assisted development workflow](docs/AI_WORKFLOW.md).

## Name status

“Project Arrival” is a working project identity. Trademark, domain, and market-name clearance must be completed before treating Arrival as a legally cleared public brand.

---

**Project:** Project Arrival  
**Tagline:** Discover. Order. Watch it arrive.  
**Primary category:** Restaurant discovery and delivery orchestration

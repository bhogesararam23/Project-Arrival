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

**Stage: Working, testable software foundation.** The repository contains a tested, strictly-typed monorepo with:
- Shared domain contracts, Money value object, ISO standard validation, and RFC 9457 errors (`@arrival/contracts`).
- Symmetrical PostgreSQL/PostGIS migrations, schema hardening checks, and a standalone migration runner (`@arrival/database`).
- Modular monolith Fastify API implementing health, discovery, quotes, orders, fail-closed capability gates, and idempotency (`@arrival/api`).
- Responsive React 19 customer discovery application with global destination search, clear orderability capability indicators, and zero fabricated business information (`@arrival/web`).
- High-throughput, memory-safe Rust data ingestion and license verification engine (`packages/ingestion/rust`).
- High-performance C++17 entity resolution engine with reproducible benchmark suite (`packages/algorithms/cpp`).

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

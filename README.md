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
- [Order lifecycle](docs/ORDER_LIFECYCLE.md)
- [Roadmap](docs/ROADMAP.md)
- [Architecture decisions](docs/ADR/README.md)
- [Contributing](CONTRIBUTING.md)
- [AI and automation workflow](docs/AI_WORKFLOW.md)

## Current status

**Stage: project foundation and research.** This repository establishes product direction, engineering conventions, and architectural constraints. No production merchant, payment, delivery, or global data integration should be assumed to exist until it is implemented, tested, and documented.

Every capability must be labelled as planned, prototyped, sandbox-tested, or production-verified.

## Development philosophy

Arrival should be built in small, reviewable, evidence-backed changes. Each change should have a clear purpose, appropriate tests, and documentation where needed. AI tools may assist development, but the repository remains the source of truth. Humans remain responsible for reviewing decisions, validating results, and understanding the code.

See [AI-assisted development workflow](docs/AI_WORKFLOW.md).

## Name status

“Project Arrival” is a working project identity. Trademark, domain, and market-name clearance must be completed before treating Arrival as a legally cleared public brand.

---

**Project:** Project Arrival  
**Tagline:** Discover. Order. Watch it arrive.  
**Primary category:** Restaurant discovery and delivery orchestration

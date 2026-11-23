# Project Arrival — Project Brief

**Status:** Foundation / research phase  
**Product:** Global restaurant discovery, native ordering, and delivery orchestration  
**Tagline:** Discover. Order. Watch it arrive.

## Mission

Build a premium, guest-first platform that helps people discover restaurants globally, place genuine orders where merchant, payment, and fulfilment integrations support them, and follow real delivery progress.

Arrival is an orchestration and discovery layer. It does not own restaurants, prepare or stock food, or operate a proprietary courier fleet. Merchants remain responsible for food sales and preparation; legitimate payment and fulfilment providers perform their respective roles.

## Product boundaries

### In scope first
- Global restaurant and cafe discovery.
- Transparent source provenance and freshness for business/menu data.
- Browsing independently of device location.
- Delivery destinations independent of the customer's current location, including destinations in another country.
- Guest-first experience; optional accounts.
- Native checkout only when merchant acceptance, authoritative pricing, compliant payment processing, and real fulfilment are all available.
- Merchant-managed and third-party fulfilment.
- Authentic order and delivery events.

### Not in the initial scope
- Grocery, retail, or general commerce.
- Owning or operating restaurants.
- Food inventory or preparation.
- An owned courier fleet.
- Fake order, payment, courier, or tracking states.
- Mandatory account creation or GPS access.

## Product invariants

1. Discoverability is not orderability.
2. No order can be submitted without a verified fulfilment path.
3. The backend is authoritative for price, currency, availability, order state, and payment state.
4. Order, payment, and fulfilment lifecycles are separate state machines.
5. Provider data remains subject to its licensing, attribution, caching, and retention terms.
6. A customer may browse from one country and deliver to another, subject to the destination market's capabilities and transaction restrictions.
7. Guest order access must use a high-entropy secret, not a guessable order ID.
8. Real delivery progress must originate from authenticated merchant/provider events.
9. Unsupported integrations are reported as unsupported—not simulated.
10. Market launch is gated by legal, commercial, security, and operational readiness.

## Architecture direction

Start with a modular TypeScript application and explicit domain boundaries. Use PostgreSQL/PostGIS for transactional and geographic data. Keep discovery, merchant, payment, maps, and delivery systems behind provider interfaces.

Introduce Rust or C++ only for measured performance, isolation, systems-level or algorithmic requirements. Dart/Flutter is a later mobile client, not a reason to duplicate the backend. Algorithm research must have reproducible datasets, baselines, benchmarks, documented assumptions, and tests.

## Current maturity

This repository is a project foundation and research workspace. Documentation and interfaces do not imply that a production integration exists. Every capability must be labelled as planned, prototyped, sandbox-tested, or production-verified.

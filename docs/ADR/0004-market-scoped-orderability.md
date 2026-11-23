# ADR 0004: Gate ordering by market and route capability

- **Status:** Proposed
- **Date:** 2026-11-23
- **Owner:** Project Arrival engineering

## Context

The PRD separates discoverability from orderability and permits destination independent of device location. Official provider documentation shows distinct geographic, contractual and operational constraints: DoorDash Drive docs list four countries and limited API access; Uber Direct requires account setup and a production pilot; payment API country access does not imply platform payout eligibility. Place/geocoding terms constrain persistent indexing and coordinates.

## Decision

Store capability evidence per provider, operation, market, merchant location, currency and service area. Ordering stays disabled unless merchant, payment, fulfilment and legal capabilities are current and production-verified. Require same-country merchant, recipient, payment settlement and fulfilment for the initial pilot unless a documented legal/provider-approved exception exists.

## Alternatives

- Treat a country listed in one API as universally orderable: rejected because API, payout, merchant activation and physical serviceability differ.
- Enable ordering from geocoding or radius: rejected because a resolved point does not prove courier serviceability or transaction permission.
- Assume cross-border checkout at launch: rejected pending fund-flow, local-law, provider and operational evidence.

## Consequences

Capability registry and operator review are required. Foreign browsing remains possible while checkout fails closed. This may reduce initial checkout coverage but avoids unsupported promises. Revisit after pilot and market-specific counsel review.

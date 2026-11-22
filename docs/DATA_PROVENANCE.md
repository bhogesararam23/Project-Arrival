# Data Provenance and Discovery Policy

## Objective

Build a dependable global restaurant discovery index without treating third-party map results as an unrestricted database or confusing discovery information with order-authoritative data.

## Candidate source classes

- Licensed business/place providers.
- Open datasets with compatible terms and attribution.
- Merchant-authoritative submissions and integrations.
- Restaurant-owned websites and published catalogues where permitted.

Each provider requires a reviewed source record describing permitted purposes, display attribution, caching/storage limits, refresh limits, export restrictions, retention and deletion requirements.

## Record provenance

Track, as appropriate:
- provider/source name and source record identifier;
- source terms/license reference and review date;
- retrieval and last-seen timestamps;
- merchant verification status and verified timestamp;
- field-level or record-level confidence;
- transformations and merge history;
- stale/withdrawn state.

## Trust hierarchy

Merchant-authoritative and properly licensed sources take precedence for operational data. Discovery providers may supply identity and location hints, but do not establish menu accuracy, current prices, item availability or delivery eligibility.

## Freshness

- Business name/address: periodically revalidate.
- Hours: treat as potentially stale unless merchant-confirmed.
- Menus: synchronize from merchant source and record version/time.
- Price and item availability: verify at checkout.
- Delivery fee/eligibility: obtain current fulfilment quote.
- Courier location: use provider-supplied updates only.

## Deduplication

Use stable provider IDs, normalized names, addresses, domains and geospatial proximity as evidence. Preserve source links and audit history. Avoid irreversible automatic merges where ambiguity remains.

## Bulk collection

Do not use public geocoding endpoints as bulk harvesting infrastructure. Review each provider's applicable usage policy and use suitable licensed datasets or contracted services for large-scale ingestion.

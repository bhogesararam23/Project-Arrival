# Research Register

Use this document to track research before a technical or product decision becomes an implementation assumption.

## Research item template

- **ID:**
- **Question:**
- **Why it matters:**
- **Hypotheses:**
- **Sources and dates:**
- **Source licensing / terms:**
- **Method:**
- **Dataset and limitations:**
- **Baseline:**
- **Findings:**
- **Confidence / uncertainty:**
- **Decision affected:**
- **Next experiment:**
- **Owner:**

## Initial research tracks

### R-001 — Global restaurant discovery data
Compare licensed discovery sources and open datasets for geographic coverage, data completeness, freshness, commercial use, attribution, caching, bulk access and cost.

### R-002 — Merchant ordering interoperability
Investigate POS, merchant APIs, ordering networks and direct merchant integrations. Determine how order acceptance, menu freshness, cancellation and refunds work.

### R-003 — Cross-border customer and local fulfilment
Study the separation between customer origin, merchant location, recipient destination, payment jurisdiction and fulfilment region. Record restrictions and edge cases.

### R-004 — Payment and settlement models
Compare payment providers by supported markets, marketplace capabilities, merchant onboarding, settlement, refunds, chargebacks, FX, KYC and compliance requirements.

### R-005 — Delivery provider coverage
Compare merchant-managed delivery and third-party courier offerings by service area, quoting, dispatch, tracking, webhooks, cancellation, insurance and production access.

### R-006 — Restaurant entity resolution
Evaluate deterministic matching and probabilistic/entity-resolution approaches against a labelled, licensed dataset. Measure precision, recall and false merges.

### R-007 — Menu and data freshness
Investigate source authority, update frequency, stale-data detection and safe checkout validation.

### R-008 — ETA and serviceability research
Evaluate geographic and temporal models only with legitimate, authorized data. Establish baselines and uncertainty bounds before proposing a production model.

## Evidence standard

Do not describe a provider, algorithm, dataset or market as supported based on an undated blog post or marketing page alone. Prefer official technical documentation, current contractual terms and reproducible experiments.

## Current technical research snapshot

See [provider and data-source comparison](research/PROVIDERS.md) and [algorithm research roadmap](research/ALGORITHMS.md), reviewed 2026-11-23. These are dated technical findings, not contract/legal approvals. Refresh sources and re-review before provider selection or launch.

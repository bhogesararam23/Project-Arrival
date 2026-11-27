# Milestone 4 Discovery & Data Provider Evaluation

**Date:** 2026-11-27  
**Purpose:** Evidence-based evaluation of restaurant discovery data sources, separating documented facts from commercial/legal unknowns. No restricted source is scraped or ingested.

---

## 1. Architectural Separation Principle

Project Arrival strictly separates four independent states:
1. **Discoverable:** Venue exists in `venues` with verified provenance (`source_observations`).
2. **Catalogue Visible:** A published `catalogues` record exists with source/time attribution.
3. **Merchant Verified:** Legal merchant entity onboarded and verified (`merchants.verification_state = 'verified'`).
4. **Native Orderable:** `provider_capabilities` has active, unexpired, non-revoked `production_verified` routes for POS, payment, and fulfilment.

---

## 2. Candidate Data Sources Comparison

| Source | Coverage & Fields | Licensing & Storage Rights | Commercial Usage & Attribution | Refresh / Deletion | Unanswered Legal / Commercial Questions |
|---|---|---|---|---|---|
| **OpenStreetMap (ODbL)** | Global POIs, names, coordinates, partial addresses, opening hours. No authoritative menus or prices. | **ODbL 1.0:** Persistent storage allowed if Share-Alike / attribution obligations are met. | Commercial use permitted **with mandatory ODbL attribution** and Share-Alike evaluation for derivative databases. | Continuous community edits; must respect redactions/deletions. | Counsel review required on whether mixing ODbL coordinates with proprietary merchant catalogues triggers ODbL "Produced Work" vs "Derivative Database" obligations. |
| **Overture Maps Places** | Global places dataset, categories, addresses, confidence scores. | **CDLA Permissive 2.0** (for Overture schema/data; check underlying source provenance per record). | Commercial use generally permitted under CDLA-Permissive-2.0 with attribution. | Monthly releases; stale/closed venue lag possible. | Verify per-record upstream license tags before commercial display. |
| **Foursquare OS Places / Commercial API** | Rich venue metadata, categories, addresses. | OS Places (Apache 2.0 for open subset) vs Commercial API (strict caching/retention limits). | Commercial API typically **prohibits** permanent raw storage beyond TTL without enterprise addendum. | API-dependent; deletion/cache TTL required. | Enterprise agreement required for persistent storage and commercial ordering linkage. |
| **Google Places API** | High global coverage, hours, photos. | **Restrictive:** Prohibits scraping and strictly limits caching/storage (only `place_id` may be cached indefinitely). | Commercial display requires Google Maps Platform billing and strict attribution/map-display rules. | Real-time API only; bulk export prohibited. | **Not suitable** as a persistent primary discovery database due to storage restrictions. |
| **Direct Merchant / POS Sync** | Authoritative menus, modifiers, prices, availability, prep times. | Granted directly via Merchant Terms of Service / POS OAuth scope. | Explicitly authorized for discovery and native ordering for that merchant only. | Webhook / delta sync; immediate withdrawal on merchant offboarding. | Requires executed merchant agreement and POS partner approval. |

---

## 3. Rust Ingestion Gate & Entity Resolution Findings
- **Rust Retention & Purpose Gate (`packages/ingestion/rust`):** Enforces `SourceRegistryEntry.active`, `AllowedPurpose`, `max_retention_days` against RFC 3339 `observed_at`, coordinate bounds, and ISO country codes.
- **Entity Resolution (`packages/algorithms`):**
  - TypeScript and C++17 baselines both use 3x3 Moore neighborhood spatial blocking + 4-char name prefix blocking with secondary sub-blocking for dense buckets ($\ge 100$ records).
  - Synthetic 250-record C++ benchmark executes at **462,864 pairs/sec** with 100% precision, 100% recall, and 0.00% False Merge Rate.
  - **Limitation:** Synthetic benchmarks do **not** establish real-world precision/recall across multilingual/transliterated global corpora. A legitimately licensed, human-adjudicated dataset is required before claiming production entity-resolution accuracy.

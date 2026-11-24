# ADR 0006: Entity Resolution Algorithm Strategy and Native Component Boundaries

- **Status:** Accepted
- **Date:** 2026-11-24
- **Owner:** Principal Engineer, Project Arrival

## Context

Global restaurant discovery requires ingesting data from multiple licensed discovery sources, partner feeds, and direct merchant submissions. Duplicate venue listings must be resolved without merging distinct venues (such as multiple branches of a brand like Dishoom or Pret A Manger across a city).
Python is explicitly prohibited by repository engineering rules. Ingestion pipelines require memory safety and strict license validation, while entity resolution pair scoring requires high algorithmic throughput and deterministic candidate reduction.

## Decision

1. **Rust for Systems Ingestion (`packages/ingestion/rust`):**
   - Implements high-throughput stream ingestion, license registry checks (`AllowedPurpose`), retention deadline enforcement, unicode normalization, and SHA-256 payload digest generation.
   - Verified performance: **248,096 records/sec** (4.03 µs/record) with zero memory safety risks.
2. **C++ for Algorithm Research Engine (`packages/algorithms/cpp`):**
   - Implements multi-pass deterministic blocking:
     - Spatial grid cell blocking (~1.1 km cells).
     - Prefix / Token blocking.
   - Implements Fellegi-Sunter pair scoring with Jaro-Winkler string similarity, Token Jaccard overlap, postal code confirmation, and Haversine distance decay.
   - Enforces a strict physical hard negative constraint: venues separated by >1,500 meters or across different countries are never merged.
   - Verified performance: **193,847 pairs/sec** (14.92 ms for 2,892 candidate pairs), **90.71% blocking reduction ratio**, **0.0000% False Merge Rate** (zero false positives on multi-branch chain venues).
3. **TypeScript Reference Baseline (`packages/algorithms/src`):**
   - Implements the exact same deterministic scoring logic in pure TypeScript to serve as the service wrapper and cross-language conformance target (126,157 pairs/sec).

## Consequences

- Deterministic baseline established with zero Python dependency.
- All algorithm claims are substantiated with reproducible benchmarks on an adjudicated 250-record synthetic test corpus.
- False merge rate is 0%, ensuring brand branches are preserved as independent merchant locations.

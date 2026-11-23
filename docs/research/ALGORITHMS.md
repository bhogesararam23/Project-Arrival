# Algorithm Research Roadmap

No algorithm is claimed as novel or production-ready. Keep experiments outside request-critical runtime until data rights and measured quality support promotion. Freeze benchmark manifests, preprocessing, random seeds, source snapshots and split IDs. Never include licensed data in public fixtures unless redistribution is allowed.

## R-006 Restaurant entity resolution

**Decision:** link records for review; avoid destructive merge. **Inputs:** fields with per-field source/provenance, normalized multilingual name, address components, domain/phone where terms permit, coordinates only from persistable authorized sources. **Baselines:** exact stable source-ID linkage; normalized name+country/address exact match; deterministic blocking by country and geographic cells; probabilistic Fellegi-Sunter/logistic pair score with missingness indicators. Candidate C++ evaluation is justified only if profile shows pair scoring/blocking throughput or memory pressure; TypeScript remains service wrapper.

Build a manually adjudicated pair corpus sampled by geography, language/script and chain/independent type, with explicit hard negatives (same-name branches, food courts, relocated/closed venues) and source-license evidence. Separate train/validation/test by venue/chain and geography to prevent leakage. Metrics: pair precision/recall/F1, precision at auto-link threshold, false merge rate, candidate recall, calibration (Brier/ECE), review yield and latency/cost per 1k records. Optimize false merges before recall. Human review for ambiguous pairs and reversible merge graph.

## R-007 Freshness and confidence

Represent confidence per field, not one opaque business score. Candidate baseline: deterministic source authority × age decay × independent corroboration with explicit missing/contradiction states. Compare survival analysis/empirical staleness curves by field and market. Label with dated merchant re-verification or observed corrections; do not treat provider last-seen as merchant confirmation. Metrics: Brier/log loss for binary correctness, calibration by country/source/field, stale detection precision/recall, age-to-correction, coverage and false freshness. Required ablation: recency, source tier, corroboration separately. No source should become “fresh” merely because ingestion recurred.

## Discovery ranking

Start with reproducible lexical relevance (PostgreSQL text/trigram), geography/distance and explicit filters; ranking must exclude non-discoverable/suspended records and disclose orderability separately. Candidate features: query match, destination proximity, verified status, freshness, user-selected dietary/category constraints. Do not use paid placement or popularity unless product policy and lawful source support are separately approved. Dataset: licensed query/result judgments across markets/languages, anonymized or synthetic query fixtures, blinded relevance labels. Split by geography/time; measure NDCG@k, MAP, recall@k, zero-result rate, result coverage, latency, freshness and fairness/coverage gaps. Compare lexical baseline to BM25/search service only after load test proves PostgreSQL insufficient.

## Geographic serviceability

Baseline: merchant/provider-authored polygon or live delivery-provider quote; hard country/market gate plus point-in-polygon only when polygon license and coordinate rights permit. Geodesic radius is a discovery heuristic, never delivery proof. Evaluate with authorized address samples and provider quote outcomes across dense/edge/rural boundaries. Metrics: serviceability precision/recall, false-positive rate (priority), boundary error, quote success, address-resolution failure and per-route cost. Random splits are invalid; stratify by city, provider and temporal window. External route estimates do not establish actual courier ETA.

## ETA

Initial baseline: provider quote ETA only, labeled provider estimate with observed-at time and uncertainty caveat. Do not train on synthetic or scraped traces. Later experiment only with contract-authorized historical events and lawful purpose/retention. Compare naive median by route/time window, provider estimate baseline, then calibrated regression/quantile model. Temporal and geographic holdouts; metrics MAE, median absolute error, pinball loss, interval coverage/width, late-delivery rate, subgroup calibration and data drift. Publish percentile intervals; suppress estimate when evidence is insufficient. C++ only if measured inference or routing performance needs it; Rust may be evaluated for a bounded high-throughput service after benchmark.

## Reproducibility and promotion

Every experiment records question, preregistered hypothesis, dataset license/version/hash, geography/time coverage, label guide and agreement, exclusions, baseline, split strategy, seed, code revision, compiler/runtime/hardware, commands, metrics with confidence intervals, failure analysis, bias/coverage limits and compute cost. Preserve immutable manifests and licensed-data pointers, not unauthorized copies. Use bootstrap confidence intervals and repeated seeds where random. Require independent reproduction and data/license review. Promote only with ADR, shadow evaluation, kill switch, monitoring and fallback; research performance does not imply legal permission.

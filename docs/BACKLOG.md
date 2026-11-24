# Dependency-Ordered Engineering Backlog

Priorities: P0 blocks a safe pilot; P1 required for credible discovery or measured pilot; P2 evidence-led later work. “Testing” describes required future implementation checks; no application tests are run by this documentation change.

| ID / priority | Task and dependency | Acceptance criteria | Testing / evidence |
|---|---|---|---|
| B-001 P0 | Select pilot country/city, merchant and intended fund flow; owner/legal discovery | Written market dossier identifies seller of record, merchant contract, currency, tax, refund, support and privacy owners; unresolved items block launch | Signed review records; no assumption inferred from API country list |
| B-002 P0 | Data-source licensing matrix; B-001 independent | Every candidate field/source has purpose, retention, attribution, deletion, geography, export rights and counsel decision; prohibited use technically blocked | License-policy unit tests and deletion/withdrawal exercise |
| B-003 P0 | Threat model/data inventory/privacy review; B-001 | Actors, boundaries, classifications, retention, transfers, abuse cases and mitigations approved | Threat-model workshop; access-path review; privacy review evidence |
| B-004 P0 | PostgreSQL/PostGIS deployment and migration pipeline; B-002/B-003 | Version pinned, extensions available, repeatable forward migration, backup and restore runbook | Apply/rollback or forward-fix in disposable DB; restore drill; migration lint |
| B-005 P0 | Implement schema and domain glossary; B-004 | Constraints enforce money/state/reference invariants; tenant ownership and provenance are queryable; order snapshots immutable | DB constraint tests, migration integration tests, explain plans on representative spatial/text fixtures |
| B-006 P0 | Authentication, guest session/grant and merchant tenant authorization; B-003/B-005 | Guest browsing, one-time scoped order grant, revocation/expiry, merchant membership checks and audited admin roles | Enumeration, replay, expiry, cross-tenant and privilege-escalation security tests |
| B-007 P0 | TypeScript module skeleton and API contract validation; B-005 | Domain interfaces match OpenAPI; typed errors; request validation; API versioning and correlation IDs | OpenAPI schema validation; contract tests; generated client drift check |
| B-008 P0 | Capability registry/operator approval path; B-001/B-002/B-005 | Per-provider/merchant/market/operation capability is evidence-backed, reviewed, expires, can be disabled; only production_verified route permits checkout | State transition and fail-closed tests; audit/disable drill |
| B-009 P0 | Order/payment/fulfilment state transition services; B-005/B-007 | Independent machine invariants; immutable event trail; duplicate transition handling; reconciliation-required state | Transition table property tests, concurrency/idempotency tests |
| B-010 P0 | Outbox/inbox, worker leases and webhook ingress; B-007/B-009 | Atomic outbox; signature-first inbox; replay/dedupe; bounded retry/dead-letter; provider query before uncertain retry | Fault injection for timeout-after-write, duplicate/out-of-order/malformed webhook and worker crash |
| B-011 P0 | One merchant/POS adapter selection and contract; B-001/B-008 | Exact read/write scopes, menu sync, acceptance/reject/cancel and sandbox/production access evidenced | Provider contract suite, sandbox order cycle, merchant pilot rehearsal |
| B-012 P0 | One payment provider/funds flow; B-001/B-008 | Payment method and authorization/capture/void/refund lifecycle works in selected market; KYC, settlement and reconciliation owners assigned | Sandbox tests plus controlled live low-value pilot and daily reconciliation approval |
| B-013 P0 | One fulfilment adapter and delivery quote; B-001/B-008 | Quote validates destination and current price; dispatch, cancel, tracking and unsupported states documented; actual area evidenced | Contract tests, sandbox and provider-approved live pilot, lost-webhook recovery |
| B-014 P0 | Checkout quote/order orchestration; B-009 through B-013 | Server validates catalogue/version, taxes/fees, destination, quote expiry, payment and merchant capabilities; no duplicate or false-success order | Concurrency, stale menu, expired quote, cross-border blocked, payment uncertain and compensation integration tests |
| B-015 P0 | Reconciliation, refund and operator exception console; B-010/B-012/B-013 | Unmatched attempts surfaced with evidence; refunds idempotent and capped; corrections audited | Simulated provider ledger fixtures plus sandbox/live reconciliation evidence |
| B-016 P0 | Operations/security/launch readiness; B-003, B-010 to B-015 | Alerts, SLOs from pilot data, runbooks, backup restore, credential rotation, kill switches, support and consumer disclosures approved | Incident tabletop, restore drill, penetration/access review, provider-disable rehearsal |
| B-017 P1 | Licensed discovery source evaluation and provider contract; B-002 | Chosen source offers needed persistent/display rights, documented coverage, cost and deletion terms | Signed terms review; sampled coverage quality audit |
| B-018 P1 | Discovery ingestion/normalization and provenance; B-004/B-017 | Idempotent ingestion, field-level source/time, withdrawal/deletion, stale state; no unauthorized raw payload retention | Fixtures respecting license, retry and withdrawal tests, source audit |
| B-019 P1 | Geographic/text discovery query; B-005/B-018 | Country, text and radius filters; cursor pagination; discoverability separate from orderability; attributed source display | Multilingual relevance fixtures, spatial correctness, query plans and load profile |
| B-020 P1 | Entity resolution and human review; B-018 | Candidate links ranked with calibrated confidence; auto merge only at approved threshold; reversible merge history | Licensed adjudicated corpus; false-merge/precision/recall metrics by geography |
| B-021 P1 | Merchant-authoritative catalogue contract/sync; B-011 | Versioned menu/modifiers, availability, currency and source timestamps; no checkout from stale/non-authoritative data | Provider contract and stale catalogue tests |
| B-022 P1 | Algorithm benchmark harness; B-002/B-017 | Versioned licensed dataset manifest, deterministic baselines, geographic/time splits and reproducible reports | Independent rerun, CI smoke benchmark and artifact provenance |
| B-023 P1 | Freshness/confidence model; B-020/B-022 | Field-level calibrated confidence, source/age effects and contradiction handling; no false merchant verification | Calibration and stale-label evaluation with held-out time/market |
| B-024 P1 | Serviceability/ETA evaluation; B-013/B-022 | Provider quote remains baseline; false-positive serviceability priority and ETA uncertainty reported | Authorized provider outcome set; spatial/temporal holdout, interval calibration |
| B-025 P2 | Rust component evaluation; B-022 plus measured bottleneck | ADR only if benchmark demonstrates meaningful reliability/performance benefit and ownership/build plan | Comparative benchmark against TypeScript/C++ alternatives |
| B-026 P2 | C++ algorithm implementation; B-020/B-022 measured need | Clear interface, deterministic builds, conformance with baseline and justified speed/memory gain | Sanitizers, fuzzing, reproducible benchmark, cross-language golden fixtures |
| B-027 P2 | Flutter client; stable API plus mobile evidence | Client uses versioned contracts; privacy/localization/accessibility parity; no backend rules duplicated | Device matrix, contract tests, accessibility and privacy review |

Dependency direction: resolve market, legal and source rights before integrations; establish data and authorization before transaction code; complete real provider approval before pilot; algorithm work may progress only on licensed datasets and cannot gate unsupported promises.

## Milestone 1 Implementation Status (Foundation Milestone Completed 2026-11-24)

| Backlog ID | Implemented Component | Status | Verification & Evidence |
|---|---|---|---|
| B-004 | PostgreSQL migration tooling | **Implemented** | `@arrival/database` migration runner (`up`, `down`, `validate`), symmetrical rollbacks tested |
| B-005 | Schema hardening & invariants | **Implemented** | `001_initial_platform.sql` + `002_schema_hardening.sql` with ISO checks, composite indexes, audit immutability triggers |
| B-006 | Guest sessions & order grants | **Implemented** | 32-byte cryptographic entropy, SHA-256 digest persistence, scoped order access tokens |
| B-007 | Modular monolith TypeScript API | **Implemented** | `@arrival/api` on Fastify: health, discovery, quotes, orders, RFC 9457 problem details |
| B-008 | Capability registry & fail-closed gate | **Implemented** | `@arrival/contracts` capability evaluation (`production_verified` only), fail-closed cross-border blocker |
| B-014 | Checkout quote & order lifecycle | **Implemented** | Integer minor units arithmetic, tax & delivery calculation, idempotency cache & conflict detection |
| B-018 | Ingestion & normalization engine | **Implemented** | `arrival_ingestion` (Rust): 248k records/sec, purpose & license enforcement, unicode sanitization |
| B-019 | Discovery query & customer app | **Implemented** | `@arrival/web` (React 19 + Vite): destination search, orderability badges, catalogue browser |
| B-020 | Entity resolution algorithm | **Implemented** | Multi-pass spatial & token blocking, Fellegi-Sunter scoring, hard negative distance invariant |
| B-022 | Reproducible benchmark harness | **Implemented** | Synthetic 250-record adjudicated corpus comparing C++, Rust, and TypeScript baselines |
| B-025 | Rust ingestion component | **Implemented** | High-throughput memory-safe pipeline tested with Cargo (`packages/ingestion/rust`) |
| B-026 | C++ algorithm engine | **Implemented** | C++17 engine (`packages/algorithms/cpp`): 193k pairs/sec, 90.7% blocking reduction, 0.00% False Merge Rate |

# 0011 — Operations Control Plane, Operator RBAC, and Capability Governance

**Status:** Accepted  
**Date:** 2026-11-27  
**Author:** Principal Engineer / Security Architect  

## Context

Mock adapters in `FIXTURE_CAPABILITIES` were previously marked `production_verified`, `PgPlacesRepository` hardcoded `orderability: 'native_orderable'` for every database location, and no authenticated operational control plane existed to investigate orders, replay dead-letter outbox messages, resolve payment reconciliation, or suspend failing capabilities.

## Decision

1. **Fail-Closed Capability Governance:**
   - Default `FIXTURE_CAPABILITIES` mark mock providers as `sandbox_verified`, never `production_verified`. Controlled tests requiring checkout must explicitly inject `SYNTHETIC_TEST_CAPABILITIES`.
   - `PgPlacesRepository` derives `orderability` dynamically from active `provider_capabilities` (`production_verified`, non-revoked, unexpired) and published catalogues.
   - `provider_capabilities` schema tracks `provider_account_ref`, `merchant_id`, `reviewed_by`, `revoked_at`, `revocation_reason`, and the full lifecycle status enum.

2. **Authenticated Operations Control Plane (`/v1/ops/*`):**
   - Enforces operator RBAC (`ops_readonly` vs `ops_admin`) in API middleware (`createOperatorAuthMiddleware`).
   - Masks PII in order investigations (`piiMasked: true`) and records an immutable `audit_records` entry (actor, role, action, resource, reason, request ID, timestamp) for every privileged mutation.

## Consequences

- Unverified locations and mock providers cannot accidentally authorize production orders.
- Operators have auditable, role-restricted tooling for exception management without exposing public admin endpoints.

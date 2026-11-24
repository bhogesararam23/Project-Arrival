# 0007 — Scoped Guest Order Grants and Atomic Idempotency

**Status:** Accepted  
**Date:** 2026-11-24  
**Author:** Principal Engineer / Security Architect  

## Context

Project Arrival adopts a guest-first privacy model where users can browse, build carts, and complete checkouts without creating permanent accounts or granting continuous device tracking permissions. In the initial software foundation, guest sessions and order grants were partially simulated, using fixed mock tokens (`guest-sess-simulated`), single coarse order tokens, and a static idempotency lookup.

These patterns introduced three major security and operational risks:
1. **Token Simulation Risk:** An arbitrary `Authorization: Bearer <token>` header could be accepted without verifying session existence, expiry, or cryptographic digest.
2. **Privilege Escalation and Token Enumeration:** If a single access token permitted both order inspection and cancellation, a read-only tracking link could be abused to cancel an order. Furthermore, unauthenticated or cross-tenant lookups returning `401/403` could allow attackers to enumerate valid order IDs.
3. **Idempotency Race Conditions:** A simple check-and-insert idempotency mechanism without atomic reservation could allow concurrent requests with the same key to execute side effects (such as payment authorizations or merchant orders) simultaneously.

## Decision

1. **Cryptographically Verified Guest Sessions:**
   - Guest sessions are minted with 32 bytes of secure random entropy (`crypto.randomBytes(32)`), formatted as `gst_<hex>`.
   - The plain secret is returned once to the caller. The database persists only the hex-encoded SHA-256 digest (`crypto.createHash('sha256').update(token).digest('hex')`).
   - Every request validates that the presented token exists, has not expired (`expiresAt`), and has not been revoked (`revokedAt`).
   - Mock and simulated session tokens are completely eliminated.

2. **Granular Scoped Order Access Grants:**
   - Order creation issues distinct, cryptographically isolated access grants:
     - `read_order`: Allows read-only access to view order status, receipt, and delivery tracking.
     - `cancel_order`: Grants explicit permission to request order cancellation within allowable time and status windows.
   - Requests presenting a `read_order` token to the cancellation endpoint fail closed with `403 Forbidden` (`INSUFFICIENT_SCOPE`).
   - Unauthenticated lookups or requests presenting a valid token belonging to a different order return `404 Not Found` rather than `403 Forbidden` to prevent order existence enumeration.

3. **Atomic Idempotency Reservation:**
   - Idempotency records support an atomic two-phase lifecycle: `in_progress` and `completed`.
   - Incoming requests atomically insert or claim an idempotency key with a lease deadline (`locked_until`). Concurrent requests with the same key receive `409 Conflict` (`IDEMPOTENCY_IN_PROGRESS`).
   - If payload hashing reveals a mismatched request body for an existing key, the server rejects it with `422 Unprocessable Entity` (`IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`).
   - When processing completes successfully, the status is marked `completed` and the cached response is persisted for deterministic replay.

## Consequences

- Prevents unauthorized actions on orders while maintaining a frictionless guest checkout experience.
- Protects external merchant POS and payment providers from duplicate orders during network retries or concurrent browser submissions.
- Ensures zero plaintext session secrets are stored at rest or exposed in logs.

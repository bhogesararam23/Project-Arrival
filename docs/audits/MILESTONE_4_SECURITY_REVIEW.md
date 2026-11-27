# Milestone 4 Security Deep Review — Project Arrival

**Review Date:** 2026-11-27  
**Target Branch:** `feat/milestone-4-reliability-platform`  
**Scope:** End-to-end attack surface across guest auth, operator RBAC, idempotency, webhooks, database access, PII redaction, retention, and secret management.

---

## 1. Security Controls Verification Matrix

| Attack Surface | Implemented Control | Evidence / Test Coverage | Remaining Risk / Gap |
|---|---|---|---|
| **Guest Session Auth** | 32-byte CSPRNG hex token (`gst_` / 64 hex chars), SHA-256 digest stored in `guest_sessions`, expiry & revocation checked on every request. | `apps/api/test/security.test.ts` (missing, malformed, non-existent, expired, revoked tokens). | Rate limiting per IP / session on `POST /v1/guest-sessions` is not yet enforced at Fastify middleware level (relies on edge/API gateway). |
| **Order Enumeration & Grants** | Separate `read_order` and `cancel_order` grants; unauthenticated/cross-order lookups return `404 Not Found`. | `apps/api/test/security.test.ts` (`read_order` blocked from cancel with `403`, wrong order returns `404`). | None in API logic. |
| **Operator Auth & RBAC** | `OPS_AUTH_TOKENS_JSON` parsed at startup; empty default fails closed (`401`); `ops_readonly` blocked from mutations (`403`); mutations require `reason` and write `audit_records` before mutating. | `apps/api/test/outbox-webhooks-ops.test.ts`, `apps/api/test/milestone4-failure-injection.test.ts` (Scenario 14). | Static token map is a replaceable boundary; production should swap in OIDC/JWT `IOperatorTokenVerifier`. |
| **Idempotency & Race Conditions** | `INSERT ... ON CONFLICT DO NOTHING` + `FOR UPDATE` row lock; payload SHA-256 mismatch returns `409/422`; concurrent in-progress returns `409`. | `packages/database/test/postgres.integration.test.ts`, `apps/api/test/security.test.ts`. | None in DB/API layer. |
| **SQL Injection** | 100% parameterized queries (`$1, $2, ...`) across all 12 PostgreSQL repositories; strict Zod/JSON Schema validation. | Code inspection of `packages/database/src/repositories/*.ts`. | None observed. |
| **Webhook Authenticity & Replay** | Timestamp skew check (300s), `crypto.timingSafeEqual` HMAC-SHA256 test verifier, `(provider_key, provider_account_ref, provider_event_ref)` unique dedupe, mismatched digest rejection (`409`). | `apps/api/test/outbox-webhooks-ops.test.ts`, `apps/api/test/milestone4-failure-injection.test.ts`. | Real providers require implementing each provider's actual documented signature protocol before enabling. |
| **PII, Coordinates & Secret Redaction** | Recursive `redact()` in `logger.ts` and `redactWebhookPayload()` (including arrays & nested objects) masking tokens, cards, emails, phones, coordinates, and ciphertexts. | `apps/api/test/milestone4-failure-injection.test.ts`. | `delivery_addresses` currently stores JSON buffer in `address_ciphertext`; envelope KMS encryption must be added before storing real customer PII. |
| **Data Retention** | `RetentionCleanupService.purgeExpired()` purges expired `idempotency_records`, `restricted_delivery_coordinates`, `guest_order_grants`, and unreferenced `guest_sessions` while preserving `orders` and `audit_records`. | `packages/database/test/postgres.integration.test.ts`. | Must be scheduled via cron/worker in production deployment. |
| **HTTP Security Headers & CORS** | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` on `/v1/orders` and `/v1/ops`. | `apps/api/src/app.ts:190-198`. | Explicit `CORS` allowlist should be configured per deployment origin. |
| **Fail-Closed Defaults** | `DATABASE_URL` required in `NODE_ENV=production`; mock capabilities default to `sandbox_verified`; unconfigured operator/webhook secrets fail closed. | `apps/api/test/config.test.ts`, `apps/api/test/milestone3-orchestration.test.ts`. | None in startup/capability gates. |

---

## 2. Priority Security Actions Before Production Pilot
1. **Envelope KMS Encryption for `delivery_addresses`:** Replace UTF-8 buffer encoding in `PgQuotesRepository.save()` with KMS-backed AEAD (AES-256-GCM) encryption before handling real customer addresses.
2. **Edge/Gateway Rate Limiting:** Enforce per-IP and per-session rate limits on `/v1/places/search`, `/v1/guest-sessions`, `/v1/checkout-quotes`, and `/v1/orders`.
3. **OIDC/SSO Operator Identity Provider:** Implement `IOperatorTokenVerifier` backed by organizational SSO/JWT with MFA rather than static env tokens.

# Security Baseline

This document is a baseline, not a certification or completed security audit.

## Required controls

- TLS for network traffic and encryption at rest through managed services.
- Least-privilege access and role-based authorization.
- Merchant tenant isolation and database row-level policies where applicable.
- Server-side validation of all client input and all prices.
- High-entropy guest order access secrets; store only hashes.
- Rate limits and abuse protection on public search, quote and order endpoints.
- Signed webhook verification, timestamp/replay checks and event deduplication.
- Idempotency for order, payment, refund and fulfilment commands.
- Secret management outside source control.
- Dependency and container scanning.
- Structured audit logs for privileged and financial actions.
- Avoid personal data, tokens and secrets in logs.
- Backups with tested restore procedures.
- Incident response and credential rotation procedures.

## Payment boundary

Do not store PAN/CVV or raw card data. Use provider-hosted/tokenized payment flows and verify applicable PCI obligations with the chosen provider and legal/compliance advisers.

## Threat-model priorities

1. Guest order enumeration and account/session takeover.
2. Cross-merchant data access.
3. Forged or replayed payment and delivery webhooks.
4. Price/cart manipulation.
5. Duplicate order/payment/dispatch.
6. Address and recipient data disclosure.
7. Scraping, bot abuse and provider cost exhaustion.
8. Compromised merchant/admin credentials.
9. Supply-chain/dependency compromise.

Security controls must be tested, not merely documented.

## Implemented Security Controls (Milestone 2)

- **Cryptographic Digest Guest Auth:** Guest bearer tokens (`gst_<hex>`) are hashed with SHA-256 before database queries. Plaintext tokens are never stored, logged, or included in query scopes. Simulated mock tokens are prohibited.
- **Granular Scoped Grants:** Order access separates `read_order` (view-only) from `cancel_order` (cancellation). A read token cannot cancel orders (fails closed with 403 Forbidden `INSUFFICIENT_SCOPE`).
- **Enumeration Defense:** Lookups with invalid, missing, or mismatched tokens return 404 Not Found rather than 401/403 to prevent attackers from determining whether an order ID exists.
- **Atomic Two-Phase Idempotency:** Requests atomically acquire an `in_progress` lease on idempotency keys. Concurrent identical requests receive 409 Conflict; payload discrepancies trigger 422 Unprocessable Entity.
- **Production Startup Fail-Closed:** The application requires a valid `DATABASE_URL` in production environments, throwing a fatal exception if missing to prevent silent fallback to volatile in-memory storage.

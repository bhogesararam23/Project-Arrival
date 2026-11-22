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

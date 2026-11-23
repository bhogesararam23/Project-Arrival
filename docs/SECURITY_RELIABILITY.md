# Security, Privacy and Reliability Design

This extends the baseline security/privacy documents; it is a design proposal, not an audit or compliance certification.

## Trust boundaries and controls

| Boundary | Threat | Required control |
|---|---|---|
| Public search → API | scraping, enumeration, cost exhaustion | per-IP/session limits, query bounds, bot controls, budget alarms, no private fields |
| Customer/guest → order | secret theft, replay, price tampering | high entropy hashed scoped guest grant; principal-scoped idempotency; server totals; constant-time secret checks |
| Merchant tenant → shared database | cross-tenant access | tenant from authenticated membership, per-request authorization, RLS as defense in depth, negative isolation tests |
| Provider webhook → domain | forgery, replay, duplicates, poison payload | raw-body signature verification, timestamp window where supported, inbox dedupe, schema and body-size limits, asynchronous processing |
| Provider credentials → worker | compromise/overreach | separate per-env credentials, least scopes, secret manager, rotation, outbound allowlist where practical |
| Personal data → provider/support | excess disclosure | field-level encryption, explicit purpose/consent, just-in-time decryption, retention/deletion and access audit |
| Admin → money/capabilities | insider mistake | MFA, least privilege, dual control for high-value refund/market launch, mandatory reason and immutable audit |

Threat model follows the existing SECURITY.md priorities: order enumeration/session takeover, tenant leakage, forged/replayed webhooks, price manipulation, duplicated side effects, address disclosure, cost abuse, compromised operators and supply-chain compromise.

## Data classes

- Public: approved business display fields and source-required attribution.
- Operational confidential: merchant credentials, provider references, capability evidence.
- Personal sensitive: recipient name, address, phone, delivery instructions, precise courier location.
- Financial restricted: tokenized payment references, amounts, refunds, reconciliation evidence. Never store PAN/CVV.

Encrypt sensitive fields with envelope encryption and managed keys; keep key IDs and rotation support. Logs/traces must redact request bodies, tokens, addresses, phone, provider secrets and webhook signatures. Establish field-specific retention with legal and tax/dispute requirements before launch; deletion must cascade or cryptographically erase where retention permits.

## Availability and failure handling

Use PostgreSQL transaction + outbox for durable intent; inbox for received provider events. Workers claim bounded batches with leases and at-least-once delivery. Handlers must be idempotent. Retry only classified transient responses with exponential backoff/jitter, honoring Retry-After and provider limits. Stop retries for auth, validation, capability or expired-quote failures. Dead-letter after configured attempts and page/queue operators by severity.

For a timeout after payment/order/dispatch write, state is uncertain: retain request key, query provider by external reference/idempotency key, then reconcile. Never make a second side effect until resolved. Circuit breakers are per provider operation/account; cached discovery can degrade only if license permits. Checkout fails closed when catalogue, delivery quote, payment, merchant availability or market capability cannot be verified.

Define SLOs after load and pilot evidence, not invented targets. Monitor API error/latency, quote expiry, provider timeouts, webhook lag/signature failures/duplicates, outbox age, unresolved payment/fulfilment state, merchant acceptance, refund age, cost per route and geographic coverage gaps. Keep correlation IDs without personal data.

## Recovery and operations

Before pilot: encrypted backups, point-in-time recovery, restore exercise, runbooks for key rotation/provider outage/duplicate payment/missed webhook/refund and merchant outage. Reconciliation jobs are read-only first, report differences, and require audited operator action for corrections. Add kill switches at provider, merchant, market and operation granularity. Test disable path.

Privacy/legal owners must resolve controller/processor roles, consent and lawful basis, cross-border transfer mechanism, retention, consumer disclosure, data subject rights, tax records and courier data terms per market. PCI scope must be confirmed with acquiring provider and qualified advisers; tokenization alone is not a compliance determination.

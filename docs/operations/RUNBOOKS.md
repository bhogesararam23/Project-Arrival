# Project Arrival — Operational Runbooks

**Scope:** Incident response and recovery procedures for the Project Arrival modular monolith (API, OutboxWorker, PostgreSQL/PostGIS).

---

## 1. Database Unavailable
- **Symptom:** `GET /health/ready` returns `503 Service Unavailable` (`database: "disconnected"`).
- **Immediate Action:**
  1. Check PostgreSQL instance health, connection count, and disk/CPU saturation.
  2. Verify network connectivity and `DATABASE_URL` secret validity.
  3. Confirm `OutboxWorker` has paused claiming (claims fail safely without corrupting state).
- **Recovery:** Restore DB connectivity; `/health/ready` recovers automatically on next `SELECT 1` probe.

## 2. Migration Failure
- **Symptom:** Deployment halts with `Migration checksum mismatch` or `Failed to acquire PostgreSQL migration advisory lock`.
- **Immediate Action:**
  1. **Checksum mismatch:** Never modify already-applied `.sql` files. Revert the unintended edit or author a new forward migration (`005_*.sql`).
  2. **Advisory lock contention:** Inspect `pg_locks` for lock ID `849201849` to verify if another deployment replica is actively migrating.
- **Recovery:** Once the lock clears or forward migration is committed, re-run `pnpm --filter @arrival/database run migrate`.

## 3. Outbox Backlog Spike
- **Symptom:** `GET /v1/ops/overview` shows rising `outboxPendingCount`.
- **Immediate Action:**
  1. Inspect `/health/ready` `worker` metrics (`running`, `lastProcessedAt`, `totalHandlerErrors`).
  2. Check downstream provider health (POS / Payment timeouts).
- **Recovery:** Scale worker poll/batch settings or suspend degraded capabilities (`POST /v1/ops/capabilities/:id/suspend`).

## 4. Dead-Letter Queue (DLQ) Spike
- **Symptom:** `outboxDeadLetterCount > 0` in `/v1/ops/overview`.
- **Immediate Action:**
  1. Inspect failed messages via `GET /v1/ops/outbox/dead-letter` (`lastError`, `attempts`, `eventType`).
  2. Fix underlying downstream bug or invalid data before replaying.
- **Recovery:** Replay individual messages via `POST /v1/ops/outbox/dead-letter/:messageId/replay` with `ops_admin` token and mandatory audit `reason`.

## 5. Webhook Processing Failures
- **Symptom:** `failedWebhooksCount > 0` in `/v1/ops/overview`.
- **Immediate Action:**
  1. Inspect `GET /v1/ops/webhooks/failed` for `processingError` or signature/timestamp rejections.
  2. Verify `WEBHOOK_SECRETS_JSON` rotation status if `401 INVALID_WEBHOOK_SIGNATURE` spikes.
- **Recovery:** Run `WebhookService.recoverPendingEvents()` for crashed pending rows after resolving root cause.

## 6. Payment Uncertainty (`reconciliation_required`)
- **Symptom:** `reconciliationRequiredCount > 0` in `/v1/ops/overview`; order `paymentState = 'reconciliation_required'`.
- **Immediate Action:**
  1. **Never** blindly re-charge the customer.
  2. Query the payment provider's dashboard/API directly using `idempotencyKey` and `orderId` from `GET /v1/ops/orders/:orderId`.
- **Recovery:** Once provider truth is confirmed, resolve via `POST /v1/ops/reconciliation/:orderId/resolve` (`ops_admin`) with explicit `resolvedState` and audit `reason`.

## 7. Merchant Submission Uncertainty (`submission_timeout`)
- **Symptom:** Order `merchantOrderState = 'submission_timeout'`.
- **Immediate Action:**
  1. Contact merchant or query POS status using `orderId` / `providerPosRef`.
- **Recovery:** Confirm whether merchant accepted or rejected; update state or trigger compensation refund if merchant did not receive/accept the order.

## 8. Capability Suspension (Kill Switch)
- **Symptom:** Provider outage, expired terms, or high error rate on a specific route.
- **Immediate Action:**
  1. Suspend immediately via `POST /v1/ops/capabilities/:capabilityId/suspend` (`ops_admin`) with incident ticket in `reason`.
  2. Verify subsequent `/v1/orders` requests for that route fail closed with `422 CAPABILITY_UNSUPPORTED`.

## 9. Failed Deployment / Rollback
- **Immediate Action:**
  1. Stop new traffic to unhealthy revision.
  2. If schema migration `00N` must be rolled back (and no destructive data loss occurred), run `pnpm --filter @arrival/database run rollback`.
  3. Redeploy previous container image.

## 10. Data Retention Incident
- **Symptom:** Discovery or PII records retained past policy (`max_retention_days` or `expires_at`).
- **Immediate Action:**
  1. Deactivate affected `source_registry` entry (`active = false`) to block new ingestion.
  2. Execute `RetentionCleanupService.purgeExpired()` for expired ephemeral sessions/grants/coordinates.
  3. Preserve financial `orders` and `audit_records` per legal retention rules.

-- 004_milestone3_core.down.sql
-- Symmetrical rollback for 004_milestone3_core.sql
BEGIN;

DROP INDEX IF EXISTS compensation_records_order_idx;
DROP TABLE IF EXISTS compensation_records;

ALTER TABLE provider_capabilities
  DROP COLUMN IF EXISTS revocation_reason,
  DROP COLUMN IF EXISTS revoked_at,
  DROP COLUMN IF EXISTS reviewed_by,
  DROP COLUMN IF EXISTS merchant_id,
  DROP COLUMN IF EXISTS provider_account_ref;

ALTER TABLE provider_capabilities
  DROP CONSTRAINT IF EXISTS provider_capabilities_status_check;

ALTER TABLE provider_capabilities
  ADD CONSTRAINT provider_capabilities_status_check CHECK (
    status IN ('unknown', 'pending', 'sandbox_tested', 'production_verified', 'disabled')
  );

DROP INDEX IF EXISTS webhook_inbox_status_idx;
ALTER TABLE webhook_inbox
  DROP COLUMN IF EXISTS correlation_order_id,
  DROP COLUMN IF EXISTS event_timestamp,
  DROP COLUMN IF EXISTS attempts,
  DROP COLUMN IF EXISTS status;

DROP INDEX IF EXISTS outbox_dead_letter_idx;
DROP INDEX IF EXISTS outbox_claimable_idx;
ALTER TABLE outbox
  DROP COLUMN IF EXISTS dead_lettered_at,
  DROP COLUMN IF EXISTS max_attempts,
  DROP COLUMN IF EXISTS lease_token,
  DROP COLUMN IF EXISTS worker_id;

ALTER TABLE orders
  DROP COLUMN IF EXISTS provider_pos_ref,
  DROP COLUMN IF EXISTS merchant_order_state,
  DROP COLUMN IF EXISTS fulfilment_state,
  DROP COLUMN IF EXISTS payment_state,
  DROP COLUMN IF EXISTS version;

ALTER TABLE checkout_quotes
  DROP COLUMN IF EXISTS version,
  DROP COLUMN IF EXISTS pricing_breakdown,
  DROP COLUMN IF EXISTS items_snapshot;

COMMIT;

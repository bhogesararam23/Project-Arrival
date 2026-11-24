-- 003_idempotency_locking.down.sql
BEGIN;

DROP INDEX IF EXISTS idempotency_status_locked_idx;

ALTER TABLE idempotency_records
  DROP COLUMN IF EXISTS locked_until,
  DROP COLUMN IF EXISTS status;

COMMIT;

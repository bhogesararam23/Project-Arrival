-- 003_idempotency_locking.sql
-- Adds status lifecycle and concurrency lease lock timestamp to idempotency records
BEGIN;

ALTER TABLE idempotency_records
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

CREATE INDEX IF NOT EXISTS idempotency_status_locked_idx
  ON idempotency_records (status, locked_until);

COMMIT;

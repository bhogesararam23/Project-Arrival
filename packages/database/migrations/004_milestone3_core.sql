-- 004_milestone3_core.sql
-- Milestone 3: Quotes items snapshot, optimistic concurrency, outbox worker leasing/DLQ,
-- webhook inbox lifecycle, capability governance, and compensation records.
BEGIN;

-- 1. Checkout quotes: persist enriched items, pricing breakdown, and version
ALTER TABLE checkout_quotes
  ADD COLUMN IF NOT EXISTS items_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pricing_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- 2. Orders: optimistic concurrency version and authoritative independent state snapshots
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS payment_state payment_state NOT NULL DEFAULT 'requires_action',
  ADD COLUMN IF NOT EXISTS fulfilment_state fulfilment_state NOT NULL DEFAULT 'quote_pending',
  ADD COLUMN IF NOT EXISTS merchant_order_state text NOT NULL DEFAULT 'submission_requested',
  ADD COLUMN IF NOT EXISTS provider_pos_ref text;

-- 3. Outbox: worker leasing, max attempts, and dead-letter support
ALTER TABLE outbox
  ADD COLUMN IF NOT EXISTS worker_id text,
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz;

CREATE INDEX IF NOT EXISTS outbox_claimable_idx
  ON outbox (available_at, created_at)
  WHERE published_at IS NULL AND dead_lettered_at IS NULL;

CREATE INDEX IF NOT EXISTS outbox_dead_letter_idx
  ON outbox (dead_lettered_at DESC)
  WHERE dead_lettered_at IS NOT NULL;

-- 4. Webhook inbox: processing lifecycle, attempts, event timestamp, and order correlation
ALTER TABLE webhook_inbox
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'dead_lettered')),
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  ADD COLUMN IF NOT EXISTS event_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS correlation_order_id uuid REFERENCES orders(id);

CREATE INDEX IF NOT EXISTS webhook_inbox_status_idx
  ON webhook_inbox (status, received_at DESC);

-- 5. Capability governance: full lifecycle statuses, account, merchant, reviewer, revocation
ALTER TABLE provider_capabilities
  DROP CONSTRAINT IF EXISTS provider_capabilities_status_check;

ALTER TABLE provider_capabilities
  ADD CONSTRAINT provider_capabilities_status_check CHECK (
    status IN (
      'not_configured',
      'researching',
      'sandbox_available',
      'sandbox_verified',
      'pending_commercial_approval',
      'pending_merchant_approval',
      'production_verified',
      'suspended',
      'revoked',
      'expired',
      'unknown',
      'pending',
      'sandbox_tested',
      'disabled'
    )
  );

ALTER TABLE provider_capabilities
  ADD COLUMN IF NOT EXISTS provider_account_ref text NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS merchant_id uuid REFERENCES merchants(id),
  ADD COLUMN IF NOT EXISTS reviewed_by text,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revocation_reason text;

-- 6. Compensation records for recoverable transaction orchestration
CREATE TABLE IF NOT EXISTS compensation_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  operation_type text NOT NULL CHECK (
    operation_type IN (
      'payment_refund',
      'payment_void',
      'pos_cancel',
      'fulfilment_cancel',
      'manual_reconciliation'
    )
  ),
  state text NOT NULL CHECK (
    state IN ('pending', 'succeeded', 'failed', 'reconciliation_required')
  ),
  idempotency_key text NOT NULL,
  provider_ref text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, operation_type, idempotency_key)
);

CREATE INDEX IF NOT EXISTS compensation_records_order_idx
  ON compensation_records (order_id, created_at DESC);

COMMIT;

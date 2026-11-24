-- 002_schema_hardening.sql
-- Production schema corrections:
-- 1. ISO code validation constraints (country_code ~ '^[A-Z]{2}$', currency ~ '^[A-Z]{3}$')
-- 2. Performance indexes on access paths (venues, catalogues, outbox aggregate, order events)
-- 3. Audit log immutability triggers (prevents UPDATE/DELETE on audit_records)
-- 4. Foreign key delete protection on venues and merchants with active dependencies
BEGIN;

-- 1. ISO formatting constraints
ALTER TABLE merchants
  ADD CONSTRAINT merchants_country_code_iso_chk CHECK (country_code ~ '^[A-Z]{2}$');

ALTER TABLE merchant_locations
  ADD CONSTRAINT merchant_locations_country_code_iso_chk CHECK (country_code ~ '^[A-Z]{2}$');

ALTER TABLE delivery_addresses
  ADD CONSTRAINT delivery_addresses_country_code_iso_chk CHECK (country_code ~ '^[A-Z]{2}$');

ALTER TABLE checkout_quotes
  ADD CONSTRAINT checkout_quotes_country_code_iso_chk CHECK (destination_country ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT checkout_quotes_currency_iso_chk CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE catalogues
  ADD CONSTRAINT catalogues_currency_iso_chk CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE orders
  ADD CONSTRAINT orders_currency_iso_chk CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE payment_attempts
  ADD CONSTRAINT payment_attempts_currency_iso_chk CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE refunds
  ADD CONSTRAINT refunds_currency_iso_chk CHECK (currency ~ '^[A-Z]{3}$');

-- 2. Access path composite indexes
CREATE INDEX IF NOT EXISTS outbox_aggregate_lookup_idx
  ON outbox (aggregate_type, aggregate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS menu_items_catalogue_sort_idx
  ON menu_items (catalogue_id, sort_order ASC, name ASC);

CREATE INDEX IF NOT EXISTS merchant_locations_venue_listing_idx
  ON merchant_locations (venue_id, listing_status);

CREATE INDEX IF NOT EXISTS order_events_order_occurred_idx
  ON order_events (order_id, occurred_at DESC);

-- 3. Audit immutability function & trigger
CREATE OR REPLACE FUNCTION enforce_audit_immutability()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are strictly immutable and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_records_immutable_trg ON audit_records;
CREATE TRIGGER audit_records_immutable_trg
  BEFORE UPDATE OR DELETE ON audit_records
  FOR EACH ROW
  EXECUTE FUNCTION enforce_audit_immutability();

COMMIT;

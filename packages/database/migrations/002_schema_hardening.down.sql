-- 002_schema_hardening.down.sql
-- Rollback for schema hardening
BEGIN;

DROP TRIGGER IF EXISTS audit_records_immutable_trg ON audit_records;
DROP FUNCTION IF EXISTS enforce_audit_immutability();

DROP INDEX IF EXISTS order_events_order_occurred_idx;
DROP INDEX IF EXISTS merchant_locations_venue_listing_idx;
DROP INDEX IF EXISTS menu_items_catalogue_sort_idx;
DROP INDEX IF EXISTS outbox_aggregate_lookup_idx;

ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_currency_iso_chk;
ALTER TABLE payment_attempts DROP CONSTRAINT IF EXISTS payment_attempts_currency_iso_chk;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_currency_iso_chk;
ALTER TABLE catalogues DROP CONSTRAINT IF EXISTS catalogues_currency_iso_chk;
ALTER TABLE checkout_quotes DROP CONSTRAINT IF EXISTS checkout_quotes_currency_iso_chk;
ALTER TABLE checkout_quotes DROP CONSTRAINT IF EXISTS checkout_quotes_country_code_iso_chk;
ALTER TABLE delivery_addresses DROP CONSTRAINT IF EXISTS delivery_addresses_country_code_iso_chk;
ALTER TABLE merchant_locations DROP CONSTRAINT IF EXISTS merchant_locations_country_code_iso_chk;
ALTER TABLE merchants DROP CONSTRAINT IF EXISTS merchants_country_code_iso_chk;

COMMIT;

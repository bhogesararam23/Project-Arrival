-- 001_initial_platform.sql
-- Base schema for Project Arrival platform
BEGIN;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE order_state AS ENUM ('submitted','awaiting_merchant','accepted','preparing','ready_for_pickup','completed','rejected','customer_cancelled','merchant_cancelled','failed','delivery_exception');
CREATE TYPE payment_state AS ENUM ('requires_action','authorized','capture_pending','captured','failed','void_pending','voided','refund_pending','partially_refunded','refunded','reconciliation_required');
CREATE TYPE fulfilment_state AS ENUM ('quote_pending','quoted','requested','assignment_pending','assigned','at_pickup','picked_up','in_transit','delivered','failed','cancelled','reconciliation_required');

CREATE TABLE customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email_ciphertext bytea, phone_ciphertext bytea,
 email_lookup_hash bytea UNIQUE, phone_lookup_hash bytea UNIQUE,
 locale text NOT NULL DEFAULT 'en', created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE guest_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_digest bytea NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked_at timestamptz,
 CHECK (expires_at > created_at)
);
CREATE TABLE idempotency_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), principal_scope text NOT NULL, operation text NOT NULL,
 idempotency_key text NOT NULL, request_hash bytea NOT NULL, response_status integer,
 response_body jsonb, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 UNIQUE(principal_scope,operation,idempotency_key), CHECK(expires_at > created_at)
);
CREATE TABLE merchants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), legal_name text NOT NULL, country_code char(2) NOT NULL,
 verification_state text NOT NULL CHECK (verification_state IN ('pending','verified','rejected','suspended')),
 verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE merchant_users (
 merchant_id uuid NOT NULL REFERENCES merchants(id), customer_id uuid NOT NULL REFERENCES customers(id),
 role text NOT NULL CHECK (role IN ('owner','manager','staff','read_only')), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(merchant_id, customer_id)
);
CREATE TABLE venues (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), display_name text NOT NULL, normalized_name text NOT NULL,
 listing_status text NOT NULL CHECK (listing_status IN ('pending_review','verified','temporarily_unavailable','suspended','closed')),
 primary_language text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX venues_name_trgm_idx ON venues USING gin(normalized_name gin_trgm_ops);
CREATE TABLE merchant_locations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), venue_id uuid NOT NULL REFERENCES venues(id),
 merchant_id uuid REFERENCES merchants(id), display_name text NOT NULL, country_code char(2) NOT NULL,
 address_ciphertext bytea, public_address jsonb, location geography(Point,4326) NOT NULL,
 timezone text NOT NULL, listing_status text NOT NULL, verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX merchant_locations_geo_gix ON merchant_locations USING gist(location);
CREATE INDEX merchant_locations_country_idx ON merchant_locations(country_code, listing_status);

CREATE TABLE source_registry (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_key text NOT NULL UNIQUE, source_name text NOT NULL,
 terms_url text NOT NULL, license_name text, allowed_purposes text[] NOT NULL,
 retention_policy jsonb NOT NULL, attribution_text text, reviewed_at timestamptz NOT NULL,
 next_review_at timestamptz NOT NULL, active boolean NOT NULL DEFAULT false, CHECK(next_review_at > reviewed_at)
);
CREATE TABLE source_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL REFERENCES source_registry(id),
 external_id text NOT NULL, entity_kind text NOT NULL CHECK(entity_kind IN ('venue','location','menu','other')),
 venue_id uuid REFERENCES venues(id), location_id uuid REFERENCES merchant_locations(id),
 retrieved_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL, source_updated_at timestamptz,
 field_provenance jsonb NOT NULL, confidence numeric(5,4) CHECK(confidence BETWEEN 0 AND 1),
 withdrawn_at timestamptz, UNIQUE(source_id, external_id), CHECK(last_seen_at >= retrieved_at)
);
CREATE INDEX observations_venue_idx ON source_observations(venue_id) WHERE venue_id IS NOT NULL;
CREATE TABLE entity_merge_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), survivor_venue_id uuid NOT NULL REFERENCES venues(id),
 merged_venue_id uuid NOT NULL REFERENCES venues(id), decision text NOT NULL CHECK(decision IN ('proposed','approved','reversed')),
 rationale jsonb NOT NULL, decided_by uuid REFERENCES customers(id), decided_at timestamptz NOT NULL DEFAULT now(),
 CHECK(survivor_venue_id <> merged_venue_id)
);

CREATE TABLE catalogues (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), location_id uuid NOT NULL REFERENCES merchant_locations(id),
 source_observation_id uuid REFERENCES source_observations(id), version bigint NOT NULL, currency char(3) NOT NULL,
 status text NOT NULL CHECK(status IN ('draft','published','retired')), published_at timestamptz, valid_until timestamptz,
 UNIQUE(location_id, version)
);
CREATE TABLE menu_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), catalogue_id uuid NOT NULL REFERENCES catalogues(id),
 external_item_key text, name text NOT NULL, description text, price_minor bigint NOT NULL CHECK(price_minor >= 0),
 available boolean NOT NULL DEFAULT true, allergens jsonb NOT NULL DEFAULT '[]', sort_order integer NOT NULL DEFAULT 0,
 UNIQUE(catalogue_id, external_item_key)
);
CREATE TABLE modifier_groups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), catalogue_id uuid NOT NULL REFERENCES catalogues(id),
 name text NOT NULL, minimum_selections integer NOT NULL DEFAULT 0 CHECK(minimum_selections >= 0),
 maximum_selections integer NOT NULL CHECK(maximum_selections >= minimum_selections)
);
CREATE TABLE modifier_options (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), group_id uuid NOT NULL REFERENCES modifier_groups(id),
 name text NOT NULL, price_delta_minor bigint NOT NULL, available boolean NOT NULL DEFAULT true
);
CREATE TABLE item_modifier_groups (
 item_id uuid NOT NULL REFERENCES menu_items(id), group_id uuid NOT NULL REFERENCES modifier_groups(id), PRIMARY KEY(item_id,group_id)
);

CREATE TABLE guest_order_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_digest bytea NOT NULL UNIQUE,
 scope text NOT NULL CHECK(scope IN ('read_order','cancel_order')), expires_at timestamptz NOT NULL,
 revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE delivery_addresses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid REFERENCES customers(id),
 guest_session_id uuid REFERENCES guest_sessions(id), country_code char(2) NOT NULL,
 address_ciphertext bytea NOT NULL, recipient_ciphertext bytea NOT NULL,
 resolution_source_id uuid REFERENCES source_registry(id), resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(num_nonnulls(customer_id, guest_session_id) = 1)
);

CREATE TABLE restricted_delivery_coordinates (
 delivery_address_id uuid PRIMARY KEY REFERENCES delivery_addresses(id) ON DELETE CASCADE,
 point geography(Point,4326) NOT NULL,
 resolved_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 CHECK(expires_at > resolved_at)
);
CREATE INDEX restricted_delivery_coordinates_geo_gix ON restricted_delivery_coordinates USING gist(point);

CREATE TABLE checkout_quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), location_id uuid NOT NULL REFERENCES merchant_locations(id),
 delivery_address_id uuid NOT NULL REFERENCES delivery_addresses(id),
 catalogue_id uuid NOT NULL REFERENCES catalogues(id), guest_session_id uuid REFERENCES guest_sessions(id),
 customer_id uuid REFERENCES customers(id), destination_country char(2) NOT NULL, currency char(3) NOT NULL,
 subtotal_minor bigint NOT NULL CHECK(subtotal_minor >= 0), tax_minor bigint NOT NULL CHECK(tax_minor >= 0),
 delivery_minor bigint NOT NULL CHECK(delivery_minor >= 0), service_fee_minor bigint NOT NULL CHECK(service_fee_minor >= 0),
 total_minor bigint NOT NULL CHECK(total_minor = subtotal_minor + tax_minor + delivery_minor + service_fee_minor),
 provider_quote_ref text, expires_at timestamptz NOT NULL, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(num_nonnulls(guest_session_id, customer_id) = 1)
);

CREATE TABLE orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), location_id uuid NOT NULL REFERENCES merchant_locations(id),
 delivery_address_id uuid NOT NULL REFERENCES delivery_addresses(id),
 quote_id uuid NOT NULL UNIQUE REFERENCES checkout_quotes(id), customer_id uuid REFERENCES customers(id),
 guest_session_id uuid REFERENCES guest_sessions(id),
 state order_state NOT NULL DEFAULT 'submitted', currency char(3) NOT NULL, total_minor bigint NOT NULL CHECK(total_minor >= 0),
 purchase_snapshot jsonb NOT NULL,
 idempotency_record_id uuid NOT NULL UNIQUE REFERENCES idempotency_records(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(num_nonnulls(customer_id, guest_session_id) = 1)
);

ALTER TABLE guest_order_grants
 ADD COLUMN order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE;
CREATE INDEX guest_order_grants_order_idx ON guest_order_grants(order_id,scope);

CREATE INDEX orders_location_created_idx ON orders(location_id,created_at DESC);
CREATE INDEX orders_state_updated_idx ON orders(state,updated_at);

CREATE TABLE order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id),
 source_menu_item_id uuid REFERENCES menu_items(id), item_name_snapshot text NOT NULL,
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100), unit_price_minor bigint NOT NULL CHECK(unit_price_minor >= 0),
 modifiers_snapshot jsonb NOT NULL DEFAULT '[]', line_total_minor bigint NOT NULL CHECK(line_total_minor >= 0)
);

CREATE TABLE order_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id),
 from_state order_state, to_state order_state NOT NULL, source text NOT NULL, actor_id uuid REFERENCES customers(id),
 provider_event_id text, occurred_at timestamptz, received_at timestamptz NOT NULL DEFAULT now(),
 details_redacted jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX order_events_order_time_idx ON order_events(order_id,received_at);

CREATE TABLE payment_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id),
 provider_key text NOT NULL, provider_account_ref text NOT NULL, provider_payment_ref text,
 state payment_state NOT NULL, amount_minor bigint NOT NULL CHECK(amount_minor >= 0), currency char(3) NOT NULL,
 idempotency_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider_key,provider_account_ref,idempotency_key)
);
CREATE UNIQUE INDEX payment_provider_ref_uq ON payment_attempts(provider_key,provider_account_ref,provider_payment_ref) WHERE provider_payment_ref IS NOT NULL;

CREATE TABLE payment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_attempt_id uuid NOT NULL REFERENCES payment_attempts(id),
 event_type text NOT NULL, amount_minor bigint CHECK(amount_minor >= 0), provider_event_ref text,
 occurred_at timestamptz, received_at timestamptz NOT NULL DEFAULT now(), redacted_payload jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE refunds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_attempt_id uuid NOT NULL REFERENCES payment_attempts(id),
 amount_minor bigint NOT NULL CHECK(amount_minor > 0), currency char(3) NOT NULL,
 state text NOT NULL CHECK(state IN ('requested','pending','succeeded','failed','reconciliation_required')),
 idempotency_key text NOT NULL, provider_ref text, reason_code text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(payment_attempt_id,idempotency_key)
);

CREATE TABLE fulfilment_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id),
 provider_key text NOT NULL, provider_account_ref text NOT NULL, provider_delivery_ref text,
 state fulfilment_state NOT NULL, quote_ref text, quote_expires_at timestamptz, fee_minor bigint CHECK(fee_minor >= 0),
 currency char(3), idempotency_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider_key,provider_account_ref,idempotency_key)
);
CREATE UNIQUE INDEX fulfilment_provider_ref_uq ON fulfilment_attempts(provider_key,provider_account_ref,provider_delivery_ref) WHERE provider_delivery_ref IS NOT NULL;

CREATE TABLE fulfilment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fulfilment_attempt_id uuid NOT NULL REFERENCES fulfilment_attempts(id),
 event_type text NOT NULL, source text NOT NULL, provider_event_ref text, occurred_at timestamptz,
 received_at timestamptz NOT NULL DEFAULT now(), point geography(Point,4326), details_redacted jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX fulfilment_events_attempt_time_idx ON fulfilment_events(fulfilment_attempt_id,received_at);

CREATE TABLE provider_capabilities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_key text NOT NULL, capability text NOT NULL,
 country_code char(2) NOT NULL, location_id uuid REFERENCES merchant_locations(id), currency char(3),
 service_area geometry(MultiPolygon,4326),
 status text NOT NULL CHECK(status IN ('unknown','pending','sandbox_tested','production_verified','disabled')),
 evidence_url text NOT NULL, reviewed_at timestamptz NOT NULL, expires_at timestamptz,
 UNIQUE NULLS NOT DISTINCT (provider_key,capability,country_code,location_id)
);
CREATE INDEX provider_capability_area_gix ON provider_capabilities USING gist(service_area) WHERE service_area IS NOT NULL;

CREATE TABLE webhook_inbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_key text NOT NULL, provider_account_ref text NOT NULL,
 provider_event_ref text NOT NULL, event_type text NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
 signature_verified boolean NOT NULL, payload_digest bytea NOT NULL, redacted_payload jsonb NOT NULL,
 processed_at timestamptz, processing_error text,
 UNIQUE(provider_key,provider_account_ref,provider_event_ref)
);

CREATE TABLE outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), aggregate_type text NOT NULL, aggregate_id uuid NOT NULL,
 event_type text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 available_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0),
 locked_until timestamptz, published_at timestamptz, last_error text
);
CREATE INDEX outbox_pending_idx ON outbox(available_at,created_at) WHERE published_at IS NULL;

CREATE TABLE audit_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES customers(id), actor_role text NOT NULL,
 action text NOT NULL, resource_type text NOT NULL, resource_id uuid NOT NULL, reason text, request_id text,
 occurred_at timestamptz NOT NULL DEFAULT now(), metadata_redacted jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_resource_time_idx ON audit_records(resource_type,resource_id,occurred_at DESC);

COMMIT;

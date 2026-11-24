import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadMigrations } from '../src/validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const migrationsDir = join(__dirname, '../migrations');

describe('Database index and constraint verification', () => {
  it('ensures core performance indexes exist across all migrations', async () => {
    const migrations = await loadMigrations(migrationsDir);
    const fullSql = migrations.map((m) => m.upSql).join('\n');

    // Verification of spatial indexes
    expect(fullSql).toContain('CREATE INDEX merchant_locations_geo_gix ON merchant_locations USING gist(location)');
    expect(fullSql).toContain('CREATE INDEX restricted_delivery_coordinates_geo_gix ON restricted_delivery_coordinates USING gist(point)');
    expect(fullSql).toContain('CREATE INDEX provider_capability_area_gix ON provider_capabilities USING gist(service_area)');

    // Verification of trigram search index
    expect(fullSql).toContain('CREATE INDEX venues_name_trgm_idx ON venues USING gin(normalized_name gin_trgm_ops)');

    // Verification of outbox polling index
    expect(fullSql).toContain('CREATE INDEX outbox_pending_idx ON outbox(available_at,created_at) WHERE published_at IS NULL');

    // Verification of hardened composite indexes
    expect(fullSql).toContain('CREATE INDEX IF NOT EXISTS outbox_aggregate_lookup_idx');
    expect(fullSql).toContain('CREATE INDEX IF NOT EXISTS menu_items_catalogue_sort_idx');
    expect(fullSql).toContain('CREATE INDEX IF NOT EXISTS order_events_order_occurred_idx');
  });

  it('ensures audit immutability trigger is attached to audit_records', async () => {
    const migrations = await loadMigrations(migrationsDir);
    const hardening = migrations.find((m) => m.version === '002');
    expect(hardening?.upSql).toContain('CREATE TRIGGER audit_records_immutable_trg');
    expect(hardening?.upSql).toContain('BEFORE UPDATE OR DELETE ON audit_records');
  });
});

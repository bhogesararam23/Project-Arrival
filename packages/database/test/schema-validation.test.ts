import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateMigrations, loadMigrations } from '../src/validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const migrationsDir = join(__dirname, '../migrations');

describe('Database migrations validation', () => {
  it('validates that all platform migrations are strictly symmetrical and pass syntax rules', async () => {
    const issues = await validateMigrations(migrationsDir);
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('loads all platform migrations with non-empty up and down scripts', async () => {
    const migrations = await loadMigrations(migrationsDir);
    expect(migrations.length).toBeGreaterThanOrEqual(2);

    const m001 = migrations.find((m) => m.version === '001');
    expect(m001).toBeDefined();
    expect(m001?.upSql).toContain('CREATE TABLE venues');
    expect(m001?.downSql).toContain('DROP TABLE IF EXISTS venues');

    const m002 = migrations.find((m) => m.version === '002');
    expect(m002).toBeDefined();
    expect(m002?.upSql).toContain('merchants_country_code_iso_chk');
    expect(m002?.downSql).toContain('DROP CONSTRAINT IF EXISTS merchants_country_code_iso_chk');
  });
});

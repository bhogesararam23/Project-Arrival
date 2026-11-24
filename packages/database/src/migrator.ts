import type { MigrationFile } from './validator.js';

export interface MigrationClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export interface AppliedMigration {
  version: string;
  name: string;
  applied_at: Date;
}

/**
 * Migration engine supporting forward migrations, rollback, and dry-run execution.
 */
export class DatabaseMigrator {
  constructor(
    private readonly client: MigrationClient,
    private readonly migrations: MigrationFile[]
  ) {}

  async initMigrationTable(): Promise<void> {
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        name text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  }

  async getAppliedMigrations(): Promise<AppliedMigration[]> {
    await this.initMigrationTable();
    const res = await this.client.query(`
      SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC;
    `);
    return res.rows;
  }

  async up(): Promise<string[]> {
    await this.initMigrationTable();
    const applied = await this.getAppliedMigrations();
    const appliedVersions = new Set(applied.map((a) => a.version));
    const executed: string[] = [];

    for (const m of this.migrations) {
      if (!appliedVersions.has(m.version)) {
        await this.client.query(m.upSql);
        await this.client.query(
          `INSERT INTO schema_migrations (version, name) VALUES ($1, $2);`,
          [m.version, m.name]
        );
        executed.push(m.version);
      }
    }

    return executed;
  }

  async down(): Promise<string | null> {
    await this.initMigrationTable();
    const applied = await this.getAppliedMigrations();
    if (applied.length === 0) {
      return null;
    }

    const lastApplied = applied[applied.length - 1];
    if (!lastApplied) return null;

    const migration = this.migrations.find((m) => m.version === lastApplied.version);
    if (!migration) {
      throw new Error(`Cannot rollback unknown migration version: ${lastApplied.version}`);
    }
    if (!migration.downSql) {
      throw new Error(`Migration ${migration.version} does not have a down SQL script`);
    }

    await this.client.query(migration.downSql);
    await this.client.query(`DELETE FROM schema_migrations WHERE version = $1;`, [migration.version]);

    return migration.version;
  }
}

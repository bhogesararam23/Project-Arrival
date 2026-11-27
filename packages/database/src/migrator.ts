import { createHash } from 'node:crypto';
import type { MigrationFile } from './validator.js';

export const MIGRATION_ADVISORY_LOCK_ID = 849201849;

export interface MigrationClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
  connect?: () => Promise<MigrationSessionClient>;
}

export interface MigrationSessionClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
  release: () => void;
}

export interface AppliedMigration {
  version: string;
  name: string;
  checksum?: string | null;
  applied_at: Date;
}

export interface MigratorOptions {
  /**
   * When true (default), advisory lock acquisition failure aborts migration execution
   * rather than silently continuing unlocked. Set false only for unit-test mocks
   * that do not implement pg_advisory_lock.
   */
  requireLock?: boolean;
}

export function computeMigrationChecksum(sql: string): string {
  return createHash('sha256').update(sql.trim(), 'utf8').digest('hex');
}

/**
 * Migration engine supporting forward migrations, rollback, checksum integrity verification,
 * dedicated-session pinning for pool clients, and fail-closed advisory locking.
 */
export class DatabaseMigrator {
  private readonly requireLock: boolean;

  constructor(
    private readonly client: MigrationClient,
    private readonly migrations: MigrationFile[],
    options?: MigratorOptions
  ) {
    this.requireLock = options?.requireLock ?? true;
  }

  private async withSession<T>(fn: (session: MigrationSessionClient | MigrationClient) => Promise<T>): Promise<T> {
    if (typeof this.client.connect === 'function') {
      const conn = await this.client.connect();
      try {
        return await fn(conn);
      } finally {
        conn.release();
      }
    }
    return fn(this.client);
  }

  async initMigrationTable(session: MigrationClient = this.client): Promise<void> {
    await session.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        name text NOT NULL,
        checksum text,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    try {
      await session.query(`
        ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text;
      `);
    } catch {
      // Simplified mock engines that don't support ADD COLUMN IF NOT EXISTS
    }
  }

  async getAppliedMigrations(session: MigrationClient = this.client): Promise<AppliedMigration[]> {
    await this.initMigrationTable(session);
    const res = await session.query(`
      SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version ASC;
    `);
    return res.rows;
  }

  private async acquireLock(session: MigrationClient): Promise<boolean> {
    try {
      await session.query(`SELECT pg_advisory_lock($1);`, [MIGRATION_ADVISORY_LOCK_ID]);
      return true;
    } catch (err) {
      if (this.requireLock) {
        throw new Error(
          `Failed to acquire PostgreSQL migration advisory lock (${MIGRATION_ADVISORY_LOCK_ID}): ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
      return false;
    }
  }

  private async releaseLock(session: MigrationClient): Promise<void> {
    try {
      await session.query(`SELECT pg_advisory_unlock($1);`, [MIGRATION_ADVISORY_LOCK_ID]);
    } catch {
      // Connection closing releases session advisory locks automatically
    }
  }

  async up(): Promise<string[]> {
    return this.withSession(async (session) => {
      const lockAcquired = await this.acquireLock(session);
      try {
        await this.initMigrationTable(session);
        const applied = await this.getAppliedMigrations(session);
        const appliedMap = new Map(applied.map((a) => [a.version, a]));
        const executed: string[] = [];

        // 1. Verify checksums of already applied migrations to detect tampering
        for (const m of this.migrations) {
          const appliedRecord = appliedMap.get(m.version);
          if (appliedRecord && appliedRecord.checksum) {
            const currentChecksum = computeMigrationChecksum(m.upSql);
            if (appliedRecord.checksum !== currentChecksum) {
              throw new Error(
                `Migration checksum mismatch for version ${m.version} (${m.name}): database has applied checksum ${appliedRecord.checksum}, but repository migration has checksum ${currentChecksum}. Modifying already-applied migrations is forbidden.`
              );
            }
          }
        }

        // 2. Execute pending migrations
        for (const m of this.migrations) {
          if (!appliedMap.has(m.version)) {
            const checksum = computeMigrationChecksum(m.upSql);
            await session.query(m.upSql);
            await session.query(
              `INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3);`,
              [m.version, m.name, checksum]
            );
            executed.push(m.version);
          }
        }

        return executed;
      } finally {
        if (lockAcquired) {
          await this.releaseLock(session);
        }
      }
    });
  }

  async down(): Promise<string | null> {
    return this.withSession(async (session) => {
      const lockAcquired = await this.acquireLock(session);
      try {
        await this.initMigrationTable(session);
        const applied = await this.getAppliedMigrations(session);
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

        await session.query(migration.downSql);
        await session.query(`DELETE FROM schema_migrations WHERE version = $1;`, [migration.version]);

        return migration.version;
      } finally {
        if (lockAcquired) {
          await this.releaseLock(session);
        }
      }
    });
  }
}

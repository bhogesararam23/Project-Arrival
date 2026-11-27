import { describe, it, expect } from 'vitest';
import { DatabaseMigrator, type MigrationClient, computeMigrationChecksum } from '../src/migrator.js';
import type { MigrationFile } from '../src/validator.js';

class MockPgClient implements MigrationClient {
  public executedQueries: string[] = [];
  public appliedRows: Array<{ version: string; name: string; checksum?: string; applied_at: Date }> = [];

  async query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> {
    this.executedQueries.push(sql.trim());
    if (sql.includes('SELECT version, name, checksum, applied_at FROM schema_migrations')) {
      return { rows: [...this.appliedRows] };
    }
    if (sql.includes('INSERT INTO schema_migrations') && params) {
      this.appliedRows.push({
        version: String(params[0]),
        name: String(params[1]),
        checksum: params[2] ? String(params[2]) : undefined,
        applied_at: new Date(),
      });
      return { rows: [] };
    }
    if (sql.includes('DELETE FROM schema_migrations WHERE version') && params) {
      this.appliedRows = this.appliedRows.filter((r) => r.version !== params[0]);
      return { rows: [] };
    }
    return { rows: [] };
  }
}

describe('DatabaseMigrator', () => {
  const dummyMigrations: MigrationFile[] = [
    {
      version: '001',
      name: 'initial',
      upPath: '001.sql',
      downPath: '001.down.sql',
      upSql: 'BEGIN; CREATE TABLE a (); COMMIT;',
      downSql: 'BEGIN; DROP TABLE a; COMMIT;',
    },
    {
      version: '002',
      name: 'secondary',
      upPath: '002.sql',
      downPath: '002.down.sql',
      upSql: 'BEGIN; CREATE TABLE b (); COMMIT;',
      downSql: 'BEGIN; DROP TABLE b; COMMIT;',
    },
  ];

  it('applies pending migrations in sequence with checksums and advisory locks', async () => {
    const client = new MockPgClient();
    const migrator = new DatabaseMigrator(client, dummyMigrations);

    const executed = await migrator.up();
    expect(executed).toEqual(['001', '002']);
    expect(client.appliedRows).toHaveLength(2);
    expect(client.appliedRows[0]?.checksum).toBe(computeMigrationChecksum(dummyMigrations[0]!.upSql));
    expect(client.appliedRows[1]?.checksum).toBe(computeMigrationChecksum(dummyMigrations[1]!.upSql));

    // Lock and unlock queries executed
    expect(client.executedQueries.some((q) => q.includes('pg_advisory_lock'))).toBe(true);
    expect(client.executedQueries.some((q) => q.includes('pg_advisory_unlock'))).toBe(true);

    // Re-running up executes nothing
    const reExecuted = await migrator.up();
    expect(reExecuted).toEqual([]);
  });

  it('detects and rejects modified migrations with checksum mismatch error', async () => {
    const client = new MockPgClient();
    const migrator = new DatabaseMigrator(client, dummyMigrations);

    // Apply migrations
    await migrator.up();

    // Now tamper with the migration SQL content
    const tamperedMigrations: MigrationFile[] = [
      {
        ...dummyMigrations[0]!,
        upSql: 'BEGIN; CREATE TABLE a_tampered (); COMMIT;', // altered SQL!
      },
      dummyMigrations[1]!,
    ];

    const tamperMigrator = new DatabaseMigrator(client, tamperedMigrations);
    await expect(tamperMigrator.up()).rejects.toThrow(
      /Migration checksum mismatch for version 001/
    );
  });

  it('rolls back migrations in reverse order', async () => {
    const client = new MockPgClient();
    const migrator = new DatabaseMigrator(client, dummyMigrations);

    await migrator.up();
    expect(client.appliedRows).toHaveLength(2);

    const rolledBack = await migrator.down();
    expect(rolledBack).toBe('002');
    expect(client.appliedRows).toHaveLength(1);
    expect(client.appliedRows[0]?.version).toBe('001');

    const rolledBackFirst = await migrator.down();
    expect(rolledBackFirst).toBe('001');
    expect(client.appliedRows).toHaveLength(0);

    const rolledBackEmpty = await migrator.down();
    expect(rolledBackEmpty).toBeNull();
  });

  it('fails closed when advisory lock acquisition fails and requireLock is true', async () => {
    const failingLockClient: MigrationClient = {
      async query(sql: string) {
        if (sql.includes('pg_advisory_lock')) {
          throw new Error('lock timeout');
        }
        return { rows: [] };
      },
    };

    const strictMigrator = new DatabaseMigrator(failingLockClient, dummyMigrations, { requireLock: true });
    await expect(strictMigrator.up()).rejects.toThrow(/Failed to acquire PostgreSQL migration advisory lock/);
  });
});

import { describe, it, expect } from 'vitest';
import { DatabaseMigrator, type MigrationClient } from '../src/migrator.js';
import type { MigrationFile } from '../src/validator.js';

class MockPgClient implements MigrationClient {
  public executedQueries: string[] = [];
  public appliedRows: Array<{ version: string; name: string; applied_at: Date }> = [];

  async query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> {
    this.executedQueries.push(sql.trim());
    if (sql.includes('SELECT version, name, applied_at FROM schema_migrations')) {
      return { rows: [...this.appliedRows] };
    }
    if (sql.includes('INSERT INTO schema_migrations') && params) {
      this.appliedRows.push({
        version: String(params[0]),
        name: String(params[1]),
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

  it('applies pending migrations in sequence', async () => {
    const client = new MockPgClient();
    const migrator = new DatabaseMigrator(client, dummyMigrations);

    const executed = await migrator.up();
    expect(executed).toEqual(['001', '002']);
    expect(client.appliedRows).toHaveLength(2);

    // Re-running up should execute nothing
    const reExecuted = await migrator.up();
    expect(reExecuted).toEqual([]);
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
});

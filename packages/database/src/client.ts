import pg from 'pg';

export type DatabasePool = pg.Pool;

export interface DatabaseConfig {
  connectionString?: string | undefined;
  maxPoolSize?: number | undefined;
  connectionTimeoutMillis?: number | undefined;
  idleTimeoutMillis?: number | undefined;
  statementTimeoutMs?: number | undefined;
}

export interface DatabasePoolMetrics {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

export function createDatabasePool(config?: DatabaseConfig): pg.Pool {
  const connectionString = config?.connectionString || process.env['DATABASE_URL'];
  const statementTimeout = config?.statementTimeoutMs ?? 10_000;
  return new pg.Pool({
    connectionString,
    max: config?.maxPoolSize ?? 10,
    connectionTimeoutMillis: config?.connectionTimeoutMillis ?? 5_000,
    idleTimeoutMillis: config?.idleTimeoutMillis ?? 30_000,
    options: `-c statement_timeout=${statementTimeout}`,
  });
}

export async function checkDatabaseHealth(
  pool: pg.Pool
): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await pool.query('SELECT 1;');
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown database error',
    };
  }
}

export function getPoolMetrics(pool: pg.Pool): DatabasePoolMetrics {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

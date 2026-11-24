import pg from 'pg';

export interface DatabaseConfig {
  connectionString?: string | undefined;
  maxPoolSize?: number | undefined;
}

export function createDatabasePool(config?: DatabaseConfig): pg.Pool {
  const connectionString = config?.connectionString || process.env['DATABASE_URL'];
  return new pg.Pool({
    connectionString,
    max: config?.maxPoolSize || 10,
    idleTimeoutMillis: 30000,
  });
}

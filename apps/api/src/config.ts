export interface AppConfig {
  port: number;
  host: string;
  environment: 'development' | 'test' | 'production';
  databaseUrl?: string | undefined;
  defaultCurrency: string;
  quoteTtlSeconds: number;
}

export function loadConfig(): AppConfig {
  const environment = (process.env['NODE_ENV'] as AppConfig['environment']) || 'development';
  const databaseUrl = process.env['DATABASE_URL'];

  if (environment === 'production' && !databaseUrl) {
    throw new Error(
      'FATAL CONFIGURATION ERROR: DATABASE_URL is strictly required when running in production environment. In-memory storage is not permitted for production transactions.'
    );
  }

  return {
    port: Number(process.env['PORT'] || 3000),
    host: process.env['HOST'] || '0.0.0.0',
    environment,
    databaseUrl,
    defaultCurrency: process.env['DEFAULT_CURRENCY'] || 'GBP',
    quoteTtlSeconds: Number(process.env['QUOTE_TTL_SECONDS'] || 900), // 15 minutes
  };
}

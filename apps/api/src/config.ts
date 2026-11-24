export interface AppConfig {
  port: number;
  host: string;
  environment: 'development' | 'test' | 'production';
  databaseUrl?: string | undefined;
  defaultCurrency: string;
  quoteTtlSeconds: number;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env['PORT'] || 3000),
    host: process.env['HOST'] || '0.0.0.0',
    environment: (process.env['NODE_ENV'] as AppConfig['environment']) || 'development',
    databaseUrl: process.env['DATABASE_URL'],
    defaultCurrency: process.env['DEFAULT_CURRENCY'] || 'GBP',
    quoteTtlSeconds: Number(process.env['QUOTE_TTL_SECONDS'] || 900), // 15 minutes
  };
}

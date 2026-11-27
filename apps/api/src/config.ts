import type { OperatorRole } from '@arrival/contracts';

export interface OperatorTokenEntry {
  token: string;
  actorId: string;
  role: OperatorRole;
}

export interface AppConfig {
  port: number;
  host: string;
  environment: 'development' | 'test' | 'production';
  databaseUrl?: string | undefined;
  defaultCurrency: string;
  quoteTtlSeconds: number;
  operatorTokens: OperatorTokenEntry[];
  webhookSecrets: Record<string, string>;
}

export function loadConfig(): AppConfig {
  const environment = (process.env['NODE_ENV'] as AppConfig['environment']) || 'development';
  const databaseUrl = process.env['DATABASE_URL'];

  if (environment === 'production' && !databaseUrl) {
    throw new Error(
      'FATAL CONFIGURATION ERROR: DATABASE_URL is strictly required when running in production environment. In-memory storage is not permitted for production transactions.'
    );
  }

  let operatorTokens: OperatorTokenEntry[] = [];
  const rawOpsJson = process.env['OPS_AUTH_TOKENS_JSON'];
  if (rawOpsJson) {
    const parsed = JSON.parse(rawOpsJson);
    if (!Array.isArray(parsed)) {
      throw new Error('OPS_AUTH_TOKENS_JSON must be a JSON array');
    }
    operatorTokens = parsed;
  }

  let webhookSecrets: Record<string, string> = {};
  const rawWhJson = process.env['WEBHOOK_SECRETS_JSON'];
  if (rawWhJson) {
    const parsed = JSON.parse(rawWhJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('WEBHOOK_SECRETS_JSON must be a JSON object mapping providerKey -> secret');
    }
    webhookSecrets = parsed as Record<string, string>;
  }

  return {
    port: Number(process.env['PORT'] || 3000),
    host: process.env['HOST'] || '0.0.0.0',
    environment,
    databaseUrl,
    defaultCurrency: process.env['DEFAULT_CURRENCY'] || 'GBP',
    quoteTtlSeconds: Number(process.env['QUOTE_TTL_SECONDS'] || 900),
    operatorTokens,
    webhookSecrets,
  };
}

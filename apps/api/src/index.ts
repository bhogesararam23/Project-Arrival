import {
  createDatabasePool,
  checkDatabaseHealth,
  PgOutboxRepository,
  PgOrderRepository,
  PgPaymentRepository,
  PgAuditRepository,
} from '@arrival/database';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { OutboxWorker } from './workers/outbox-worker.js';
import { OrderOrchestrator } from './services/order-orchestrator.js';
import {
  MockMerchantPosAdapter,
  MockPaymentAdapter,
} from './adapters/provider-adapters.js';
import { HmacSha256TestWebhookVerifier } from './services/webhook-service.js';
import { StaticMapOperatorVerifier } from './middleware/ops-auth.js';

const config = loadConfig();
const pool = config.databaseUrl
  ? createDatabasePool({ connectionString: config.databaseUrl })
  : undefined;

const operatorVerifier = new StaticMapOperatorVerifier(config.operatorTokens);
const webhookVerifier = new HmacSha256TestWebhookVerifier(config.webhookSecrets);

let outboxWorker: OutboxWorker | undefined;
if (pool) {
  const orchestrator = new OrderOrchestrator(
    new PgOrderRepository(pool),
    new MockMerchantPosAdapter(),
    new MockPaymentAdapter(),
    new PgOutboxRepository(pool),
    new PgPaymentRepository(pool),
    new PgAuditRepository(pool)
  );
  outboxWorker = new OutboxWorker(
    new PgOutboxRepository(pool),
    orchestrator.getOutboxHandlers()
  );
}

const app = buildApp({
  ...(pool ? { pgPool: pool } : {}),
  operatorVerifier,
  webhookVerifier,
  operatorAuthConfigured: config.operatorTokens.length > 0,
  webhookAuthConfigured: Object.keys(config.webhookSecrets).length > 0,
  ...(outboxWorker ? { getWorkerHealth: () => outboxWorker!.getHealthMetrics() } : {}),
});

async function shutdown(signal: string) {
  logger.info(`Received ${signal}; shutting down gracefully...`);
  try {
    if (outboxWorker) {
      await outboxWorker.stop();
    }
    await app.close();
    if (pool) {
      await pool.end();
    }
    process.exit(0);
  } catch (err) {
    logger.error('Error during graceful shutdown', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

async function start() {
  try {
    if (pool) {
      const dbCheck = await checkDatabaseHealth(pool);
      if (!dbCheck.healthy) {
        throw new Error(`Database readiness probe failed on startup: ${dbCheck.error}`);
      }
      logger.info('Connected to PostgreSQL persistence layer', { latencyMs: dbCheck.latencyMs });
    } else {
      logger.warn('Running with in-memory persistence double (development/test mode only)');
    }

    if (config.operatorTokens.length === 0) {
      logger.warn('Operator authentication is unconfigured (OPS_AUTH_TOKENS_JSON unset); /v1/ops/* will fail closed');
    }

    await app.listen({ port: config.port, host: config.host });
    logger.info(`Project Arrival API server listening on http://${config.host}:${config.port}`);

    if (outboxWorker) {
      outboxWorker.start();
    }
  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }
}

start();

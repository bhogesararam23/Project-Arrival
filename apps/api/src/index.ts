import { createDatabasePool, PgOutboxRepository } from '@arrival/database';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { OutboxWorker } from './workers/outbox-worker.js';

const config = loadConfig();
const pool = config.databaseUrl
  ? createDatabasePool({ connectionString: config.databaseUrl })
  : undefined;

const app = buildApp(pool ? { pgPool: pool } : undefined);

const outboxWorker = pool
  ? new OutboxWorker(new PgOutboxRepository(pool), {
      order_submitted: async (msg) => {
        logger.info('Processed outbox order_submitted event', { orderId: msg.aggregateId });
      },
      order_compensation_refunded: async (msg) => {
        logger.info('Processed outbox compensation event', { orderId: msg.aggregateId });
      },
    })
  : undefined;

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
      logger.info('Connected to PostgreSQL persistence layer');
    } else {
      logger.warn('Running with in-memory persistence double (development/test mode only)');
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

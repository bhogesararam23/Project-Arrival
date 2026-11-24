import { createDatabasePool } from '@arrival/database';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { logger } from './logger.js';

const config = loadConfig();
const pool = config.databaseUrl
  ? createDatabasePool({ connectionString: config.databaseUrl })
  : undefined;

const app = buildApp(pool ? { pgPool: pool } : undefined);

async function start() {
  try {
    if (pool) {
      logger.info('Connected to PostgreSQL persistence layer');
    } else {
      logger.warn('Running with in-memory persistence double (development/test mode only)');
    }

    await app.listen({ port: config.port, host: config.host });
    logger.info(`Project Arrival API server listening on http://${config.host}:${config.port}`);
  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }
}

start();

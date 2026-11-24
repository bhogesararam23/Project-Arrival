import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { logger } from './logger.js';

const config = loadConfig();
const app = buildApp();

async function start() {
  try {
    await app.listen({ port: config.port, host: config.host });
    logger.info(`Project Arrival API server listening on http://${config.host}:${config.port}`);
  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }
}

start();

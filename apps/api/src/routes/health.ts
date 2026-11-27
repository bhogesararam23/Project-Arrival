import type { FastifyInstance } from 'fastify';
import { checkDatabaseHealth, getPoolMetrics, type DatabasePool } from '@arrival/database';

export async function healthRoutes(
  fastify: FastifyInstance,
  opts?: {
    pgPool?: DatabasePool | undefined;
    operatorAuthConfigured?: boolean;
    webhookAuthConfigured?: boolean;
    getWorkerHealth?: () => Record<string, unknown>;
  }
) {
  fastify.get('/health', async () => {
    return { status: 'healthy', version: '1.0.0', time: new Date().toISOString() };
  });

  fastify.get('/health/live', async () => {
    return { status: 'alive' };
  });

  fastify.get('/health/ready', async (_request, reply) => {
    const workerHealth = opts?.getWorkerHealth ? opts.getWorkerHealth() : undefined;
    const configStatus = {
      operatorAuthConfigured: Boolean(opts?.operatorAuthConfigured),
      webhookAuthConfigured: Boolean(opts?.webhookAuthConfigured),
    };

    if (!opts?.pgPool) {
      return reply.status(200).send({
        status: 'ready',
        database: 'in_memory_test_double',
        config: configStatus,
        ...(workerHealth ? { worker: workerHealth } : {}),
      });
    }

    const dbHealth = await checkDatabaseHealth(opts.pgPool);
    const poolMetrics = getPoolMetrics(opts.pgPool);

    if (!dbHealth.healthy) {
      return reply.status(503).send({
        status: 'not_ready',
        database: 'disconnected',
        error: dbHealth.error,
        pool: poolMetrics,
        config: configStatus,
        ...(workerHealth ? { worker: workerHealth } : {}),
      });
    }

    return reply.status(200).send({
      status: 'ready',
      database: 'connected',
      latencyMs: dbHealth.latencyMs,
      pool: poolMetrics,
      config: configStatus,
      ...(workerHealth ? { worker: workerHealth } : {}),
    });
  });
}

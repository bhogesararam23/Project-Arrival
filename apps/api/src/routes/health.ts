import type { FastifyInstance } from 'fastify';
import { checkDatabaseHealth, getPoolMetrics, type DatabasePool } from '@arrival/database';

export async function healthRoutes(
  fastify: FastifyInstance,
  opts?: { pgPool?: DatabasePool | undefined }
) {
  fastify.get('/health', async () => {
    return { status: 'healthy', version: '1.0.0', time: new Date().toISOString() };
  });

  fastify.get('/health/live', async () => {
    return { status: 'alive' };
  });

  fastify.get('/health/ready', async (_request, reply) => {
    if (!opts?.pgPool) {
      return reply.status(200).send({
        status: 'ready',
        database: 'in_memory_test_double',
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
      });
    }

    return reply.status(200).send({
      status: 'ready',
      database: 'connected',
      latencyMs: dbHealth.latencyMs,
      pool: poolMetrics,
    });
  });
}

import type { FastifyInstance } from 'fastify';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async () => {
    return { status: 'healthy', version: '1.0.0', time: new Date().toISOString() };
  });

  fastify.get('/health/live', async () => {
    return { status: 'alive' };
  });

  fastify.get('/health/ready', async () => {
    return { status: 'ready', database: 'connected' };
  });
}

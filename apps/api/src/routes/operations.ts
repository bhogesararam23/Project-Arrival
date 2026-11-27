import type { FastifyInstance } from 'fastify';
import type { PaymentState } from '@arrival/contracts';
import type { OperationsService } from '../services/operations-service.js';
import {
  createOperatorAuthMiddleware,
  type IOperatorTokenVerifier,
} from '../middleware/ops-auth.js';

export async function operationsRoutes(
  fastify: FastifyInstance,
  opts: {
    operationsService: OperationsService;
    operatorVerifier: IOperatorTokenVerifier;
  }
) {
  const requireReadOnly = createOperatorAuthMiddleware(opts.operatorVerifier, 'ops_readonly');
  const requireAdmin = createOperatorAuthMiddleware(opts.operatorVerifier, 'ops_admin');

  fastify.get('/v1/ops/overview', { preHandler: [requireReadOnly] }, async (_request, reply) => {
    const overview = await opts.operationsService.getOverview();
    return reply.status(200).send(overview);
  });

  fastify.get('/v1/ops/orders/:orderId', { preHandler: [requireReadOnly] }, async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    const investigation = await opts.operationsService.investigateOrder(orderId);
    return reply.status(200).send(investigation);
  });

  fastify.get('/v1/ops/outbox/dead-letter', { preHandler: [requireReadOnly] }, async (_request, reply) => {
    const items = await opts.operationsService.listDeadLetterOutbox();
    return reply.status(200).send({ items });
  });

  fastify.post(
    '/v1/ops/outbox/dead-letter/:messageId/replay',
    {
      preHandler: [requireAdmin],
      schema: {
        body: {
          type: 'object',
          required: ['reason'],
          properties: {
            reason: { type: 'string', minLength: 5, maxLength: 500 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { messageId } = request.params as { messageId: string };
      const { reason } = request.body as { reason: string };
      const principal = request.operatorPrincipal!;
      const result = await opts.operationsService.replayDeadLetterOutbox({
        messageId,
        actorId: principal.actorId,
        actorRole: principal.role,
        reason,
        requestId: request.id,
      });
      return reply.status(200).send(result);
    }
  );

  fastify.get('/v1/ops/webhooks/failed', { preHandler: [requireReadOnly] }, async (_request, reply) => {
    const items = await opts.operationsService.listFailedWebhooks();
    return reply.status(200).send({ items });
  });

  fastify.get('/v1/ops/reconciliation', { preHandler: [requireReadOnly] }, async (_request, reply) => {
    const items = await opts.operationsService.listReconciliationPayments();
    return reply.status(200).send({ items });
  });

  fastify.post(
    '/v1/ops/reconciliation/:orderId/resolve',
    {
      preHandler: [requireAdmin],
      schema: {
        body: {
          type: 'object',
          required: ['resolvedState', 'reason'],
          properties: {
            resolvedState: {
              type: 'string',
              enum: ['authorized', 'captured', 'voided', 'partially_refunded', 'refunded', 'failed'],
            },
            reason: { type: 'string', minLength: 5, maxLength: 500 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { orderId } = request.params as { orderId: string };
      const { resolvedState, reason } = request.body as { resolvedState: PaymentState; reason: string };
      const principal = request.operatorPrincipal!;
      const updated = await opts.operationsService.resolvePaymentReconciliation({
        orderId,
        resolvedState,
        actorId: principal.actorId,
        actorRole: principal.role,
        reason,
        requestId: request.id,
      });
      return reply.status(200).send(updated);
    }
  );

  fastify.get('/v1/ops/capabilities', { preHandler: [requireReadOnly] }, async (_request, reply) => {
    const items = await opts.operationsService.listCapabilities();
    return reply.status(200).send({ items });
  });

  fastify.post(
    '/v1/ops/capabilities/:capabilityId/suspend',
    {
      preHandler: [requireAdmin],
      schema: {
        body: {
          type: 'object',
          required: ['reason'],
          properties: {
            reason: { type: 'string', minLength: 5, maxLength: 500 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { capabilityId } = request.params as { capabilityId: string };
      const { reason } = request.body as { reason: string };
      const principal = request.operatorPrincipal!;
      const result = await opts.operationsService.suspendCapability({
        capabilityId,
        actorId: principal.actorId,
        actorRole: principal.role,
        reason,
        requestId: request.id,
      });
      return reply.status(200).send(result);
    }
  );
}

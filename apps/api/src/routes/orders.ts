import type { FastifyInstance } from 'fastify';
import { ArrivalError, type CreateOrderRequest } from '@arrival/contracts';
import type { OrderService } from '../services/order-service.js';
import type { IIdempotencyRepository, IGuestSessionRepository } from '../repositories/interfaces.js';
import { createIdempotencyMiddleware } from '../middleware/idempotency.js';
import { createGuestAuthMiddleware } from '../middleware/auth.js';

export async function ordersRoutes(
  fastify: FastifyInstance,
  opts: {
    orderService: OrderService;
    idempotencyRepo: IIdempotencyRepository;
    guestRepo: IGuestSessionRepository;
  }
) {
  const checkIdempotency = createIdempotencyMiddleware(opts.idempotencyRepo);
  const requireGuestAuth = createGuestAuthMiddleware(opts.guestRepo, true);

  fastify.post(
    '/v1/orders',
    {
      schema: {
        body: {
          type: 'object',
          required: ['quoteId', 'paymentMethodToken'],
          properties: {
            quoteId: { type: 'string', minLength: 1 },
            paymentMethodToken: { type: 'string', minLength: 1 },
          },
          additionalProperties: false,
        },
        headers: {
          type: 'object',
          required: ['idempotency-key', 'authorization'],
          properties: {
            'idempotency-key': { type: 'string', minLength: 16, maxLength: 128 },
            authorization: { type: 'string', pattern: '^Bearer\\s+[0-9a-fA-F]{64}$' },
          },
        },
      },
      preHandler: [requireGuestAuth, checkIdempotency],
    },
    async (request, reply) => {
      const body = request.body as CreateOrderRequest;
      const idempotencyKey = request.headers['idempotency-key'] as string;

      if (!body || !body.quoteId || !body.paymentMethodToken) {
        throw ArrivalError.badRequest('Invalid order creation payload');
      }

      const guestSessionId = request.guestSessionId;

      const orderCreated = await opts.orderService.submitOrder(body, {
        idempotencyKey,
        ...(guestSessionId ? { guestSessionId } : {}),
      });

      reply.header('Location', `/v1/orders/${orderCreated.orderId}`);
      return reply.status(202).send(orderCreated);
    }
  );

  fastify.get(
    '/v1/orders/:orderId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['orderId'],
          properties: {
            orderId: { type: 'string', minLength: 1 },
          },
        },
        headers: {
          type: 'object',
          required: ['authorization'],
          properties: {
            authorization: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { orderId } = request.params as { orderId: string };
      const authHeader = request.headers['authorization'];
      const order = await opts.orderService.getOrder(orderId, authHeader);
      return reply.status(200).send(order);
    }
  );

  fastify.get(
    '/v1/orders/:orderId/events',
    {
      schema: {
        params: {
          type: 'object',
          required: ['orderId'],
          properties: {
            orderId: { type: 'string', minLength: 1 },
          },
        },
        headers: {
          type: 'object',
          required: ['authorization'],
          properties: {
            authorization: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { orderId } = request.params as { orderId: string };
      const authHeader = request.headers['authorization'];
      const events = await opts.orderService.getOrderEvents(orderId, authHeader);
      return reply.status(200).send(events);
    }
  );

  fastify.post(
    '/v1/orders/:orderId/cancellations',
    {
      schema: {
        params: {
          type: 'object',
          required: ['orderId'],
          properties: {
            orderId: { type: 'string', minLength: 1 },
          },
        },
        headers: {
          type: 'object',
          required: ['authorization', 'idempotency-key'],
          properties: {
            authorization: { type: 'string' },
            'idempotency-key': { type: 'string', minLength: 16, maxLength: 128 },
          },
        },
        body: {
          type: 'object',
          properties: {
            reason: { type: 'string', maxLength: 500 },
          },
        },
      },
      preHandler: [checkIdempotency],
    },
    async (request, reply) => {
      const { orderId } = request.params as { orderId: string };
      const authHeader = request.headers['authorization'];
      const reason = (request.body as { reason?: string } | undefined)?.reason;
      const order = await opts.orderService.cancelOrder(orderId, authHeader, reason);
      return reply.status(202).send(order);
    }
  );
}

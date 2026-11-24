import type { FastifyInstance } from 'fastify';
import { ArrivalError, type CreateOrderRequest } from '@arrival/contracts';
import type { OrderService } from '../services/order-service.js';
import type { IIdempotencyRepository } from '../repositories/interfaces.js';
import { createIdempotencyMiddleware } from '../middleware/idempotency.js';

export async function ordersRoutes(
  fastify: FastifyInstance,
  opts: { orderService: OrderService; idempotencyRepo: IIdempotencyRepository }
) {
  const checkIdempotency = createIdempotencyMiddleware(opts.idempotencyRepo);

  fastify.post('/v1/orders', { preHandler: checkIdempotency }, async (request, reply) => {
    const body = request.body as CreateOrderRequest;
    const idempotencyKey = request.headers['idempotency-key'] as string;

    if (!body || !body.quoteId || !body.paymentMethodToken) {
      throw ArrivalError.badRequest('Invalid order creation payload');
    }

    // Guest token check
    const authHeader = request.headers['authorization'];
    const guestSessionId = authHeader ? 'guest-sess-simulated' : undefined;

    const orderCreated = await opts.orderService.submitOrder(body, {
      idempotencyKey,
      ...(guestSessionId ? { guestSessionId } : {}),
    });

    reply.header('Location', `/v1/orders/${orderCreated.orderId}`);
    return reply.status(202).send(orderCreated);
  });

  fastify.get('/v1/orders/:orderId', async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    const authHeader = request.headers['authorization'];
    const order = await opts.orderService.getOrder(orderId, authHeader);
    return reply.status(200).send(order);
  });

  fastify.get('/v1/orders/:orderId/events', async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    const events = await opts.orderService.getOrderEvents(orderId);
    return reply.status(200).send(events);
  });

  fastify.post('/v1/orders/:orderId/cancellations', { preHandler: checkIdempotency }, async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    const reason = (request.body as any)?.reason;
    const order = await opts.orderService.cancelOrder(orderId, reason);
    return reply.status(202).send(order);
  });
}

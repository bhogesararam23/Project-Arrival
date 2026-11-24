import type { FastifyInstance } from 'fastify';
import { ArrivalError, type QuoteRequest } from '@arrival/contracts';
import type { QuoteService } from '../services/quote-service.js';
import type { IIdempotencyRepository } from '../repositories/interfaces.js';
import { createIdempotencyMiddleware } from '../middleware/idempotency.js';

export async function quotesRoutes(
  fastify: FastifyInstance,
  opts: { quoteService: QuoteService; idempotencyRepo: IIdempotencyRepository }
) {
  const checkIdempotency = createIdempotencyMiddleware(opts.idempotencyRepo);

  fastify.post('/v1/checkout-quotes', { preHandler: checkIdempotency }, async (request, reply) => {
    const body = request.body as QuoteRequest;

    if (!body || !body.locationId || !body.catalogueVersion || !body.destination || !body.items) {
      throw ArrivalError.badRequest('Invalid quote request payload: missing required fields');
    }

    const quote = await opts.quoteService.createQuote(body);
    return reply.status(201).send(quote);
  });
}

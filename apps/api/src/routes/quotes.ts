import type { FastifyInstance } from 'fastify';
import { ArrivalError, type QuoteRequest } from '@arrival/contracts';
import type { QuoteService } from '../services/quote-service.js';
import type { IIdempotencyRepository, IGuestSessionRepository } from '../repositories/interfaces.js';
import { createIdempotencyMiddleware } from '../middleware/idempotency.js';
import { createGuestAuthMiddleware } from '../middleware/auth.js';

export async function quotesRoutes(
  fastify: FastifyInstance,
  opts: {
    quoteService: QuoteService;
    idempotencyRepo: IIdempotencyRepository;
    guestRepo?: IGuestSessionRepository;
  }
) {
  const checkIdempotency = createIdempotencyMiddleware(opts.idempotencyRepo);
  const optionalGuestAuth = opts.guestRepo
    ? createGuestAuthMiddleware(opts.guestRepo, false)
    : async () => {};

  fastify.post(
    '/v1/checkout-quotes',
    {
      schema: {
        body: {
          type: 'object',
          required: ['locationId', 'catalogueVersion', 'destination', 'items'],
          properties: {
            locationId: { type: 'string', minLength: 1 },
            catalogueVersion: { type: 'integer', minimum: 1 },
            destination: {
              type: 'object',
              required: ['countryCode', 'address'],
              properties: {
                countryCode: { type: 'string', minLength: 2, maxLength: 2 },
                address: {
                  type: 'object',
                  required: ['formattedAddress'],
                  properties: {
                    formattedAddress: { type: 'string', minLength: 1 },
                    addressLines: { type: 'array', items: { type: 'string' } },
                    locality: { type: 'string' },
                    administrativeArea: { type: 'string' },
                    postalCode: { type: 'string' },
                  },
                },
              },
            },
            items: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['menuItemId', 'quantity'],
                properties: {
                  menuItemId: { type: 'string', minLength: 1 },
                  quantity: { type: 'integer', minimum: 1 },
                  modifierOptionIds: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        headers: {
          type: 'object',
          properties: {
            'idempotency-key': { type: 'string', minLength: 16, maxLength: 128 },
            authorization: { type: 'string' },
          },
        },
      },
      preHandler: [optionalGuestAuth, checkIdempotency],
    },
    async (request, reply) => {
      const body = request.body as QuoteRequest;

      if (!body || !body.locationId || !body.catalogueVersion || !body.destination || !body.items) {
        throw ArrivalError.badRequest('Invalid quote request payload: missing required fields');
      }

      const quote = await opts.quoteService.createQuote(body, request.guestSessionId);
      return reply.status(201).send(quote);
    }
  );
}

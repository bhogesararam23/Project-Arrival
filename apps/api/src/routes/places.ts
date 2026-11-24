import type { FastifyInstance } from 'fastify';
import { ArrivalError, type SearchQuery } from '@arrival/contracts';
import type { DiscoveryService } from '../services/discovery-service.js';

export async function placesRoutes(fastify: FastifyInstance, opts: { discoveryService: DiscoveryService }) {
  fastify.get(
    '/v1/places/search',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['q'],
          properties: {
            q: { type: 'string', minLength: 1 },
            country: { type: 'string', minLength: 2, maxLength: 2 },
            lat: { type: 'number', minimum: -90, maximum: 90 },
            lon: { type: 'number', minimum: -180, maximum: 180 },
            cursor: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const q = (request.query as Record<string, unknown>)?.q;
      if (!q || typeof q !== 'string' || q.trim() === '') {
        throw ArrivalError.badRequest('Query parameter "q" is required and cannot be empty');
      }

      const query: SearchQuery = {
        q: q.trim(),
        ...(typeof (request.query as any)?.country === 'string' ? { country: (request.query as any).country } : {}),
        ...(typeof (request.query as any)?.lat !== 'undefined' ? { lat: Number((request.query as any).lat) } : {}),
        ...(typeof (request.query as any)?.lon !== 'undefined' ? { lon: Number((request.query as any).lon) } : {}),
        ...(typeof (request.query as any)?.cursor === 'string' ? { cursor: (request.query as any).cursor } : {}),
      };

      const results = await opts.discoveryService.search(query);
      return reply.status(200).send(results);
    }
  );

  fastify.get(
    '/v1/places/locations/:locationId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['locationId'],
          properties: {
            locationId: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { locationId } = request.params as { locationId: string };
      const location = await opts.discoveryService.getLocation(locationId);
      if (!location) {
        throw ArrivalError.notFound(`Merchant location ${locationId} not found`);
      }
      return reply.status(200).send(location);
    }
  );
}

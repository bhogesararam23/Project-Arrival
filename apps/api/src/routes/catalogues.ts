import type { FastifyInstance } from 'fastify';
import type { CatalogueService } from '../services/catalogue-service.js';

export async function catalogueRoutes(fastify: FastifyInstance, opts: { catalogueService: CatalogueService }) {
  fastify.get(
    '/v1/catalogues/:locationId',
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
      const catalogue = await opts.catalogueService.getCatalogue(locationId);
      return reply.status(200).send(catalogue);
    }
  );
}

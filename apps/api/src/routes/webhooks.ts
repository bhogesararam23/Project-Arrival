import type { FastifyInstance } from 'fastify';
import type { WebhookService } from '../services/webhook-service.js';

export async function webhooksRoutes(
  fastify: FastifyInstance,
  opts: {
    webhookService: WebhookService;
  }
) {
  fastify.post(
    '/v1/webhooks/:providerKey',
    {
      schema: {
        params: {
          type: 'object',
          required: ['providerKey'],
          properties: {
            providerKey: { type: 'string', minLength: 1, maxLength: 64 },
          },
        },
        body: {
          type: 'object',
          required: ['eventId', 'eventType'],
          properties: {
            eventId: { type: 'string', minLength: 1 },
            eventType: { type: 'string', minLength: 1 },
            accountRef: { type: 'string' },
            orderId: { type: 'string' },
          },
          additionalProperties: true,
        },
      },
    },
    async (request, reply) => {
      const { providerKey } = request.params as { providerKey: string };
      const payload = request.body as Record<string, unknown>;
      const rawBody = JSON.stringify(payload);
      const signatureHeader = request.headers['x-arrival-signature'] as string | undefined;
      const timestampHeader = request.headers['x-arrival-timestamp'] as string | undefined;

      const result = await opts.webhookService.receiveWebhook({
        providerKey,
        rawBody,
        payload,
        signatureHeader,
        timestampHeader,
      });

      return reply.status(200).send(result);
    }
  );
}

import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ArrivalError, type IdempotencyRecord } from '@arrival/contracts';
import type { IIdempotencyRepository } from '../repositories/interfaces.js';

export function createIdempotencyMiddleware(idempotencyRepo: IIdempotencyRepository) {
  return async function checkIdempotency(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const key = request.headers['idempotency-key'] as string | undefined;
    if (!key) {
      throw ArrivalError.badRequest('Missing required Idempotency-Key header', 'MISSING_IDEMPOTENCY_KEY');
    }

    if (key.length < 16 || key.length > 128) {
      throw ArrivalError.badRequest(
        'Idempotency-Key must be between 16 and 128 characters',
        'INVALID_IDEMPOTENCY_KEY'
      );
    }

    const principalScope = (request.headers['authorization'] as string) || 'anonymous';
    const operation = `${request.method} ${request.url}`;
    const bodyStr = JSON.stringify(request.body ?? {});
    const requestHash = createHash('sha256').update(bodyStr).digest('hex');

    const existing = await idempotencyRepo.get(principalScope, operation, key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw ArrivalError.conflict(
          'Idempotency key reuse with mismatched request payload is forbidden',
          'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH'
        );
      }
      if (existing.responseStatus && existing.responseBody) {
        return reply.status(existing.responseStatus).send(existing.responseBody);
      }
    }

    // Save pending record
    const pendingRecord: IdempotencyRecord = {
      id: key,
      principalScope,
      operation,
      idempotencyKey: key,
      requestHash,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    await idempotencyRepo.save(pendingRecord);

    // Capture response for caching
    reply.raw.once('finish', () => {
      // In fastify onSend or when response body is sent
    });
  };
}

export function registerIdempotencyResponseHook(app: any, idempotencyRepo: IIdempotencyRepository) {
  app.addHook('onSend', async (request: any, reply: any, payload: any) => {
    const key = request.headers['idempotency-key'] as string | undefined;
    if (key && reply.statusCode >= 200 && reply.statusCode < 300) {
      const principalScope = (request.headers['authorization'] as string) || 'anonymous';
      const operation = `${request.method} ${request.url}`;
      let parsedBody: any = payload;
      try {
        if (typeof payload === 'string') {
          parsedBody = JSON.parse(payload);
        }
      } catch {
        // preserve payload as-is
      }
      const existing = await idempotencyRepo.get(principalScope, operation, key);
      if (existing) {
        await idempotencyRepo.save({
          ...existing,
          responseStatus: reply.statusCode,
          responseBody: parsedBody,
        });
      }
    }
    return payload;
  });
}

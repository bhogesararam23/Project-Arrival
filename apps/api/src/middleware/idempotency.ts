import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ArrivalError, hashGuestSecret } from '@arrival/contracts';
import type { IIdempotencyRepository } from '../repositories/interfaces.js';

const LOCK_DURATION_MS = 30_000; // 30s lock duration

function resolvePrincipalScope(request: FastifyRequest): string {
  if (request.principalDigest) {
    return `digest:${request.principalDigest}`;
  }
  const rawAuth = request.headers['authorization'];
  if (rawAuth) {
    return `digest:${hashGuestSecret(rawAuth)}`;
  }
  return 'scope:anonymous';
}

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

    const principalScope = resolvePrincipalScope(request);
    const operation = `${request.method} ${request.url}`;
    const bodyStr = JSON.stringify(request.body ?? {});
    const requestHash = createHash('sha256').update(bodyStr).digest('hex');

    const reservation = await idempotencyRepo.tryReserve(
      principalScope,
      operation,
      key,
      requestHash,
      LOCK_DURATION_MS
    );

    if (!reservation.success) {
      if (reservation.conflictReason === 'mismatch') {
        throw ArrivalError.conflict(
          'Idempotency key reuse with mismatched request payload is forbidden',
          'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH'
        );
      }
      if (reservation.conflictReason === 'in_progress') {
        throw ArrivalError.conflict(
          'Concurrent operation in progress for this idempotency key',
          'OPERATION_IN_PROGRESS'
        );
      }
    }

    if (reservation.record?.status === 'completed') {
      reply.header('Idempotency-Replay', 'true');
      return reply
        .status(reservation.record.responseStatus || 200)
        .send(reservation.record.responseBody);
    }
  };
}

export function registerIdempotencyResponseHook(app: FastifyInstance, idempotencyRepo: IIdempotencyRepository) {
  app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    const key = request.headers['idempotency-key'] as string | undefined;
    if (!key || key.length < 16 || key.length > 128) {
      return payload;
    }

    const principalScope = resolvePrincipalScope(request);
    const operation = `${request.method} ${request.url}`;

    if (reply.statusCode >= 200 && reply.statusCode < 300) {
      let parsedBody: unknown = payload;
      try {
        if (typeof payload === 'string') {
          parsedBody = JSON.parse(payload);
        }
      } catch {
        // preserve payload as is
      }
      await idempotencyRepo.complete(principalScope, operation, key, reply.statusCode, parsedBody);
    } else {
      await idempotencyRepo.fail(principalScope, operation, key);
    }

    return payload;
  });

  app.addHook('onError', async (request: FastifyRequest, _reply: FastifyReply) => {
    const key = request.headers['idempotency-key'] as string | undefined;
    if (key && key.length >= 16 && key.length <= 128) {
      const principalScope = resolvePrincipalScope(request);
      const operation = `${request.method} ${request.url}`;
      await idempotencyRepo.fail(principalScope, operation, key);
    }
  });
}

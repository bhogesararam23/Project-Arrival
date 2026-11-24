import type { FastifyRequest, FastifyReply } from 'fastify';
import { ArrivalError, hashGuestSecret } from '@arrival/contracts';
import type { IGuestSessionRepository } from '../repositories/interfaces.js';

declare module 'fastify' {
  interface FastifyRequest {
    guestSessionId?: string;
    principalDigest?: string;
  }
}

const HEX_TOKEN_REGEX = /^[0-9a-fA-F]{64}$/;

export function parseBearerToken(authHeader?: string): string | null {
  if (!authHeader) {
    return null;
  }
  const match = authHeader.match(/^Bearer\s+([^\s]+)$/i);
  return match ? match[1]! : null;
}

export function validateHexToken(token: string): boolean {
  return HEX_TOKEN_REGEX.test(token);
}

export function createGuestAuthMiddleware(guestRepo: IGuestSessionRepository, required = true) {
  return async function authenticateGuest(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const rawHeader = request.headers['authorization'];
    const token = parseBearerToken(rawHeader);

    if (!token) {
      if (required) {
        throw ArrivalError.unauthorized('Missing required Bearer authentication token', 'UNAUTHORIZED');
      }
      return;
    }

    if (!validateHexToken(token)) {
      throw ArrivalError.unauthorized('Malformed bearer token: expected 32-byte hexadecimal secret', 'INVALID_TOKEN');
    }

    const digest = hashGuestSecret(token);
    const session = await guestRepo.getSessionByDigest(digest);

    if (!session) {
      throw ArrivalError.unauthorized('Guest session not found or unrecognized', 'INVALID_SESSION');
    }

    if (session.revokedAt) {
      throw ArrivalError.unauthorized('Guest session has been revoked', 'REVOKED_SESSION');
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      throw ArrivalError.unauthorized('Guest session has expired', 'EXPIRED_SESSION');
    }

    request.guestSessionId = session.id;
    request.principalDigest = digest;
  };
}

import type { FastifyRequest, FastifyReply } from 'fastify';
import { ArrivalError, type OperatorRole } from '@arrival/contracts';
import { parseBearerToken } from '../middleware/auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    operatorPrincipal?: {
      actorId: string;
      role: OperatorRole;
    };
  }
}

export interface IOperatorTokenVerifier {
  verify(token: string): Promise<{ actorId: string; role: OperatorRole } | null>;
}

export class StaticMapOperatorVerifier implements IOperatorTokenVerifier {
  private readonly tokens = new Map<string, { actorId: string; role: OperatorRole }>();

  constructor(entries: Array<{ token: string; actorId: string; role: OperatorRole }> = []) {
    for (const entry of entries) {
      this.tokens.set(entry.token, { actorId: entry.actorId, role: entry.role });
    }
  }

  async verify(token: string): Promise<{ actorId: string; role: OperatorRole } | null> {
    return this.tokens.get(token) || null;
  }
}

export function createOperatorAuthMiddleware(
  verifier: IOperatorTokenVerifier,
  requiredRole: OperatorRole
) {
  return async function authorizeOperator(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const token = parseBearerToken(request.headers['authorization']);
    if (!token) {
      throw ArrivalError.unauthorized('Operator authentication required', 'OPS_UNAUTHORIZED');
    }

    const principal = await verifier.verify(token);
    if (!principal) {
      throw ArrivalError.unauthorized('Invalid operator credentials', 'OPS_INVALID_CREDENTIALS');
    }

    // ops_admin has both ops_readonly and ops_admin permissions; ops_readonly cannot perform ops_admin actions
    if (requiredRole === 'ops_admin' && principal.role !== 'ops_admin') {
      throw ArrivalError.forbidden(
        'Operator role ops_admin is required for this privileged action',
        'OPS_INSUFFICIENT_ROLE'
      );
    }

    request.operatorPrincipal = principal;
  };
}

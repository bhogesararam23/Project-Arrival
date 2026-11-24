import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ArrivalError, type ProblemDetails } from '@arrival/contracts';
import { logger } from '../logger.js';

export function errorHandler(error: FastifyError | ArrivalError | Error, request: FastifyRequest, reply: FastifyReply) {
  const requestId = (request.headers['x-request-id'] as string) || request.id || 'req-unknown';

  if (error instanceof ArrivalError) {
    const problem: ProblemDetails = {
      ...error.problem,
      requestId,
    };
    logger.warn(`Handled ArrivalError [${problem.code}]: ${problem.detail}`, { problem, url: request.url });
    return reply.status(problem.status).type('application/problem+json').send(problem);
  }

  // Fastify validation errors
  if ('validation' in error && error.validation) {
    const problem: ProblemDetails = {
      type: 'https://arrival.internal/errors/bad-request',
      title: 'Bad Request',
      status: 400,
      detail: error.message,
      code: 'VALIDATION_ERROR',
      requestId,
    };
    return reply.status(400).type('application/problem+json').send(problem);
  }

  logger.error(`Unhandled error processing ${request.method} ${request.url}`, error, { requestId });

  const problem: ProblemDetails = {
    type: 'https://arrival.internal/errors/internal-server-error',
    title: 'Internal Server Error',
    status: 500,
    detail: 'An unexpected internal error occurred',
    code: 'INTERNAL_ERROR',
    requestId,
  };

  return reply.status(500).type('application/problem+json').send(problem);
}

/**
 * RFC 9457 Problem Details object and error definitions.
 */

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  requestId?: string | undefined;
  invalidParams?: Array<{
    name: string;
    reason: string;
  }> | undefined;
}

export class ArrivalError extends Error {
  readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.detail);
    this.name = 'ArrivalError';
    this.problem = problem;
  }

  static badRequest(detail: string, code = 'INVALID_REQUEST', invalidParams?: Array<{ name: string; reason: string }>): ArrivalError {
    return new ArrivalError({
      type: 'https://arrival.internal/errors/bad-request',
      title: 'Bad Request',
      status: 400,
      detail,
      code,
      invalidParams,
    });
  }

  static unauthorized(detail = 'Missing or invalid authentication credentials', code = 'UNAUTHORIZED'): ArrivalError {
    return new ArrivalError({
      type: 'https://arrival.internal/errors/unauthorized',
      title: 'Unauthorized',
      status: 401,
      detail,
      code,
    });
  }

  static forbidden(detail = 'Insufficient permissions for requested resource', code = 'FORBIDDEN'): ArrivalError {
    return new ArrivalError({
      type: 'https://arrival.internal/errors/forbidden',
      title: 'Forbidden',
      status: 403,
      detail,
      code,
    });
  }

  static notFound(detail: string, code = 'NOT_FOUND'): ArrivalError {
    return new ArrivalError({
      type: 'https://arrival.internal/errors/not-found',
      title: 'Not Found',
      status: 404,
      detail,
      code,
    });
  }

  static conflict(detail: string, code = 'IDEMPOTENCY_CONFLICT'): ArrivalError {
    return new ArrivalError({
      type: 'https://arrival.internal/errors/conflict',
      title: 'Conflict',
      status: 409,
      detail,
      code,
    });
  }

  static unprocessableEntity(detail: string, code = 'VALIDATION_FAILED'): ArrivalError {
    return new ArrivalError({
      type: 'https://arrival.internal/errors/unprocessable-entity',
      title: 'Unprocessable Entity',
      status: 422,
      detail,
      code,
    });
  }

  static tooManyRequests(detail = 'Rate limit exceeded', code = 'RATE_LIMITED'): ArrivalError {
    return new ArrivalError({
      type: 'https://arrival.internal/errors/too-many-requests',
      title: 'Too Many Requests',
      status: 429,
      detail,
      code,
    });
  }

  static internal(detail = 'An unexpected internal error occurred', code = 'INTERNAL_ERROR'): ArrivalError {
    return new ArrivalError({
      type: 'https://arrival.internal/errors/internal-error',
      title: 'Internal Server Error',
      status: 500,
      detail,
      code,
    });
  }
}

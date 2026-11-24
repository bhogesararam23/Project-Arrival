import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

describe('OpenAPI 3.1 Contract Conformance', () => {
  let app: FastifyInstance;
  let openapiYaml: string;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
    const openapiPath = resolve(__dirname, '../../../docs/api/openapi.yaml');
    openapiYaml = await readFile(openapiPath, 'utf8');
  });

  afterAll(async () => {
    await app.close();
  });

  it('validates that all critical OpenAPI specification paths exist in the mounted API', () => {
    const declaredPaths = [
      '/v1/guest-sessions',
      '/v1/places/search',
      '/v1/checkout-quotes',
      '/v1/orders',
      '/v1/orders/{orderId}',
      '/v1/orders/{orderId}/events',
      '/v1/orders/{orderId}/cancellations',
    ];

    for (const path of declaredPaths) {
      expect(openapiYaml).toContain(`${path}:`);
    }

    // Validate using Fastify hasRoute API
    expect(app.hasRoute({ method: 'POST', url: '/v1/guest-sessions' })).toBe(true);
    expect(app.hasRoute({ method: 'GET', url: '/v1/places/search' })).toBe(true);
    expect(app.hasRoute({ method: 'POST', url: '/v1/checkout-quotes' })).toBe(true);
    expect(app.hasRoute({ method: 'POST', url: '/v1/orders' })).toBe(true);
    expect(app.hasRoute({ method: 'GET', url: '/v1/orders/:orderId' })).toBe(true);
    expect(app.hasRoute({ method: 'GET', url: '/v1/orders/:orderId/events' })).toBe(true);
    expect(app.hasRoute({ method: 'POST', url: '/v1/orders/:orderId/cancellations' })).toBe(true);
  });

  it('verifies ProblemDetails conforms to RFC 9457 media type application/problem+json', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/places/search', // Missing query parameter 'q'
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const problem = JSON.parse(res.payload);
    expect(problem.type).toBeDefined();
    expect(problem.title).toBe('Bad Request');
    expect(problem.status).toBe(400);
    expect(problem.detail).toBeDefined();
    expect(problem.code).toBeDefined();
  });
});

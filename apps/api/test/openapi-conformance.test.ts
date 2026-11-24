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

    // Fastify printRoutes gives the route hierarchy
    const mountedRoutes = app.printRoutes();
    expect(mountedRoutes).toContain('/v1/guest-sessions');
    expect(mountedRoutes).toContain('/v1/places/search');
    expect(mountedRoutes).toContain('/v1/checkout-quotes');
    expect(mountedRoutes).toContain('/v1/orders');
    expect(mountedRoutes).toContain('/v1/orders/:orderId');
    expect(mountedRoutes).toContain('/v1/orders/:orderId/events');
    expect(mountedRoutes).toContain('/v1/orders/:orderId/cancellations');
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

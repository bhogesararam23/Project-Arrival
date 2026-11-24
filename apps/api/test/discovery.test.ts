import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

describe('Places & Discovery API endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /v1/places/search requires query parameter q', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/places/search' });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('INVALID_REQUEST');
  });

  it('GET /v1/places/search returns discoverable venues with attribution and orderability status', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/places/search?q=Westminster' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.items).toBeDefined();
    expect(body.items.length).toBeGreaterThan(0);

    const first = body.items[0];
    expect(first.name).toContain('Westminster Artisan Bakery');
    expect(first.countryCode).toBe('GB');
    expect(first.discoverable).toBe(true);
    expect(first.orderability).toBe('native_orderable');
    expect(first.attribution).toBeInstanceOf(Array);
  });

  it('GET /v1/places/search filters by country code', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/places/search?q=Specialty&country=DE' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.items.length).toBe(1);
    expect(body.items[0].countryCode).toBe('DE');
    expect(body.items[0].orderability).toBe('capability_pending');
  });

  it('GET /v1/places/locations/:locationId returns location details', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/places/locations/f1000000-0000-4000-a000-000000000001',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.id).toBe('f1000000-0000-4000-a000-000000000001');
    expect(body.publicAddress.countryCode).toBe('GB');
  });
});

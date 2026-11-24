import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

describe('Checkout Quotes API endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an expiring quote with verified minor-unit totals', async () => {
    const payload = {
      locationId: 'f1000000-0000-4000-a000-000000000001',
      catalogueVersion: 1,
      destination: {
        countryCode: 'GB',
        address: {
          formattedAddress: '10 Downing St, London SW1A 2AA, UK',
        },
      },
      items: [
        {
          menuItemId: 'i1000000-0000-4000-a000-000000000001', // £4.50 (450 minor)
          quantity: 2,
        },
      ],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/v1/checkout-quotes',
      headers: {
        'idempotency-key': 'idemp-quote-valid-001',
      },
      payload,
    });

    expect(res.statusCode).toBe(201);
    const quote = JSON.parse(res.payload);
    expect(quote.quoteId).toBeDefined();
    expect(quote.currency).toBe('GBP');
    expect(quote.subtotal.amountMinor).toBe('900'); // 450 * 2 = 900
    expect(quote.tax.amountMinor).toBe('180'); // 20% of 900 = 180
    expect(quote.delivery.amountMinor).toBe('250'); // 250
    // total: 900 + 180 + 250 + 50 (service fee) = 1380
    expect(quote.total.amountMinor).toBe('1380');
    expect(new Date(quote.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('blocks unauthorized cross-border delivery attempts fail-closed', async () => {
    const payload = {
      locationId: 'f1000000-0000-4000-a000-000000000001', // GB merchant
      catalogueVersion: 1,
      destination: {
        countryCode: 'FR', // Foreign destination
        address: {
          formattedAddress: 'Champs-Elysees, Paris, France',
        },
      },
      items: [
        {
          menuItemId: 'i1000000-0000-4000-a000-000000000001',
          quantity: 1,
        },
      ],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/v1/checkout-quotes',
      headers: {
        'idempotency-key': 'idemp-quote-cross-border-001',
      },
      payload,
    });

    expect(res.statusCode).toBe(422);
    const problem = JSON.parse(res.payload);
    expect(problem.code).toBe('CROSS_BORDER_BLOCKED');
  });

  it('rejects stale catalogue version', async () => {
    const payload = {
      locationId: 'f1000000-0000-4000-a000-000000000001',
      catalogueVersion: 999, // Non-existent version
      destination: {
        countryCode: 'GB',
        address: { formattedAddress: 'London, UK' },
      },
      items: [{ menuItemId: 'i1000000-0000-4000-a000-000000000001', quantity: 1 }],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/v1/checkout-quotes',
      headers: { 'idempotency-key': 'idemp-quote-stale-001' },
      payload,
    });

    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.payload).code).toBe('STALE_CATALOGUE');
  });

  it('accurately prices valid modifier options into the quote subtotal and total', async () => {
    const payload = {
      locationId: 'f1000000-0000-4000-a000-000000000001',
      catalogueVersion: 1,
      destination: {
        countryCode: 'GB',
        address: { formattedAddress: '10 Downing St, London SW1A 2AA, UK' },
      },
      items: [
        {
          menuItemId: 'i1000000-0000-4000-a000-000000000001', // base £4.50 (450)
          quantity: 2,
          modifierOptionIds: ['opt-thick-slice'], // +£0.50 (50) -> unit price 500
        },
      ],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/v1/checkout-quotes',
      headers: {
        'idempotency-key': 'idemp-quote-modifier-valid-1',
      },
      payload,
    });

    expect(res.statusCode).toBe(201);
    const quote = JSON.parse(res.payload);
    // 500 * 2 = 1000 subtotal
    expect(quote.subtotal.amountMinor).toBe('1000');
    // 20% VAT = 200
    expect(quote.tax.amountMinor).toBe('200');
    // Delivery = 250
    expect(quote.delivery.amountMinor).toBe('250');
    // Total = 1000 + 200 + 250 + 50 (service fee) = 1500
    expect(quote.total.amountMinor).toBe('1500');
  });

  it('rejects unavailable modifier options with 422', async () => {
    const payload = {
      locationId: 'f1000000-0000-4000-a000-000000000001',
      catalogueVersion: 1,
      destination: {
        countryCode: 'GB',
        address: { formattedAddress: '10 Downing St, London SW1A 2AA, UK' },
      },
      items: [
        {
          menuItemId: 'i1000000-0000-4000-a000-000000000001',
          quantity: 1,
          modifierOptionIds: ['opt-gluten-free-crust'], // unavailable in fixture
        },
      ],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/v1/checkout-quotes',
      headers: {
        'idempotency-key': 'idemp-quote-modifier-unavail-1',
      },
      payload,
    });

    expect(res.statusCode).toBe(422);
  });

  it('rejects modifier group selection exceeding maximum allowed selections with 400', async () => {
    const payload = {
      locationId: 'f1000000-0000-4000-a000-000000000001',
      catalogueVersion: 1,
      destination: {
        countryCode: 'GB',
        address: { formattedAddress: '10 Downing St, London SW1A 2AA, UK' },
      },
      items: [
        {
          menuItemId: 'i1000000-0000-4000-a000-000000000001',
          quantity: 1,
          modifierOptionIds: ['opt-thick-slice', 'opt-seeded-crust'], // max is 1!
        },
      ],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/v1/checkout-quotes',
      headers: {
        'idempotency-key': 'idemp-quote-modifier-exceed-1',
      },
      payload,
    });

    expect(res.statusCode).toBe(400);
  });

  it('rejects unrecognized modifier option ID not belonging to item with 400', async () => {
    const payload = {
      locationId: 'f1000000-0000-4000-a000-000000000001',
      catalogueVersion: 1,
      destination: {
        countryCode: 'GB',
        address: { formattedAddress: '10 Downing St, London SW1A 2AA, UK' },
      },
      items: [
        {
          menuItemId: 'i1000000-0000-4000-a000-000000000001',
          quantity: 1,
          modifierOptionIds: ['opt-random-invalid-modifier-id'],
        },
      ],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/v1/checkout-quotes',
      headers: {
        'idempotency-key': 'idemp-quote-modifier-orphan-1',
      },
      payload,
    });

    expect(res.statusCode).toBe(400);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

describe('Orders and Guest Sessions API endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('completes the guest checkout lifecycle with idempotency and access grant', async () => {
    // 1. Create guest session
    const guestRes = await app.inject({
      method: 'POST',
      url: '/v1/guest-sessions',
    });
    expect(guestRes.statusCode).toBe(201);
    const guestSession = JSON.parse(guestRes.payload);
    expect(guestSession.sessionToken).toHaveLength(64);

    // 2. Obtain quote
    const quoteRes = await app.inject({
      method: 'POST',
      url: '/v1/checkout-quotes',
      headers: {
        'idempotency-key': 'idemp-order-flow-quote-1',
        authorization: `Bearer ${guestSession.sessionToken}`,
      },
      payload: {
        locationId: 'f1000000-0000-4000-a000-000000000001',
        catalogueVersion: 1,
        destination: {
          countryCode: 'GB',
          address: { formattedAddress: 'Buckingham Gate, London, UK' },
        },
        items: [{ menuItemId: 'i1000000-0000-4000-a000-000000000001', quantity: 1 }],
      },
    });
    expect(quoteRes.statusCode).toBe(201);
    const quote = JSON.parse(quoteRes.payload);

    // 3. Submit order
    const orderRes = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: {
        'idempotency-key': 'idemp-order-submit-001',
        authorization: `Bearer ${guestSession.sessionToken}`,
      },
      payload: {
        quoteId: quote.quoteId,
        paymentMethodToken: 'tok_visa_verified',
      },
    });

    expect(orderRes.statusCode).toBe(202);
    expect(orderRes.headers['location']).toBeDefined();
    const orderCreated = JSON.parse(orderRes.payload);
    expect(orderCreated.orderId).toBeDefined();
    expect(orderCreated.orderState).toBe('submitted');
    expect(orderCreated.paymentState).toBe('authorized');
    expect(orderCreated.guestAccessGrant).toBeDefined();

    // 4. Test idempotency: replaying same request with same key returns identical result
    const replayRes = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: {
        'idempotency-key': 'idemp-order-submit-001',
        authorization: `Bearer ${guestSession.sessionToken}`,
      },
      payload: {
        quoteId: quote.quoteId,
        paymentMethodToken: 'tok_visa_verified',
      },
    });
    expect(replayRes.statusCode).toBe(202);
    expect(JSON.parse(replayRes.payload).orderId).toBe(orderCreated.orderId);

    // 5. Test idempotency conflict: replaying same key with different body returns 409
    const conflictRes = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: {
        'idempotency-key': 'idemp-order-submit-001',
        authorization: `Bearer ${guestSession.sessionToken}`,
      },
      payload: {
        quoteId: quote.quoteId,
        paymentMethodToken: 'tok_different_payload',
      },
    });
    expect(conflictRes.statusCode).toBe(409);

    // 6. Retrieve order view
    const viewRes = await app.inject({
      method: 'GET',
      url: `/v1/orders/${orderCreated.orderId}`,
      headers: {
        authorization: `Bearer ${orderCreated.guestAccessGrant}`,
      },
    });
    expect(viewRes.statusCode).toBe(200);
    expect(JSON.parse(viewRes.payload).orderId).toBe(orderCreated.orderId);

    // 7. Retrieve order events timeline
    const eventsRes = await app.inject({
      method: 'GET',
      url: `/v1/orders/${orderCreated.orderId}/events`,
      headers: {
        authorization: `Bearer ${orderCreated.guestAccessGrant}`,
      },
    });
    expect(eventsRes.statusCode).toBe(200);
    const events = JSON.parse(eventsRes.payload);
    expect(events.items.length).toBeGreaterThan(0);
    expect(events.items[0].eventType).toBe('order_submitted');
  });
});

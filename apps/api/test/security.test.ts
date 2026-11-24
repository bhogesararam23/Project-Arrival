import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import {
  generateGuestSecret,
  hashGuestSecret,
} from '@arrival/contracts';
import {
  InMemoryGuestSessionRepository,
  InMemoryIdempotencyRepository,
} from '../src/repositories/in-memory.js';

describe('Security, Guest Session, and Scoped Grant Enforcement', () => {
  let app: FastifyInstance;
  let guestRepo: InMemoryGuestSessionRepository;
  let idempotencyRepo: InMemoryIdempotencyRepository;

  beforeAll(async () => {
    guestRepo = new InMemoryGuestSessionRepository();
    idempotencyRepo = new InMemoryIdempotencyRepository();
    app = buildApp({ guestRepo, idempotencyRepo });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  async function createValidGuestSession(): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/guest-sessions',
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.payload).sessionToken;
  }

  async function obtainQuote(sessionToken: string, idempKey: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/checkout-quotes',
      headers: {
        'idempotency-key': idempKey,
        authorization: `Bearer ${sessionToken}`,
      },
      payload: {
        locationId: 'f1000000-0000-4000-a000-000000000001',
        catalogueVersion: 1,
        destination: {
          countryCode: 'GB',
          address: { formattedAddress: '10 Downing St, London SW1A 2AA, UK' },
        },
        items: [{ menuItemId: 'i1000000-0000-4000-a000-000000000001', quantity: 1 }],
      },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.payload).quoteId;
  }

  it('rejects order creation with missing authorization header', async () => {
    const token = await createValidGuestSession();
    const quoteId = await obtainQuote(token, 'idemp-quote-no-auth');

    const res = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: {
        'idempotency-key': 'idemp-order-no-auth-001',
      },
      payload: {
        quoteId,
        paymentMethodToken: 'tok_visa_verified',
      },
    });

    expect(res.statusCode).toBe(400); // Schema requires authorization header
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('INVALID_REQUEST');
    expect(body.type).toContain('bad-request');
  });

  it('rejects order creation with malformed bearer token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: {
        'idempotency-key': 'idemp-order-bad-token-01',
        authorization: 'Bearer not-a-valid-hex-64-character-token',
      },
      payload: {
        quoteId: 'some-quote-id',
        paymentMethodToken: 'tok_visa_verified',
      },
    });

    expect(res.statusCode).toBe(400); // Schema rejects non-hex-64
  });

  it('rejects order creation with non-existent guest session', async () => {
    const bogusSecret = generateGuestSecret(); // valid 64-hex format, but not in repo
    const res = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: {
        'idempotency-key': 'idemp-order-bogus-token-1',
        authorization: `Bearer ${bogusSecret}`,
      },
      payload: {
        quoteId: 'q-unknown',
        paymentMethodToken: 'tok_visa_verified',
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('INVALID_SESSION');
  });

  it('rejects order creation with an expired guest session', async () => {
    const expiredSecret = generateGuestSecret();
    const expiredDigest = hashGuestSecret(expiredSecret);
    const past = new Date(Date.now() - 10_000).toISOString();

    await guestRepo.createSession({
      id: randomUUID(),
      tokenDigest: expiredDigest,
      createdAt: new Date(Date.now() - 60_000).toISOString(),
      expiresAt: past,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: {
        'idempotency-key': 'idemp-order-expired-sess-1',
        authorization: `Bearer ${expiredSecret}`,
      },
      payload: {
        quoteId: 'q-unknown',
        paymentMethodToken: 'tok_visa_verified',
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('EXPIRED_SESSION');
  });

  it('rejects order creation with a revoked guest session', async () => {
    const revokedSecret = generateGuestSecret();
    const revokedDigest = hashGuestSecret(revokedSecret);
    const sessionId = randomUUID();

    await guestRepo.createSession({
      id: sessionId,
      tokenDigest: revokedDigest,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await guestRepo.revokeSession(sessionId);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: {
        'idempotency-key': 'idemp-order-revoked-sess-1',
        authorization: `Bearer ${revokedSecret}`,
      },
      payload: {
        quoteId: 'q-unknown',
        paymentMethodToken: 'tok_visa_verified',
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.code).toBe('REVOKED_SESSION');
  });

  it('enforces scoped grant separation: read_order cannot cancel; cancel_order succeeds', async () => {
    const sessionToken = await createValidGuestSession();
    const quoteId = await obtainQuote(sessionToken, 'idemp-quote-scoped-grants');

    // Submit order
    const orderRes = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: {
        'idempotency-key': 'idemp-order-scoped-grants-1',
        authorization: `Bearer ${sessionToken}`,
      },
      payload: {
        quoteId,
        paymentMethodToken: 'tok_visa_verified',
      },
    });

    expect(orderRes.statusCode).toBe(202);
    const orderCreated = JSON.parse(orderRes.payload);
    const orderId = orderCreated.orderId;
    const readToken = orderCreated.guestAccessGrant;
    const cancelToken = orderCreated.guestCancelGrant;

    expect(readToken).toBeDefined();
    expect(cancelToken).toBeDefined();
    expect(readToken).not.toBe(cancelToken);

    // 1. Read grant CAN read order
    const readRes = await app.inject({
      method: 'GET',
      url: `/v1/orders/${orderId}`,
      headers: {
        authorization: `Bearer ${readToken}`,
      },
    });
    expect(readRes.statusCode).toBe(200);

    // 2. Read grant CAN read events
    const eventsRes = await app.inject({
      method: 'GET',
      url: `/v1/orders/${orderId}/events`,
      headers: {
        authorization: `Bearer ${readToken}`,
      },
    });
    expect(eventsRes.statusCode).toBe(200);

    // 3. Read grant CANNOT cancel order (403 Forbidden with INSUFFICIENT_SCOPE)
    const badCancelRes = await app.inject({
      method: 'POST',
      url: `/v1/orders/${orderId}/cancellations`,
      headers: {
        'idempotency-key': 'idemp-cancel-forbidden-01',
        authorization: `Bearer ${readToken}`,
      },
      payload: {
        reason: 'Attempting cancellation with read token',
      },
    });
    expect(badCancelRes.statusCode).toBe(403);
    const badCancelBody = JSON.parse(badCancelRes.payload);
    expect(badCancelBody.code).toBe('INSUFFICIENT_SCOPE');

    // 4. Cancel grant CAN cancel order (202 Accepted)
    const goodCancelRes = await app.inject({
      method: 'POST',
      url: `/v1/orders/${orderId}/cancellations`,
      headers: {
        'idempotency-key': 'idemp-cancel-success-01',
        authorization: `Bearer ${cancelToken}`,
      },
      payload: {
        reason: 'Customer changed plans',
      },
    });
    expect(goodCancelRes.statusCode).toBe(202);
    const cancelledOrder = JSON.parse(goodCancelRes.payload);
    expect(cancelledOrder.orderState).toBe('customer_cancelled');

    // 5. Subsequent cancellation attempt fails with state conflict (409 Conflict)
    const repeatCancelRes = await app.inject({
      method: 'POST',
      url: `/v1/orders/${orderId}/cancellations`,
      headers: {
        'idempotency-key': 'idemp-cancel-repeat-01',
        authorization: `Bearer ${cancelToken}`,
      },
      payload: {
        reason: 'Cancelling already cancelled order',
      },
    });
    expect(repeatCancelRes.statusCode).toBe(409);
  });

  it('prevents cross-order access and token enumeration (returns 404 for wrong order)', async () => {
    const sessionToken = await createValidGuestSession();
    const q1 = await obtainQuote(sessionToken, 'idemp-quote-order-isolation-1');
    const q2 = await obtainQuote(sessionToken, 'idemp-quote-order-isolation-2');

    const res1 = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: {
        'idempotency-key': 'idemp-order-isolation-submit-1',
        authorization: `Bearer ${sessionToken}`,
      },
      payload: { quoteId: q1, paymentMethodToken: 'tok_visa_verified' },
    });
    const order1 = JSON.parse(res1.payload);

    const res2 = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: {
        'idempotency-key': 'idemp-order-isolation-submit-2',
        authorization: `Bearer ${sessionToken}`,
      },
      payload: { quoteId: q2, paymentMethodToken: 'tok_visa_verified' },
    });
    const order2 = JSON.parse(res2.payload);

    // Using Order 1's token on Order 2 must return 404 Not Found
    const crossRead = await app.inject({
      method: 'GET',
      url: `/v1/orders/${order2.orderId}`,
      headers: {
        authorization: `Bearer ${order1.guestAccessGrant}`,
      },
    });
    expect(crossRead.statusCode).toBe(404);

    // Using Order 1's cancel token on Order 2 must return 404 Not Found
    const crossCancel = await app.inject({
      method: 'POST',
      url: `/v1/orders/${order2.orderId}/cancellations`,
      headers: {
        'idempotency-key': 'idemp-cross-cancel-01',
        authorization: `Bearer ${order1.guestCancelGrant}`,
      },
      payload: { reason: 'Cross-order attempt' },
    });
    expect(crossCancel.statusCode).toBe(404);
  });

  it('detects concurrent operations in progress with 409 OPERATION_IN_PROGRESS', async () => {
    const scope = 'scope:concurrent-test';
    const operation = 'POST /v1/test-op';
    const key = 'idemp-key-concurrent-lock-01';
    const requestHash = 'abc123hash';

    // 1. First reservation succeeds
    const res1 = await idempotencyRepo.tryReserve(scope, operation, key, requestHash, 30_000);
    expect(res1.success).toBe(true);

    // 2. Immediate second reservation with same hash while pending returns conflict in_progress
    const res2 = await idempotencyRepo.tryReserve(scope, operation, key, requestHash, 30_000);
    expect(res2.success).toBe(false);
    expect(res2.conflictReason).toBe('in_progress');

    // 3. Third reservation with mismatched hash returns conflict mismatch
    const res3 = await idempotencyRepo.tryReserve(scope, operation, key, 'different_hash', 30_000);
    expect(res3.success).toBe(false);
    expect(res3.conflictReason).toBe('mismatch');
  });
});

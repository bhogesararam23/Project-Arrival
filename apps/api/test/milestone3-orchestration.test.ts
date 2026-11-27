import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Money, parseCountryCode, parseCurrencyCode } from '@arrival/contracts';
import { buildApp } from '../src/app.js';
import {
  InMemoryCapabilityRepository,
  InMemoryAuditRepository,
  InMemoryOrderRepository,
  InMemoryQuotesRepository,
  InMemoryGuestSessionRepository,
  InMemoryOutboxRepository,
  InMemoryPaymentRepository,
  SYNTHETIC_TEST_CAPABILITIES,
} from '../src/repositories/in-memory.js';
import { MockMerchantPosAdapter, MockPaymentAdapter } from '../src/adapters/provider-adapters.js';
import { DefaultPricingPolicy } from '../src/services/pricing-policy.js';

describe('Milestone 3: Transaction Orchestration, Capability Governance & Pricing', () => {
  it('fails closed by default when mock capabilities are only sandbox_verified', async () => {
    const app = buildApp(); // Default FIXTURE_CAPABILITIES has sandbox_verified, NOT production_verified
    await app.ready();

    const guestRes = await app.inject({ method: 'POST', url: '/v1/guest-sessions' });
    const { sessionToken } = JSON.parse(guestRes.payload);

    const quoteRes = await app.inject({
      method: 'POST',
      url: '/v1/checkout-quotes',
      headers: {
        'idempotency-key': 'fail-closed-quote-key-1',
        authorization: `Bearer ${sessionToken}`,
      },
      payload: {
        locationId: 'f1000000-0000-4000-a000-000000000001',
        catalogueVersion: 1,
        destination: {
          countryCode: 'GB',
          address: { formattedAddress: '10 Downing St, London' },
        },
        items: [{ menuItemId: 'i1000000-0000-4000-a000-000000000001', quantity: 1 }],
      },
    });
    expect(quoteRes.statusCode).toBe(201);
    const quote = JSON.parse(quoteRes.payload);

    const orderRes = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: {
        'idempotency-key': 'fail-closed-order-key-1',
        authorization: `Bearer ${sessionToken}`,
      },
      payload: { quoteId: quote.quoteId, paymentMethodToken: 'tok_test_valid' },
    });

    expect(orderRes.statusCode).toBe(422);
    expect(JSON.parse(orderRes.payload).code).toBe('CAPABILITY_UNSUPPORTED');
    await app.close();
  });

  it('rejects expired and revoked capabilities fail-closed', async () => {
    const expiredCaps = SYNTHETIC_TEST_CAPABILITIES.map((c) =>
      c.providerKey === 'mock_pos'
        ? { ...c, expiresAt: new Date(Date.now() - 60_000).toISOString() }
        : c
    );
    const appExpired = buildApp({
      capabilityRepo: new InMemoryCapabilityRepository(expiredCaps),
    });
    await appExpired.ready();

    const guestRes = await appExpired.inject({ method: 'POST', url: '/v1/guest-sessions' });
    const { sessionToken } = JSON.parse(guestRes.payload);
    const quoteRes = await appExpired.inject({
      method: 'POST',
      url: '/v1/checkout-quotes',
      headers: { 'idempotency-key': 'exp-cap-quote-key-1', authorization: `Bearer ${sessionToken}` },
      payload: {
        locationId: 'f1000000-0000-4000-a000-000000000001',
        catalogueVersion: 1,
        destination: { countryCode: 'GB', address: { formattedAddress: '10 Downing St' } },
        items: [{ menuItemId: 'i1000000-0000-4000-a000-000000000001', quantity: 1 }],
      },
    });
    const quote = JSON.parse(quoteRes.payload);

    const orderRes = await appExpired.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { 'idempotency-key': 'exp-cap-order-key-1', authorization: `Bearer ${sessionToken}` },
      payload: { quoteId: quote.quoteId, paymentMethodToken: 'tok_valid' },
    });
    expect(orderRes.statusCode).toBe(422);
    expect(JSON.parse(orderRes.payload).code).toBe('CAPABILITY_UNSUPPORTED');
    await appExpired.close();

    // Revoked capability test
    const revokedCaps = SYNTHETIC_TEST_CAPABILITIES.map((c) =>
      c.providerKey === 'mock_pos' ? { ...c, revokedAt: new Date().toISOString() } : c
    );
    const appRevoked = buildApp({
      capabilityRepo: new InMemoryCapabilityRepository(revokedCaps),
    });
    await appRevoked.ready();
    const guestRes2 = await appRevoked.inject({ method: 'POST', url: '/v1/guest-sessions' });
    const { sessionToken: token2 } = JSON.parse(guestRes2.payload);
    const quoteRes2 = await appRevoked.inject({
      method: 'POST',
      url: '/v1/checkout-quotes',
      headers: { 'idempotency-key': 'rev-cap-quote-key-1', authorization: `Bearer ${token2}` },
      payload: {
        locationId: 'f1000000-0000-4000-a000-000000000001',
        catalogueVersion: 1,
        destination: { countryCode: 'GB', address: { formattedAddress: '10 Downing St' } },
        items: [{ menuItemId: 'i1000000-0000-4000-a000-000000000001', quantity: 1 }],
      },
    });
    const quote2 = JSON.parse(quoteRes2.payload);
    const orderRes2 = await appRevoked.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { 'idempotency-key': 'rev-cap-order-key-1', authorization: `Bearer ${token2}` },
      payload: { quoteId: quote2.quoteId, paymentMethodToken: 'tok_valid' },
    });
    expect(orderRes2.statusCode).toBe(422);
    await appRevoked.close();
  });

  it('Scenario D: transitions payment to reconciliation_required on provider timeout without duplicate charge', async () => {
    const auditRepo = new InMemoryAuditRepository();
    const quotesRepo = new InMemoryQuotesRepository();
    const guestRepo = new InMemoryGuestSessionRepository();
    const outboxRepo = new InMemoryOutboxRepository();
    const orderRepo = new InMemoryOrderRepository(quotesRepo, outboxRepo, guestRepo);
    const paymentRepo = new InMemoryPaymentRepository(orderRepo);
    const paymentAdapter = new MockPaymentAdapter();

    const app = buildApp({
      capabilityRepo: new InMemoryCapabilityRepository(SYNTHETIC_TEST_CAPABILITIES),
      auditRepo,
      quotesRepo,
      guestRepo,
      outboxRepo,
      orderRepo,
      paymentRepo,
      paymentAdapter,
    });
    await app.ready();

    const guestRes = await app.inject({ method: 'POST', url: '/v1/guest-sessions' });
    const { sessionToken } = JSON.parse(guestRes.payload);

    const quoteRes = await app.inject({
      method: 'POST',
      url: '/v1/checkout-quotes',
      headers: { 'idempotency-key': 'scenario-d-quote-1', authorization: `Bearer ${sessionToken}` },
      payload: {
        locationId: 'f1000000-0000-4000-a000-000000000001',
        catalogueVersion: 1,
        destination: { countryCode: 'GB', address: { formattedAddress: '10 Downing St' } },
        items: [{ menuItemId: 'i1000000-0000-4000-a000-000000000001', quantity: 1 }],
      },
    });
    const quote = JSON.parse(quoteRes.payload);

    // Simulate payment provider timeout
    paymentAdapter.setTimeoutNext(true);
    const orderRes = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { 'idempotency-key': 'scenario-d-order-1', authorization: `Bearer ${sessionToken}` },
      payload: { quoteId: quote.quoteId, paymentMethodToken: 'tok_valid_123' },
    });

    expect(orderRes.statusCode).toBe(202);
    const body = JSON.parse(orderRes.payload);
    expect(body.paymentState).toBe('reconciliation_required');

    const compensations = await auditRepo.listCompensationsByOrder(body.orderId);
    expect(compensations).toHaveLength(1);
    expect(compensations[0]?.state).toBe('reconciliation_required');
    expect(compensations[0]?.operationType).toBe('manual_reconciliation');

    await app.close();
  });

  it('handles POS submission timeout explicitly as submission_timeout + reconciliation_required', async () => {
    const auditRepo = new InMemoryAuditRepository();
    const posAdapter = new MockMerchantPosAdapter();
    const app = buildApp({
      capabilityRepo: new InMemoryCapabilityRepository(SYNTHETIC_TEST_CAPABILITIES),
      auditRepo,
      posAdapter,
    });
    await app.ready();

    const guestRes = await app.inject({ method: 'POST', url: '/v1/guest-sessions' });
    const { sessionToken } = JSON.parse(guestRes.payload);
    const quoteRes = await app.inject({
      method: 'POST',
      url: '/v1/checkout-quotes',
      headers: { 'idempotency-key': 'pos-timeout-quote-1', authorization: `Bearer ${sessionToken}` },
      payload: {
        locationId: 'f1000000-0000-4000-a000-000000000001',
        catalogueVersion: 1,
        destination: { countryCode: 'GB', address: { formattedAddress: '10 Downing St' } },
        items: [{ menuItemId: 'i1000000-0000-4000-a000-000000000001', quantity: 1 }],
      },
    });
    const quote = JSON.parse(quoteRes.payload);

    posAdapter.setTimeoutNext(true);
    const orderRes = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { 'idempotency-key': 'pos-timeout-order-1', authorization: `Bearer ${sessionToken}` },
      payload: { quoteId: quote.quoteId, paymentMethodToken: 'tok_valid' },
    });

    expect(orderRes.statusCode).toBe(202);
    const body = JSON.parse(orderRes.payload);
    expect(body.merchantOrderState).toBe('submission_timeout');
    const compensations = await auditRepo.listCompensationsByOrder(body.orderId);
    expect(compensations.some((c) => c.state === 'reconciliation_required')).toBe(true);
    await app.close();
  });

  it('supports zero-decimal (JPY) and three-decimal (KWD) pricing policies and fails closed on unconfigured markets', () => {
    const policy = new DefaultPricingPolicy([
      {
        countryCode: parseCountryCode('JP'),
        currency: parseCurrencyCode('JPY'),
        taxRateBasisPoints: 1000,
        taxInclusive: true,
        serviceFeeMinor: 50n,
      },
      {
        countryCode: parseCountryCode('KW'),
        currency: parseCurrencyCode('KWD'),
        taxRateBasisPoints: 0,
        taxInclusive: false,
        serviceFeeMinor: 250n, // 0.250 KWD
      },
    ]);

    const jpyBreakdown = policy.buildBreakdown(
      new Money(1000n, 'JPY'),
      new Money(300n, 'JPY'),
      parseCountryCode('JP'),
      parseCurrencyCode('JPY')
    );
    expect(jpyBreakdown.total.amountMinor).toBe('1450');
    expect(Money.formatJson(jpyBreakdown.total, 'ja-JP')).toContain('1,450');

    const kwdBreakdown = policy.buildBreakdown(
      new Money(5000n, 'KWD'), // 5.000 KWD
      new Money(1000n, 'KWD'), // 1.000 KWD
      parseCountryCode('KW'),
      parseCurrencyCode('KWD')
    );
    expect(kwdBreakdown.total.amountMinor).toBe('6250'); // 6.250 KWD
    expect(Money.fromJson(kwdBreakdown.total).toMajorString()).toBe('6.250');

    expect(() =>
      policy.calculateTax(new Money(100n, 'AUD'), parseCountryCode('AU'), parseCurrencyCode('AUD'))
    ).toThrow(/not configured/i);
  });
});

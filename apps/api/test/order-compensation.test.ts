import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Money } from '@arrival/contracts';
import { buildApp } from '../src/app.js';
import {
  InMemoryOrderRepository,
  InMemoryQuotesRepository,
  InMemoryGuestSessionRepository,
  InMemoryOutboxRepository,
} from '../src/repositories/in-memory.js';
import {
  MockMerchantPosAdapter,
  MockPaymentAdapter,
} from '../src/adapters/provider-adapters.js';
import { OrderService } from '../src/services/order-service.js';
import { QuoteService } from '../src/services/quote-service.js';
import {
  InMemoryCapabilityRepository,
  InMemoryPlacesRepository,
  InMemoryCatalogueRepository,
} from '../src/repositories/in-memory.js';

describe('Order POS Rejection and Payment Compensation Flow', () => {
  let app: FastifyInstance;
  let posAdapter: MockMerchantPosAdapter;
  let paymentAdapter: MockPaymentAdapter;
  let orderRepo: InMemoryOrderRepository;
  let quotesRepo: InMemoryQuotesRepository;
  let outboxRepo: InMemoryOutboxRepository;

  beforeAll(async () => {
    orderRepo = new InMemoryOrderRepository();
    quotesRepo = new InMemoryQuotesRepository();
    outboxRepo = new InMemoryOutboxRepository();
    const guestRepo = new InMemoryGuestSessionRepository();
    const placesRepo = new InMemoryPlacesRepository();
    const catalogueRepo = new InMemoryCatalogueRepository();
    const capabilityRepo = new InMemoryCapabilityRepository();

    posAdapter = new MockMerchantPosAdapter();
    paymentAdapter = new MockPaymentAdapter();

    const quoteService = new QuoteService(placesRepo, catalogueRepo, quotesRepo, capabilityRepo, {
      providerKey: 'mock_del',
      quoteDelivery: async (p) => ({
        quoteRef: 'del-ref-1',
        fee: new Money(250n, p.currency),
        estimatedMinutes: 30,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      }),
    });

    const orderService = new OrderService(
      quotesRepo,
      orderRepo,
      guestRepo,
      capabilityRepo,
      placesRepo,
      posAdapter,
      paymentAdapter,
      outboxRepo
    );

    app = buildApp({
      orderRepo,
      quotesRepo,
      guestRepo,
      outboxRepo,
    });

    // Replace the orderService on the app routes via custom route test or direct service test
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('compensates payment and transitions order to rejected when POS rejects submission', async () => {
    const guestRepo = new InMemoryGuestSessionRepository();
    const placesRepo = new InMemoryPlacesRepository();
    const catalogueRepo = new InMemoryCatalogueRepository();
    const capabilityRepo = new InMemoryCapabilityRepository();
    const localOrderRepo = new InMemoryOrderRepository();
    const localQuotesRepo = new InMemoryQuotesRepository();
    const localOutboxRepo = new InMemoryOutboxRepository();

    const localPos = new MockMerchantPosAdapter();
    let refundIssued = false;
    let refundedAmount: any = null;

    const localPayment = new MockPaymentAdapter();
    localPayment.refundPayment = async (_ref, amount) => {
      refundIssued = true;
      refundedAmount = amount;
      return { refundRef: 'ref-comp-1' };
    };

    const quoteService = new QuoteService(placesRepo, catalogueRepo, localQuotesRepo, capabilityRepo, {
      providerKey: 'mock_del',
      quoteDelivery: async (p) => ({
        quoteRef: 'del-ref-1',
        fee: new Money(250n, p.currency),
        estimatedMinutes: 30,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      }),
    });

    const orderService = new OrderService(
      localQuotesRepo,
      localOrderRepo,
      guestRepo,
      capabilityRepo,
      placesRepo,
      localPos,
      localPayment,
      localOutboxRepo
    );

    // 1. Create quote
    const quote = await quoteService.createQuote({
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
          modifierOptionIds: ['opt-thick-slice'],
        },
      ],
    });

    // 2. Configure POS to reject the next order submission
    localPos.setRejectNext(true);

    // 3. Submit order and assert rejection
    await expect(
      orderService.submitOrder(
        {
          quoteId: quote.quoteId,
          paymentMethodToken: 'tok_visa_verified',
        },
        {
          idempotencyKey: 'idemp-comp-order-001',
          guestSessionId: 'sess-123',
        }
      )
    ).rejects.toThrow(/Merchant POS declined the order submission/);

    // 4. Assert refund was issued to compensate
    expect(refundIssued).toBe(true);
    expect(refundedAmount.amountMinor).toBe(BigInt(quote.total.amountMinor));

    // 5. Assert outbox compensation record was published
    const pendingOutbox = await localOutboxRepo.fetchPending(10);
    expect(pendingOutbox.length).toBeGreaterThan(0);
    const compensationMsg = pendingOutbox.find(
      (m) => m.eventType === 'order_compensation_refunded'
    );
    expect(compensationMsg).toBeDefined();
    expect((compensationMsg?.payload as any)?.reason).toBe('POS_REJECTION');
  });
});

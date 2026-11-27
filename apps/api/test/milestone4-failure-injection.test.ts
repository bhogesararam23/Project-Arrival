import { describe, it, expect } from 'vitest';
import { createHmac, createHash, randomUUID } from 'node:crypto';
import { Money, parseCurrencyCode } from '@arrival/contracts';
import {
  InMemoryPlacesRepository,
  InMemoryCatalogueRepository,
  InMemoryQuotesRepository,
  InMemoryOrderRepository,
  InMemoryGuestSessionRepository,
  InMemoryCapabilityRepository,
  InMemoryOutboxRepository,
  InMemoryPaymentRepository,
  InMemoryFulfilmentRepository,
  InMemoryWebhookInboxRepository,
  InMemoryAuditRepository,
  SYNTHETIC_TEST_CAPABILITIES,
} from '../src/repositories/in-memory.js';
import {
  MockMerchantPosAdapter,
  MockPaymentAdapter,
  MockFulfilmentAdapter,
} from '../src/adapters/provider-adapters.js';
import { QuoteService } from '../src/services/quote-service.js';
import { OrderService } from '../src/services/order-service.js';
import { PaymentOrchestrationService } from '../src/services/payment-service.js';
import { WebhookService, HmacSha256TestWebhookVerifier, redactWebhookPayload } from '../src/services/webhook-service.js';
import { OperationsService } from '../src/services/operations-service.js';
import { OutboxWorker } from '../src/workers/outbox-worker.js';

describe('Milestone 4: Failure Injection & Recoverable Orchestration', () => {
  it('Scenario 6: recovers order committed before worker crash via OutboxWorker + OrderOrchestrator', async () => {
    const placesRepo = new InMemoryPlacesRepository();
    const catalogueRepo = new InMemoryCatalogueRepository();
    const quotesRepo = new InMemoryQuotesRepository();
    const guestRepo = new InMemoryGuestSessionRepository();
    const outboxRepo = new InMemoryOutboxRepository();
    const orderRepo = new InMemoryOrderRepository(quotesRepo, outboxRepo, guestRepo);
    const paymentRepo = new InMemoryPaymentRepository(orderRepo);
    const fulfilmentRepo = new InMemoryFulfilmentRepository(orderRepo);
    const auditRepo = new InMemoryAuditRepository();
    const capabilityRepo = new InMemoryCapabilityRepository(SYNTHETIC_TEST_CAPABILITIES);

    const posAdapter = new MockMerchantPosAdapter();
    const paymentAdapter = new MockPaymentAdapter();
    const fulfilmentAdapter = new MockFulfilmentAdapter();

    const quoteService = new QuoteService(
      placesRepo,
      catalogueRepo,
      quotesRepo,
      capabilityRepo,
      fulfilmentAdapter
    );
    const orderService = new OrderService(
      quotesRepo,
      orderRepo,
      guestRepo,
      capabilityRepo,
      placesRepo,
      posAdapter,
      paymentAdapter,
      outboxRepo,
      paymentRepo,
      fulfilmentRepo,
      auditRepo
    );

    const quote = await quoteService.createQuote({
      locationId: 'f1000000-0000-4000-a000-000000000001',
      catalogueVersion: 1,
      destination: { countryCode: 'GB', address: { formattedAddress: '10 Downing St' } },
      items: [{ menuItemId: 'i1000000-0000-4000-a000-000000000001', quantity: 1 }],
    });

    // Submit with asyncOnly=true (simulates API returning 202 after durable DB commit before external calls)
    const created = await orderService.submitOrder(
      { quoteId: quote.quoteId, paymentMethodToken: 'tok_valid' },
      { idempotencyKey: `async-crash-${randomUUID()}`, asyncOnly: true }
    );

    expect(created.orderState).toBe('submitted');
    expect(created.paymentState).toBe('requires_action');

    // Now OutboxWorker starts and recovers the pending order_submitted message
    const worker = new OutboxWorker(outboxRepo, orderService.getOrchestrator().getOutboxHandlers());
    const stats = await worker.processOnce();
    expect(stats.claimed).toBe(1);
    expect(stats.completed).toBe(1);

    const recoveredOrder = await orderRepo.getById(created.orderId);
    expect(recoveredOrder?.orderState).toBe('awaiting_merchant');
    expect(recoveredOrder?.paymentState).toBe('authorized');
    expect(recoveredOrder?.merchantOrderState).toBe('submission_accepted_for_processing');
  });

  it('Scenario 9: recovers pending webhook inbox events left after crash before dispatch', async () => {
    const quotesRepo = new InMemoryQuotesRepository();
    const guestRepo = new InMemoryGuestSessionRepository();
    const outboxRepo = new InMemoryOutboxRepository();
    const orderRepo = new InMemoryOrderRepository(quotesRepo, outboxRepo, guestRepo);
    const paymentRepo = new InMemoryPaymentRepository(orderRepo);
    const fulfilmentRepo = new InMemoryFulfilmentRepository(orderRepo);
    const webhookRepo = new InMemoryWebhookInboxRepository();
    const placesRepo = new InMemoryPlacesRepository();
    const catalogueRepo = new InMemoryCatalogueRepository();
    const capabilityRepo = new InMemoryCapabilityRepository(SYNTHETIC_TEST_CAPABILITIES);

    const quoteService = new QuoteService(
      placesRepo,
      catalogueRepo,
      quotesRepo,
      capabilityRepo,
      new MockFulfilmentAdapter()
    );
    const orderService = new OrderService(
      quotesRepo,
      orderRepo,
      guestRepo,
      capabilityRepo,
      placesRepo,
      new MockMerchantPosAdapter(),
      new MockPaymentAdapter(),
      outboxRepo,
      paymentRepo,
      fulfilmentRepo
    );

    const quote = await quoteService.createQuote({
      locationId: 'f1000000-0000-4000-a000-000000000001',
      catalogueVersion: 1,
      destination: { countryCode: 'GB', address: { formattedAddress: '10 Downing St' } },
      items: [{ menuItemId: 'i1000000-0000-4000-a000-000000000001', quantity: 1 }],
    });
    const order = await orderService.submitOrder(
      { quoteId: quote.quoteId, paymentMethodToken: 'tok_valid' },
      { idempotencyKey: `wh-rec-${randomUUID()}` }
    );
    expect(order.orderState).toBe('awaiting_merchant');

    // Insert a verified webhook directly as 'pending' (simulating crash between ingest and dispatch)
    await webhookRepo.ingest({
      id: randomUUID(),
      providerKey: 'mock_pos',
      providerAccountRef: 'default',
      providerEventRef: `evt-recover-${randomUUID()}`,
      eventType: 'merchant.accepted',
      receivedAt: new Date().toISOString(),
      signatureVerified: true,
      payloadDigest: createHash('sha256').update('{}').digest('hex'),
      redactedPayload: {},
      status: 'pending',
      attempts: 0,
      correlationOrderId: order.orderId,
    });

    const webhookService = new WebhookService(
      webhookRepo,
      new HmacSha256TestWebhookVerifier({ mock_pos: 'test-sec' }),
      orderRepo,
      paymentRepo,
      fulfilmentRepo
    );

    const recovery = await webhookService.recoverPendingEvents();
    expect(recovery.claimed).toBe(1);
    expect(recovery.processed).toBe(1);

    const updatedOrder = await orderRepo.getById(order.orderId);
    expect(updatedOrder?.orderState).toBe('accepted');
  });

  it('Scenario 14: privileged ops actions fail safely without mutating state if audit persistence fails', async () => {
    const outboxRepo = new InMemoryOutboxRepository();
    const capRepo = new InMemoryCapabilityRepository(SYNTHETIC_TEST_CAPABILITIES);
    const failingAuditRepo = new InMemoryAuditRepository();
    failingAuditRepo.recordAudit = async () => {
      throw new Error('Simulated audit database write failure');
    };

    const opsService = new OperationsService(
      new InMemoryOrderRepository(),
      new InMemoryPaymentRepository(),
      new InMemoryFulfilmentRepository(),
      outboxRepo,
      new InMemoryWebhookInboxRepository(),
      capRepo,
      failingAuditRepo
    );

    await expect(
      opsService.suspendCapability({
        capabilityId: 'cap-001',
        actorId: 'op-admin-1',
        actorRole: 'ops_admin',
        reason: 'Emergency outage suspension',
      })
    ).rejects.toThrow('Simulated audit database write failure');

    // Capability MUST remain un-suspended because audit failed!
    const allCaps = await capRepo.listAllCapabilities();
    const cap = allCaps.find((c) => c.id === 'cap-001')!;
    expect(cap.status).toBe('production_verified');
    expect(cap.revokedAt).toBeUndefined();
  });

  it('enforces bounded partial refunds and capture lifecycle on PaymentOrchestrationService', async () => {
    const orderRepo = new InMemoryOrderRepository();
    const paymentRepo = new InMemoryPaymentRepository(orderRepo);
    const paymentService = new PaymentOrchestrationService(paymentRepo, new MockPaymentAdapter());

    const orderId = randomUUID();
    const authRes = await paymentService.createAndAuthorize({
      orderId,
      amount: new Money(1000n, 'GBP'),
      currency: parseCurrencyCode('GBP'),
      paymentMethodToken: 'tok_valid',
      idempotencyKey: 'pay-partial-1',
    });
    expect(authRes.outcome).toBe('authorized');

    const captured = await paymentService.capture(orderId, 'cap-partial-1');
    expect(captured.state).toBe('captured');

    // Partial refund 400 minor -> partially_refunded
    const ref1 = await paymentService.partialRefund({
      orderId,
      amount: new Money(400n, 'GBP'),
      reason: 'Missing item',
      idempotencyKey: 'ref-1',
    });
    expect(ref1.state).toBe('partially_refunded');

    // Attempting 700 minor (> remaining 600) MUST fail
    await expect(
      paymentService.partialRefund({
        orderId,
        amount: new Money(700n, 'GBP'),
        reason: 'Over-refund attempt',
        idempotencyKey: 'ref-over',
      })
    ).rejects.toThrow(/exceeds remaining refundable amount 600/);

    // Exact remaining 600 -> refunded
    const ref2 = await paymentService.partialRefund({
      orderId,
      amount: new Money(600n, 'GBP'),
      reason: 'Remaining refund',
      idempotencyKey: 'ref-2',
    });
    expect(ref2.state).toBe('refunded');
  });

  it('redacts sensitive fields inside nested arrays and rejects duplicate webhook with mismatched digest', async () => {
    const redacted = redactWebhookPayload({
      items: [{ name: 'Burger', token: 'secret-tok', nested: [{ email: 'a@b.com' }] }],
      card: '4111',
    }) as any;
    expect(redacted.card).toBe('[REDACTED]');
    expect(redacted.items[0].token).toBe('[REDACTED]');
    expect(redacted.items[0].nested[0].email).toBe('[REDACTED]');

    const secret = 'wh-sec-mismatch';
    const webhookService = new WebhookService(
      new InMemoryWebhookInboxRepository(),
      new HmacSha256TestWebhookVerifier({ mock_pos: secret }),
      new InMemoryOrderRepository(),
      new InMemoryPaymentRepository(),
      new InMemoryFulfilmentRepository()
    );

    const ts = String(Math.floor(Date.now() / 1000));
    const p1 = { eventId: 'evt-dup-1', eventType: 'merchant.accepted', accountRef: 'a1' };
    const p2 = { eventId: 'evt-dup-1', eventType: 'merchant.rejected', accountRef: 'a1' };

    const sig1 = 'v1=' + createHmac('sha256', secret).update(`${ts}.${JSON.stringify(p1)}`).digest('hex');
    const sig2 = 'v1=' + createHmac('sha256', secret).update(`${ts}.${JSON.stringify(p2)}`).digest('hex');

    await webhookService.receiveWebhook({
      providerKey: 'mock_pos',
      rawBody: JSON.stringify(p1),
      payload: p1,
      signatureHeader: sig1,
      timestampHeader: ts,
    });

    await expect(
      webhookService.receiveWebhook({
        providerKey: 'mock_pos',
        rawBody: JSON.stringify(p2),
        payload: p2,
        signatureHeader: sig2,
        timestampHeader: ts,
      })
    ).rejects.toThrow(/mismatched payload digest/i);
  });
});

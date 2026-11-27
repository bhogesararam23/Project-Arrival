import { describe, it, expect } from 'vitest';
import { createHmac, randomUUID } from 'node:crypto';
import { buildApp } from '../src/app.js';
import {
  InMemoryOutboxRepository,
  InMemoryCapabilityRepository,
  InMemoryAuditRepository,
  SYNTHETIC_TEST_CAPABILITIES,
} from '../src/repositories/in-memory.js';
import { OutboxWorker } from '../src/workers/outbox-worker.js';
import { HmacSha256TestWebhookVerifier } from '../src/services/webhook-service.js';
import { StaticMapOperatorVerifier } from '../src/middleware/ops-auth.js';

function signWebhook(secret: string, timestamp: string, payload: Record<string, unknown>): string {
  const raw = JSON.stringify(payload);
  const sig = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
  return `v1=${sig}`;
}

describe('Milestone 3: Outbox Worker, Webhook Inbox & Operations Control Plane', () => {
  it('Scenario E: OutboxWorker handles concurrent claiming, lease expiry recovery, retries, and DLQ', async () => {
    const outboxRepo = new InMemoryOutboxRepository();
    const msgId = randomUUID();

    await outboxRepo.publish({
      id: msgId,
      aggregateType: 'order',
      aggregateId: randomUUID(),
      eventType: 'test.flaky',
      payload: { step: 1 },
      createdAt: new Date().toISOString(),
      availableAt: new Date().toISOString(),
      attempts: 0,
      maxAttempts: 2,
    });

    // 1. Concurrent claiming: only 1 worker receives the message
    const [claim1, claim2] = await Promise.all([
      outboxRepo.claimBatch('w-1', 10, 50), // 50ms short lease
      outboxRepo.claimBatch('w-2', 10, 50),
    ]);
    expect(claim1.length + claim2.length).toBe(1);

    // 2. Simulate worker crash (do not call complete), wait for lease to expire (>50ms)
    await new Promise((r) => setTimeout(r, 80));

    // 3. Second worker recovers expired lease and hits maxAttempts (2) on failure -> dead-lettered
    const worker = new OutboxWorker(
      outboxRepo,
      {
        'test.flaky': async () => {
          throw new Error('Downstream timeout');
        },
      },
      { batchSize: 10, maxConcurrency: 2 }
    );

    const stats = await worker.processOnce();
    expect(stats.claimed).toBe(1);
    expect(stats.deadLettered).toBe(1);

    const dlq = await outboxRepo.listDeadLetter();
    expect(dlq).toHaveLength(1);
    expect(dlq[0]?.id).toBe(msgId);
    expect(dlq[0]?.lastError).toContain('Downstream timeout');

    // 4. Replay from DLQ succeeds when handler recovers
    await outboxRepo.replayDeadLetter(msgId);
    let handledCount = 0;
    const recoveredWorker = new OutboxWorker(outboxRepo, {
      'test.flaky': async () => {
        handledCount += 1;
      },
    });
    const stats2 = await recoveredWorker.processOnce();
    expect(stats2.completed).toBe(1);
    expect(handledCount).toBe(1);
  });

  it('Scenario F: Webhook ingress verifies signatures, blocks expired timestamps, and deduplicates replays', async () => {
    const secret = 'test-webhook-signing-secret-01';
    const app = buildApp({
      capabilityRepo: new InMemoryCapabilityRepository(SYNTHETIC_TEST_CAPABILITIES),
      webhookVerifier: new HmacSha256TestWebhookVerifier({ mock_pos: secret }),
    });
    await app.ready();

    // Create an order first
    const guestRes = await app.inject({ method: 'POST', url: '/v1/guest-sessions' });
    const { sessionToken } = JSON.parse(guestRes.payload);
    const quoteRes = await app.inject({
      method: 'POST',
      url: '/v1/checkout-quotes',
      headers: { 'idempotency-key': 'wh-test-quote-key-1', authorization: `Bearer ${sessionToken}` },
      payload: {
        locationId: 'f1000000-0000-4000-a000-000000000001',
        catalogueVersion: 1,
        destination: { countryCode: 'GB', address: { formattedAddress: '10 Downing St' } },
        items: [{ menuItemId: 'i1000000-0000-4000-a000-000000000001', quantity: 1 }],
      },
    });
    const quote = JSON.parse(quoteRes.payload);
    const orderRes = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { 'idempotency-key': 'wh-test-order-key-1', authorization: `Bearer ${sessionToken}` },
      payload: { quoteId: quote.quoteId, paymentMethodToken: 'tok_valid' },
    });
    const orderCreated = JSON.parse(orderRes.payload);

    const nowTs = String(Math.floor(Date.now() / 1000));
    const eventPayload = {
      eventId: `evt-${randomUUID()}`,
      eventType: 'merchant.accepted',
      accountRef: 'acct-1',
      orderId: orderCreated.orderId,
    };

    // 1. Invalid signature rejected with 401 before mutating state
    const badSigRes = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/mock_pos',
      headers: {
        'x-arrival-timestamp': nowTs,
        'x-arrival-signature': 'v1=' + '0'.repeat(64),
      },
      payload: eventPayload,
    });
    expect(badSigRes.statusCode).toBe(401);

    // 2. Expired timestamp rejected with 400
    const oldTs = String(Math.floor(Date.now() / 1000) - 3600);
    const expiredRes = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/mock_pos',
      headers: {
        'x-arrival-timestamp': oldTs,
        'x-arrival-signature': signWebhook(secret, oldTs, eventPayload),
      },
      payload: eventPayload,
    });
    expect(expiredRes.statusCode).toBe(400);
    expect(JSON.parse(expiredRes.payload).code).toBe('EXPIRED_WEBHOOK_TIMESTAMP');

    // 3. Valid signature succeeds and transitions order to accepted
    const validRes = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/mock_pos',
      headers: {
        'x-arrival-timestamp': nowTs,
        'x-arrival-signature': signWebhook(secret, nowTs, eventPayload),
      },
      payload: eventPayload,
    });
    expect(validRes.statusCode).toBe(200);
    expect(JSON.parse(validRes.payload).status).toBe('processed');

    // Verify order transitioned to accepted
    const orderCheck = await app.inject({
      method: 'GET',
      url: `/v1/orders/${orderCreated.orderId}`,
      headers: { authorization: `Bearer ${orderCreated.guestAccessGrant}` },
    });
    expect(JSON.parse(orderCheck.payload).orderState).toBe('accepted');

    // 4. Duplicate replay is deduplicated cleanly
    const replayRes = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/mock_pos',
      headers: {
        'x-arrival-timestamp': nowTs,
        'x-arrival-signature': signWebhook(secret, nowTs, eventPayload),
      },
      payload: eventPayload,
    });
    expect(replayRes.statusCode).toBe(200);
    expect(JSON.parse(replayRes.payload).deduplicated).toBe(true);

    await app.close();
  });

  it('enforces operator RBAC (ops_readonly vs ops_admin) and records immutable audit trail', async () => {
    const auditRepo = new InMemoryAuditRepository();
    const outboxRepo = new InMemoryOutboxRepository();
    const capRepo = new InMemoryCapabilityRepository(SYNTHETIC_TEST_CAPABILITIES);
    const verifier = new StaticMapOperatorVerifier([
      { token: 'ops-ro-token', actorId: 'op-ro-1', role: 'ops_readonly' },
      { token: 'ops-admin-token', actorId: 'op-admin-1', role: 'ops_admin' },
    ]);

    const app = buildApp({
      capabilityRepo: capRepo,
      outboxRepo,
      auditRepo,
      operatorVerifier: verifier,
    });
    await app.ready();

    // 1. Unauthenticated fails closed (401)
    const unauthRes = await app.inject({ method: 'GET', url: '/v1/ops/overview' });
    expect(unauthRes.statusCode).toBe(401);

    // 2. ops_readonly can read overview and capabilities
    const roRes = await app.inject({
      method: 'GET',
      url: '/v1/ops/overview',
      headers: { authorization: 'Bearer ops-ro-token' },
    });
    expect(roRes.statusCode).toBe(200);

    // 3. ops_readonly CANNOT suspend capability (403)
    const roSuspendRes = await app.inject({
      method: 'POST',
      url: '/v1/ops/capabilities/cap-001/suspend',
      headers: { authorization: 'Bearer ops-ro-token' },
      payload: { reason: 'Unauthorized attempt' },
    });
    expect(roSuspendRes.statusCode).toBe(403);
    expect(JSON.parse(roSuspendRes.payload).code).toBe('OPS_INSUFFICIENT_ROLE');

    // 4. ops_admin CAN suspend capability and audit record is persisted
    const adminSuspendRes = await app.inject({
      method: 'POST',
      url: '/v1/ops/capabilities/cap-001/suspend',
      headers: { authorization: 'Bearer ops-admin-token' },
      payload: { reason: 'Emergency POS outage suspension' },
    });
    expect(adminSuspendRes.statusCode).toBe(200);

    const audits = await auditRepo.listAuditByResource('provider_capability', 'cap-001');
    expect(audits).toHaveLength(1);
    expect(audits[0]?.actorId).toBe('op-admin-1');
    expect(audits[0]?.action).toBe('capability_suspended');

    await app.close();
  });
});

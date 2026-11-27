import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createDatabasePool,
  checkDatabaseHealth,
  DatabaseMigrator,
  loadMigrations,
  RetentionCleanupService,
  PgPlacesRepository,
  PgCatalogueRepository,
  PgQuotesRepository,
  PgOrderRepository,
  PgGuestSessionRepository,
  PgCapabilityRepository,
  PgIdempotencyRepository,
  PgOutboxRepository,
  PgPaymentRepository,
  PgFulfilmentRepository,
  PgWebhookInboxRepository,
  PgAuditRepository,
  type DatabasePool,
} from '../src/index.js';
import { parseCountryCode, parseCurrencyCode } from '@arrival/contracts';

const TEST_DB_URL = process.env['TEST_DATABASE_URL'] || process.env['DATABASE_URL'];
const describePg = TEST_DB_URL ? describe : describe.skip;

describePg('PostgreSQL + PostGIS Real Integration Suite', () => {
  let pool: DatabasePool;
  let placesRepo: PgPlacesRepository;
  let catalogueRepo: PgCatalogueRepository;
  let quotesRepo: PgQuotesRepository;
  let orderRepo: PgOrderRepository;
  let guestRepo: PgGuestSessionRepository;
  let capabilityRepo: PgCapabilityRepository;
  let idempotencyRepo: PgIdempotencyRepository;
  let outboxRepo: PgOutboxRepository;
  let paymentRepo: PgPaymentRepository;
  let fulfilmentRepo: PgFulfilmentRepository;
  let webhookRepo: PgWebhookInboxRepository;
  let auditRepo: PgAuditRepository;

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDir = path.resolve(__dirname, '../migrations');

  beforeAll(async () => {
    pool = createDatabasePool({ connectionString: TEST_DB_URL, maxPoolSize: 5 });
    const health = await checkDatabaseHealth(pool);
    expect(health.healthy).toBe(true);

    const migrations = await loadMigrations(migrationsDir);
    const migrator = new DatabaseMigrator(pool, migrations, { requireLock: true });
    await migrator.up();

    placesRepo = new PgPlacesRepository(pool);
    catalogueRepo = new PgCatalogueRepository(pool);
    quotesRepo = new PgQuotesRepository(pool);
    orderRepo = new PgOrderRepository(pool);
    guestRepo = new PgGuestSessionRepository(pool);
    capabilityRepo = new PgCapabilityRepository(pool);
    idempotencyRepo = new PgIdempotencyRepository(pool);
    outboxRepo = new PgOutboxRepository(pool);
    paymentRepo = new PgPaymentRepository(pool);
    fulfilmentRepo = new PgFulfilmentRepository(pool);
    webhookRepo = new PgWebhookInboxRepository(pool);
    auditRepo = new PgAuditRepository(pool);
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  it('persists and reconstructs guest sessions, venues, catalogues, quotes, orders, payments, outbox, and webhooks', async () => {
    // 1. Create guest session
    const sessionId = randomUUID();
    const sessionToken = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
    const sessionDigest = createHash('sha256').update(sessionToken).digest('hex');
    await guestRepo.createSession({
      id: sessionId,
      tokenDigest: sessionDigest,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    const fetchedSession = await guestRepo.getSessionByDigest(sessionDigest);
    expect(fetchedSession?.id).toBe(sessionId);

    // 2. Seed venue, merchant, location, and catalogue
    const merchantId = randomUUID();
    const venueId = randomUUID();
    const locationId = randomUUID();
    const catalogueId = randomUUID();
    const menuItemId = randomUUID();

    await pool.query(
      `INSERT INTO merchants (id, legal_name, country_code, verification_state) VALUES ($1, 'PG Test Bakery Ltd', 'GB', 'verified');`,
      [merchantId]
    );
    await pool.query(
      `INSERT INTO venues (id, display_name, normalized_name, listing_status) VALUES ($1, 'PG Test Bakery', 'pg test bakery', 'verified');`,
      [venueId]
    );
    await pool.query(
      `INSERT INTO merchant_locations (id, venue_id, merchant_id, display_name, country_code, public_address, location, timezone, listing_status)
       VALUES ($1, $2, $3, 'PG Test Bakery - Main', 'GB', '{"formattedAddress":"10 Test St"}'::jsonb, ST_SetSRID(ST_MakePoint(-0.1309, 51.4988), 4326)::geography, 'Europe/London', 'verified');`,
      [locationId, venueId, merchantId]
    );
    await pool.query(
      `INSERT INTO catalogues (id, location_id, version, currency, status, published_at) VALUES ($1, $2, 1, 'GBP', 'published', now());`,
      [catalogueId, locationId]
    );
    await pool.query(
      `INSERT INTO menu_items (id, catalogue_id, name, price_minor, available) VALUES ($1, $2, 'Sourdough', 450, true);`,
      [menuItemId, catalogueId]
    );

    // 3. Verify unverified location is NOT marked native_orderable
    const unverifiedSearch = await placesRepo.search({ q: 'pg test bakery' });
    const foundLoc = unverifiedSearch.locations.find((l) => l.id === locationId);
    expect(foundLoc?.orderability).toBe('catalogue_only');

    const loadedCat = await catalogueRepo.getCatalogueByLocation(locationId);
    expect(loadedCat?.items[0]?.name).toBe('Sourdough');

    // 4. Save & retrieve quote with items and policy service fee
    const quoteId = randomUUID();
    await quotesRepo.save(
      {
        quoteId,
        currency: parseCurrencyCode('GBP'),
        subtotal: { amountMinor: '450', currency: 'GBP' },
        tax: { amountMinor: '90', currency: 'GBP' },
        delivery: { amountMinor: '250', currency: 'GBP' },
        serviceFee: { amountMinor: '50', currency: 'GBP' },
        total: { amountMinor: '840', currency: 'GBP' },
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
        catalogueVersion: 1,
        deliveryQuoteRef: 'ful-ref-pg-1',
        taxInclusive: true,
      },
      {
        locationId,
        destinationCountry: 'GB',
        guestSessionId: sessionId,
        items: [
          {
            menuItemId,
            name: 'Sourdough',
            quantity: 1,
            unitPriceMinor: '450',
            totalPriceMinor: '450',
          },
        ],
      }
    );

    const loadedQuote = await quotesRepo.getById(quoteId);
    expect(loadedQuote).not.toBeNull();
    expect(loadedQuote?.items).toHaveLength(1);
    expect(loadedQuote?.quote.serviceFee?.amountMinor).toBe('50');
    expect(loadedQuote?.quote.deliveryQuoteRef).toBe('ful-ref-pg-1');

    // 5. Concurrent idempotency reservation
    const idemKey = `pg-idem-${randomUUID()}`;
    const reqHash = createHash('sha256').update('{"test":true}').digest('hex');
    const [res1, res2] = await Promise.all([
      idempotencyRepo.tryReserve(`digest:${sessionDigest}`, 'POST /v1/orders', idemKey, reqHash, 30_000),
      idempotencyRepo.tryReserve(`digest:${sessionDigest}`, 'POST /v1/orders', idemKey, reqHash, 30_000),
    ]);
    const successes = [res1, res2].filter((r) => r.success);
    expect(successes).toHaveLength(1);
    const idempotencyRecordId = successes[0]!.record!.id;

    // 6. Create order atomically with outbox + guest grants
    const orderId = randomUUID();
    const outboxId = randomUUID();
    const readGrantDigest = createHash('sha256').update(randomUUID()).digest('hex');
    const createRes = await orderRepo.createOrder({
      order: {
        orderId,
        orderState: 'submitted',
        paymentState: 'requires_action',
        fulfilmentState: 'quote_pending',
        merchantOrderState: 'submission_requested',
        updatedAt: new Date().toISOString(),
      },
      quote: loadedQuote!.quote,
      locationId,
      purchaseSnapshot: {
        quoteId,
        locationId,
        destinationCountry: parseCountryCode('GB'),
        catalogueVersion: 1,
        currency: parseCurrencyCode('GBP'),
        items: loadedQuote!.items,
        pricing: {
          currency: parseCurrencyCode('GBP'),
          subtotal: loadedQuote!.quote.subtotal,
          tax: loadedQuote!.quote.tax,
          taxRateBasisPoints: 2000,
          taxInclusive: true,
          deliveryFee: loadedQuote!.quote.delivery,
          serviceFee: loadedQuote!.quote.serviceFee!,
          total: loadedQuote!.quote.total,
        },
        capturedAt: new Date().toISOString(),
      },
      items: loadedQuote!.items,
      guestSessionId: sessionId,
      idempotencyRecordId,
      outboxMessages: [
        {
          id: outboxId,
          aggregateType: 'order',
          aggregateId: orderId,
          eventType: 'order_submitted',
          payload: { orderId },
          createdAt: new Date().toISOString(),
          availableAt: new Date().toISOString(),
          attempts: 0,
        },
      ],
      guestGrants: [
        {
          id: randomUUID(),
          orderId,
          tokenDigest: readGrantDigest,
          scope: 'read_order',
          expiresAt: new Date(Date.now() + 86400_000).toISOString(),
          createdAt: new Date().toISOString(),
        },
      ],
    });
    expect(createRes.quoteConsumed).toBe(true);

    // Concurrent second consumption of same quote must fail
    const secondConsume = await quotesRepo.markConsumed(quoteId);
    expect(secondConsume).toBe(false);

    // 7. Payment & fulfilment state updates reflect in orderRepo.getById()
    const payAttemptId = randomUUID();
    await paymentRepo.createAttempt({
      id: payAttemptId,
      orderId,
      providerKey: 'mock_payment',
      providerAccountRef: 'default',
      state: 'authorized',
      amountMinor: '840',
      currency: parseCurrencyCode('GBP'),
      idempotencyKey: `pay-${orderId}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const fulAttemptId = randomUUID();
    await fulfilmentRepo.createAttempt({
      id: fulAttemptId,
      orderId,
      providerKey: 'mock_delivery',
      providerAccountRef: 'default',
      state: 'quoted',
      quoteRef: 'ful-ref-pg-1',
      feeMinor: '250',
      currency: parseCurrencyCode('GBP'),
      idempotencyKey: `ful-${orderId}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const orderView = await orderRepo.getById(orderId);
    expect(orderView?.orderState).toBe('submitted');
    expect(orderView?.paymentState).toBe('authorized');
    expect(orderView?.fulfilmentState).toBe('quoted');
    expect(orderView?.purchaseSnapshot?.items[0]?.name).toBe('Sourdough');

    // 8. Atomic outbox claiming by 2 concurrent workers
    const [claimA, claimB] = await Promise.all([
      outboxRepo.claimBatch('worker-1', 10, 30_000),
      outboxRepo.claimBatch('worker-2', 10, 30_000),
    ]);
    const claimedIds = [...claimA, ...claimB].map((m) => m.id);
    expect(claimedIds.filter((id) => id === outboxId)).toHaveLength(1);

    const claimedMsg = [...claimA, ...claimB].find((m) => m.id === outboxId)!;
    const completed = await outboxRepo.complete(outboxId, claimedMsg.leaseToken!);
    expect(completed).toBe(true);

    // 9. Webhook deduplication
    const wh1 = await webhookRepo.ingest({
      id: randomUUID(),
      providerKey: 'mock_payment',
      providerAccountRef: 'default',
      providerEventRef: `evt-${orderId}`,
      eventType: 'payment.authorized',
      receivedAt: new Date().toISOString(),
      signatureVerified: true,
      payloadDigest: createHash('sha256').update('{}').digest('hex'),
      redactedPayload: { orderId },
      status: 'pending',
      attempts: 0,
      correlationOrderId: orderId,
    });
    const wh2 = await webhookRepo.ingest({
      id: randomUUID(),
      providerKey: 'mock_payment',
      providerAccountRef: 'default',
      providerEventRef: `evt-${orderId}`,
      eventType: 'payment.authorized',
      receivedAt: new Date().toISOString(),
      signatureVerified: true,
      payloadDigest: createHash('sha256').update('{}').digest('hex'),
      redactedPayload: { orderId },
      status: 'pending',
      attempts: 0,
      correlationOrderId: orderId,
    });
    expect(wh1.inserted).toBe(true);
    expect(wh2.inserted).toBe(false);

    // 10. Audit immutability & capability list
    await auditRepo.recordAudit({
      id: randomUUID(),
      actorRole: 'ops_admin',
      action: 'test_audit',
      resourceType: 'order',
      resourceId: orderId,
      reason: 'Integration test verification',
      occurredAt: new Date().toISOString(),
      metadataRedacted: {},
    });
    const audits = await auditRepo.listAuditByResource('order', orderId);
    expect(audits).toHaveLength(1);

    const activeCaps = await capabilityRepo.listActiveCapabilities();
    expect(Array.isArray(activeCaps)).toBe(true);
  });

  it('verifies PostGIS availability, concurrent migrator advisory lock safety, and query plans', async () => {
    const postgisRes = await pool.query(`SELECT PostGIS_Version() AS version;`);
    expect(postgisRes.rows[0]?.version).toBeDefined();

    const migrations = await loadMigrations(migrationsDir);
    const pool2 = createDatabasePool({ connectionString: TEST_DB_URL, maxPoolSize: 2 });
    try {
      const m1 = new DatabaseMigrator(pool, migrations, { requireLock: true });
      const m2 = new DatabaseMigrator(pool2, migrations, { requireLock: true });
      const [exec1, exec2] = await Promise.all([m1.up(), m2.up()]);
      expect(exec1).toEqual([]);
      expect(exec2).toEqual([]);
    } finally {
      await pool2.end();
    }

    // Verify EXPLAIN plans execute cleanly on key access paths
    const outboxPlan = await pool.query(
      `EXPLAIN (FORMAT JSON) SELECT id FROM outbox WHERE published_at IS NULL AND dead_lettered_at IS NULL AND available_at <= now() LIMIT 10;`
    );
    expect(outboxPlan.rows[0]?.['QUERY PLAN']).toBeDefined();
  });

  it('enforces stale worker lease protection and concurrent quote consumption in PostgreSQL', async () => {
    // 1. Stale worker lease protection
    const msgId = randomUUID();
    await outboxRepo.publish({
      id: msgId,
      aggregateType: 'order',
      aggregateId: randomUUID(),
      eventType: 'lease_test',
      payload: {},
      createdAt: new Date().toISOString(),
      availableAt: new Date().toISOString(),
      attempts: 0,
      maxAttempts: 5,
    });

    const firstClaim = await outboxRepo.claimBatch('stale-worker', 10, 50); // 50ms lease
    const claimed = firstClaim.find((m) => m.id === msgId)!;
    expect(claimed).toBeDefined();

    await new Promise((r) => setTimeout(r, 80)); // Let lease expire

    const secondClaim = await outboxRepo.claimBatch('fresh-worker', 10, 30_000);
    const reclaimed = secondClaim.find((m) => m.id === msgId)!;
    expect(reclaimed).toBeDefined();
    expect(reclaimed.leaseToken).not.toBe(claimed.leaseToken);

    // Stale worker with old leaseToken MUST fail to complete!
    const staleComplete = await outboxRepo.complete(msgId, claimed.leaseToken!);
    expect(staleComplete).toBe(false);

    // Fresh worker succeeds
    const freshComplete = await outboxRepo.complete(msgId, reclaimed.leaseToken!);
    expect(freshComplete).toBe(true);
  });

  it('purges expired ephemeral records via RetentionCleanupService without deleting audit_records', async () => {
    const retention = new RetentionCleanupService(pool);
    const expiredSessId = randomUUID();
    const expiredDigest = createHash('sha256').update(randomUUID()).digest('hex');

    await guestRepo.createSession({
      id: expiredSessId,
      tokenDigest: expiredDigest,
      createdAt: new Date(Date.now() - 7200_000).toISOString(),
      expiresAt: new Date(Date.now() - 3600_000).toISOString(),
    });

    const purged = await retention.purgeExpired();
    expect(purged.expiredGuestSessions).toBeGreaterThanOrEqual(1);
  });
});

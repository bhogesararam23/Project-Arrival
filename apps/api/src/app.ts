import Fastify, { type FastifyInstance } from 'fastify';
import { errorHandler } from './middleware/error-handler.js';
import { registerIdempotencyResponseHook } from './middleware/idempotency.js';
import { healthRoutes } from './routes/health.js';
import { guestSessionRoutes } from './routes/guest-sessions.js';
import { placesRoutes } from './routes/places.js';
import { catalogueRoutes } from './routes/catalogues.js';
import { quotesRoutes } from './routes/quotes.js';
import { ordersRoutes } from './routes/orders.js';
import { webhooksRoutes } from './routes/webhooks.js';
import { operationsRoutes } from './routes/operations.js';

import type {
  IPlacesRepository,
  ICatalogueRepository,
  IQuotesRepository,
  IOrderRepository,
  IGuestSessionRepository,
  ICapabilityRepository,
  IIdempotencyRepository,
  IOutboxRepository,
  IPaymentRepository,
  IFulfilmentRepository,
  IWebhookInboxRepository,
  IAuditRepository,
} from './repositories/interfaces.js';

import {
  InMemoryPlacesRepository,
  InMemoryCatalogueRepository,
  InMemoryQuotesRepository,
  InMemoryOrderRepository,
  InMemoryGuestSessionRepository,
  InMemoryCapabilityRepository,
  InMemoryIdempotencyRepository,
  InMemoryOutboxRepository,
  InMemoryPaymentRepository,
  InMemoryFulfilmentRepository,
  InMemoryWebhookInboxRepository,
  InMemoryAuditRepository,
} from './repositories/in-memory.js';

import {
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
} from '@arrival/database';

import {
  MockMerchantPosAdapter,
  MockPaymentAdapter,
  MockFulfilmentAdapter,
  type IMerchantPosAdapter,
  type IPaymentAdapter,
  type IFulfilmentAdapter,
} from './adapters/provider-adapters.js';

import { DiscoveryService } from './services/discovery-service.js';
import { CatalogueService } from './services/catalogue-service.js';
import { QuoteService } from './services/quote-service.js';
import { OrderService } from './services/order-service.js';
import {
  WebhookService,
  HmacSha256TestWebhookVerifier,
  type WebhookSignatureVerifier,
} from './services/webhook-service.js';
import { OperationsService } from './services/operations-service.js';
import {
  StaticMapOperatorVerifier,
  type IOperatorTokenVerifier,
} from './middleware/ops-auth.js';

export interface BuildAppOptions {
  pgPool?: DatabasePool;
  placesRepo?: IPlacesRepository;
  catalogueRepo?: ICatalogueRepository;
  quotesRepo?: IQuotesRepository;
  orderRepo?: IOrderRepository;
  guestRepo?: IGuestSessionRepository;
  capabilityRepo?: ICapabilityRepository;
  idempotencyRepo?: IIdempotencyRepository;
  outboxRepo?: IOutboxRepository;
  paymentRepo?: IPaymentRepository;
  fulfilmentRepo?: IFulfilmentRepository;
  webhookRepo?: IWebhookInboxRepository;
  auditRepo?: IAuditRepository;
  posAdapter?: IMerchantPosAdapter;
  paymentAdapter?: IPaymentAdapter;
  fulfilmentAdapter?: IFulfilmentAdapter;
  webhookVerifier?: WebhookSignatureVerifier;
  operatorVerifier?: IOperatorTokenVerifier;
}

export function buildApp(opts?: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: false,
  });

  const pool = opts?.pgPool;

  // Core shared in-memory instances when pool is absent
  const sharedInMemOutbox = opts?.outboxRepo || (!pool ? new InMemoryOutboxRepository() : undefined);
  const sharedInMemQuotes = opts?.quotesRepo || (!pool ? new InMemoryQuotesRepository() : undefined);
  const sharedInMemGuest = opts?.guestRepo || (!pool ? new InMemoryGuestSessionRepository() : undefined);
  const sharedInMemOrder =
    opts?.orderRepo ||
    (!pool
      ? new InMemoryOrderRepository(sharedInMemQuotes, sharedInMemOutbox, sharedInMemGuest)
      : undefined);

  const placesRepo: IPlacesRepository =
    opts?.placesRepo || (pool ? new PgPlacesRepository(pool) : new InMemoryPlacesRepository());
  const catalogueRepo: ICatalogueRepository =
    opts?.catalogueRepo || (pool ? new PgCatalogueRepository(pool) : new InMemoryCatalogueRepository());
  const quotesRepo: IQuotesRepository = sharedInMemQuotes || new PgQuotesRepository(pool!);
  const orderRepo: IOrderRepository = sharedInMemOrder || new PgOrderRepository(pool!);
  const guestRepo: IGuestSessionRepository = sharedInMemGuest || new PgGuestSessionRepository(pool!);
  const capabilityRepo: ICapabilityRepository =
    opts?.capabilityRepo || (pool ? new PgCapabilityRepository(pool) : new InMemoryCapabilityRepository());
  const idempotencyRepo: IIdempotencyRepository =
    opts?.idempotencyRepo || (pool ? new PgIdempotencyRepository(pool) : new InMemoryIdempotencyRepository());
  const outboxRepo: IOutboxRepository = sharedInMemOutbox || new PgOutboxRepository(pool!);

  const inMemOrderForSync = sharedInMemOrder instanceof InMemoryOrderRepository ? sharedInMemOrder : undefined;
  const paymentRepo: IPaymentRepository =
    opts?.paymentRepo || (pool ? new PgPaymentRepository(pool) : new InMemoryPaymentRepository(inMemOrderForSync));
  const fulfilmentRepo: IFulfilmentRepository =
    opts?.fulfilmentRepo ||
    (pool ? new PgFulfilmentRepository(pool) : new InMemoryFulfilmentRepository(inMemOrderForSync));
  const webhookRepo: IWebhookInboxRepository =
    opts?.webhookRepo || (pool ? new PgWebhookInboxRepository(pool) : new InMemoryWebhookInboxRepository());
  const auditRepo: IAuditRepository =
    opts?.auditRepo || (pool ? new PgAuditRepository(pool) : new InMemoryAuditRepository());

  // Adapters
  const posAdapter = opts?.posAdapter || new MockMerchantPosAdapter();
  const paymentAdapter = opts?.paymentAdapter || new MockPaymentAdapter();
  const fulfilmentAdapter = opts?.fulfilmentAdapter || new MockFulfilmentAdapter();

  // Services
  const discoveryService = new DiscoveryService(placesRepo);
  const catalogueService = new CatalogueService(catalogueRepo);
  const quoteService = new QuoteService(placesRepo, catalogueRepo, quotesRepo, capabilityRepo, fulfilmentAdapter);
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

  const webhookVerifier =
    opts?.webhookVerifier || new HmacSha256TestWebhookVerifier({});
  const webhookService = new WebhookService(
    webhookRepo,
    webhookVerifier,
    orderRepo,
    paymentRepo,
    fulfilmentRepo
  );

  const operationsService = new OperationsService(
    orderRepo,
    paymentRepo,
    fulfilmentRepo,
    outboxRepo,
    webhookRepo,
    capabilityRepo,
    auditRepo
  );
  const operatorVerifier = opts?.operatorVerifier || new StaticMapOperatorVerifier([]);

  // Set RFC 9457 Error Handler
  app.setErrorHandler(errorHandler);

  // Register Idempotency Response Hook
  registerIdempotencyResponseHook(app, idempotencyRepo);

  // Register Routes
  app.register(healthRoutes, { pgPool: pool });
  app.register(guestSessionRoutes, { guestRepo });
  app.register(placesRoutes, { discoveryService });
  app.register(catalogueRoutes, { catalogueService });
  app.register(quotesRoutes, { quoteService, idempotencyRepo, guestRepo });
  app.register(ordersRoutes, { orderService, idempotencyRepo, guestRepo });
  app.register(webhooksRoutes, { webhookService });
  app.register(operationsRoutes, { operationsService, operatorVerifier });

  return app;
}

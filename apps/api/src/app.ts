import Fastify, { type FastifyInstance } from 'fastify';
import { errorHandler } from './middleware/error-handler.js';
import { registerIdempotencyResponseHook } from './middleware/idempotency.js';
import { healthRoutes } from './routes/health.js';
import { guestSessionRoutes } from './routes/guest-sessions.js';
import { placesRoutes } from './routes/places.js';
import { catalogueRoutes } from './routes/catalogues.js';
import { quotesRoutes } from './routes/quotes.js';
import { ordersRoutes } from './routes/orders.js';

import type {
  IPlacesRepository,
  ICatalogueRepository,
  IQuotesRepository,
  IOrderRepository,
  IGuestSessionRepository,
  ICapabilityRepository,
  IIdempotencyRepository,
  IOutboxRepository,
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
  type DatabasePool,
} from '@arrival/database';

import {
  MockMerchantPosAdapter,
  MockPaymentAdapter,
  MockFulfilmentAdapter,
} from './adapters/provider-adapters.js';

import { DiscoveryService } from './services/discovery-service.js';
import { CatalogueService } from './services/catalogue-service.js';
import { QuoteService } from './services/quote-service.js';
import { OrderService } from './services/order-service.js';

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
}

export function buildApp(opts?: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: false, // We use our structured logger in middleware
  });

  const pool = opts?.pgPool;

  // Repositories: use PostgreSQL if pool is provided, otherwise in-memory test doubles
  const placesRepo: IPlacesRepository =
    opts?.placesRepo || (pool ? new PgPlacesRepository(pool) : new InMemoryPlacesRepository());
  const catalogueRepo: ICatalogueRepository =
    opts?.catalogueRepo || (pool ? new PgCatalogueRepository(pool) : new InMemoryCatalogueRepository());
  const quotesRepo: IQuotesRepository =
    opts?.quotesRepo || (pool ? new PgQuotesRepository(pool) : new InMemoryQuotesRepository());
  const orderRepo: IOrderRepository =
    opts?.orderRepo || (pool ? new PgOrderRepository(pool) : new InMemoryOrderRepository());
  const guestRepo: IGuestSessionRepository =
    opts?.guestRepo || (pool ? new PgGuestSessionRepository(pool) : new InMemoryGuestSessionRepository());
  const capabilityRepo: ICapabilityRepository =
    opts?.capabilityRepo || (pool ? new PgCapabilityRepository(pool) : new InMemoryCapabilityRepository());
  const idempotencyRepo: IIdempotencyRepository =
    opts?.idempotencyRepo || (pool ? new PgIdempotencyRepository(pool) : new InMemoryIdempotencyRepository());
  const outboxRepo: IOutboxRepository =
    opts?.outboxRepo || (pool ? new PgOutboxRepository(pool) : new InMemoryOutboxRepository());

  // Adapters
  const posAdapter = new MockMerchantPosAdapter();
  const paymentAdapter = new MockPaymentAdapter();
  const fulfilmentAdapter = new MockFulfilmentAdapter();

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
    outboxRepo
  );

  // Set RFC 9457 Error Handler
  app.setErrorHandler(errorHandler);

  // Register Idempotency Response Hook
  registerIdempotencyResponseHook(app, idempotencyRepo);

  // Register Routes
  app.register(healthRoutes);
  app.register(guestSessionRoutes, { guestRepo });
  app.register(placesRoutes, { discoveryService });
  app.register(catalogueRoutes, { catalogueService });
  app.register(quotesRoutes, { quoteService, idempotencyRepo, guestRepo });
  app.register(ordersRoutes, { orderService, idempotencyRepo, guestRepo });

  return app;
}

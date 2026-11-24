import Fastify, { type FastifyInstance } from 'fastify';
import { errorHandler } from './middleware/error-handler.js';
import { registerIdempotencyResponseHook } from './middleware/idempotency.js';
import { healthRoutes } from './routes/health.js';
import { guestSessionRoutes } from './routes/guest-sessions.js';
import { placesRoutes } from './routes/places.js';
import { catalogueRoutes } from './routes/catalogues.js';
import { quotesRoutes } from './routes/quotes.js';
import { ordersRoutes } from './routes/orders.js';

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
  MockMerchantPosAdapter,
  MockPaymentAdapter,
  MockFulfilmentAdapter,
} from './adapters/provider-adapters.js';

import { DiscoveryService } from './services/discovery-service.js';
import { CatalogueService } from './services/catalogue-service.js';
import { QuoteService } from './services/quote-service.js';
import { OrderService } from './services/order-service.js';

export interface BuildAppOptions {
  placesRepo?: InMemoryPlacesRepository;
  catalogueRepo?: InMemoryCatalogueRepository;
  quotesRepo?: InMemoryQuotesRepository;
  orderRepo?: InMemoryOrderRepository;
  guestRepo?: InMemoryGuestSessionRepository;
  capabilityRepo?: InMemoryCapabilityRepository;
  idempotencyRepo?: InMemoryIdempotencyRepository;
  outboxRepo?: InMemoryOutboxRepository;
}

export function buildApp(opts?: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: false, // We use our structured logger in middleware
  });

  // Repositories
  const placesRepo = opts?.placesRepo || new InMemoryPlacesRepository();
  const catalogueRepo = opts?.catalogueRepo || new InMemoryCatalogueRepository();
  const quotesRepo = opts?.quotesRepo || new InMemoryQuotesRepository();
  const orderRepo = opts?.orderRepo || new InMemoryOrderRepository();
  const guestRepo = opts?.guestRepo || new InMemoryGuestSessionRepository();
  const capabilityRepo = opts?.capabilityRepo || new InMemoryCapabilityRepository();
  const idempotencyRepo = opts?.idempotencyRepo || new InMemoryIdempotencyRepository();

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
    paymentAdapter
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

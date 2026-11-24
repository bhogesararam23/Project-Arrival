import type {
  Venue,
  MerchantLocation,
  SearchQuery,
  Catalogue,
  Quote,
  OrderView,
  OrderCreated,
  OrderEventItem,
  GuestSessionRecord,
  GuestOrderGrantRecord,
  ProviderCapability,
  IdempotencyRecord,
  OutboxMessage,
  OrderState,
} from '@arrival/contracts';

export interface IPlacesRepository {
  search(query: SearchQuery): Promise<{ venues: Venue[]; locations: MerchantLocation[]; nextCursor?: string | undefined }>;
  getLocation(id: string): Promise<MerchantLocation | null>;
  getVenue(id: string): Promise<Venue | null>;
}

export interface ICatalogueRepository {
  getCatalogueByLocation(locationId: string): Promise<Catalogue | null>;
  getCatalogueByLocationAndVersion(locationId: string, version: number): Promise<Catalogue | null>;
}

export interface IQuotesRepository {
  save(quote: Quote, metadata: { locationId: string; destinationCountry: string; items: any[]; guestSessionId?: string | undefined }): Promise<void>;
  getById(quoteId: string): Promise<{ quote: Quote; locationId: string; destinationCountry: string; items: any[]; consumedAt?: string | undefined } | null>;
  markConsumed(quoteId: string): Promise<void>;
}

export interface IOrderRepository {
  createOrder(order: OrderCreated, quote: Quote, outboxPayload: unknown): Promise<void>;
  getById(orderId: string): Promise<OrderView | null>;
  getEvents(orderId: string): Promise<OrderEventItem[]>;
  recordEvent(orderId: string, event: OrderEventItem): Promise<void>;
  updateState(orderId: string, newState: OrderState): Promise<void>;
}

export interface IGuestSessionRepository {
  createSession(record: GuestSessionRecord): Promise<void>;
  getSessionByDigest(digest: string): Promise<GuestSessionRecord | null>;
  createOrderGrant(grant: GuestOrderGrantRecord): Promise<void>;
  getOrderGrantByDigest(digest: string): Promise<GuestOrderGrantRecord | null>;
}

export interface ICapabilityRepository {
  getCapability(providerKey: string, capability: string, countryCode: string, locationId?: string): Promise<ProviderCapability | null>;
  listActiveCapabilities(): Promise<ProviderCapability[]>;
}

export interface IIdempotencyRepository {
  get(principalScope: string, operation: string, key: string): Promise<IdempotencyRecord | null>;
  save(record: IdempotencyRecord): Promise<void>;
}

export interface IOutboxRepository {
  publish(message: OutboxMessage): Promise<void>;
  fetchPending(limit: number): Promise<OutboxMessage[]>;
}

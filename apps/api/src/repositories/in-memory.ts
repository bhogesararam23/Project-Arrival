import { randomUUID } from 'node:crypto';
import type {
  Venue,
  MerchantLocation,
  SearchQuery,
  Catalogue,
  Quote,
  QuoteLineSnapshot,
  PricingBreakdown,
  PurchaseSnapshot,
  OrderView,
  OrderCreated,
  OrderEventItem,
  GuestSessionRecord,
  GuestOrderGrantRecord,
  ProviderCapability,
  IdempotencyRecord,
  OutboxMessage,
  WebhookInboxMessage,
  OrderState,
  MerchantOrderState,
  PaymentAttemptRecord,
  PaymentState,
  FulfilmentAttemptRecord,
  FulfilmentState,
  CompensationRecord,
  AuditRecord,
} from '@arrival/contracts';
import { parseCountryCode, parseCurrencyCode, isCapabilityActive } from '@arrival/contracts';
import type {
  IPlacesRepository,
  ICatalogueRepository,
  IQuotesRepository,
  IOrderRepository,
  IPaymentRepository,
  IFulfilmentRepository,
  IGuestSessionRepository,
  ICapabilityRepository,
  IIdempotencyRepository,
  IOutboxRepository,
  IWebhookInboxRepository,
  IAuditRepository,
} from './interfaces.js';

// ============================================================================
// SYNTHETIC FIXTURES (For test & evaluation only; NOT real production vendors)
// ============================================================================

export const FIXTURE_VENUES: Venue[] = [
  {
    id: 'e1000000-0000-4000-a000-000000000001',
    displayName: '[SYNTHETIC TEST FIXTURE] Westminster Artisan Bakery',
    normalizedName: 'westminster artisan bakery',
    listingStatus: 'verified',
    primaryLanguage: 'en',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'e1000000-0000-4000-a000-000000000002',
    displayName: '[SYNTHETIC TEST FIXTURE] Covent Garden Craft Pizzeria',
    normalizedName: 'covent garden craft pizzeria',
    listingStatus: 'verified',
    primaryLanguage: 'en',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'e1000000-0000-4000-a000-000000000003',
    displayName: '[SYNTHETIC TEST FIXTURE] Berlin Mitte Specialty Coffee',
    normalizedName: 'berlin mitte specialty coffee',
    listingStatus: 'verified',
    primaryLanguage: 'de',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

export const FIXTURE_LOCATIONS: MerchantLocation[] = [
  {
    id: 'f1000000-0000-4000-a000-000000000001',
    venueId: 'e1000000-0000-4000-a000-000000000001',
    merchantId: 'm1000000-0000-4000-a000-000000000001',
    displayName: 'Westminster Artisan Bakery - Main St',
    countryCode: parseCountryCode('GB'),
    publicAddress: {
      formattedAddress: '12 Victoria St, Westminster, London SW1H 0EX, UK',
      locality: 'London',
      administrativeArea: 'Greater London',
      postalCode: 'SW1H 0EX',
      countryCode: parseCountryCode('GB'),
    },
    coordinates: {
      latitude: 51.4988,
      longitude: -0.1309,
    },
    timezone: 'Europe/London',
    listingStatus: 'verified',
    orderability: 'native_orderable',
    verifiedAt: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'f1000000-0000-4000-a000-000000000002',
    venueId: 'e1000000-0000-4000-a000-000000000002',
    merchantId: 'm1000000-0000-4000-a000-000000000002',
    displayName: 'Covent Garden Craft Pizzeria - Piazza',
    countryCode: parseCountryCode('GB'),
    publicAddress: {
      formattedAddress: '45 Floral St, Covent Garden, London WC2E 9DG, UK',
      locality: 'London',
      administrativeArea: 'Greater London',
      postalCode: 'WC2E 9DG',
      countryCode: parseCountryCode('GB'),
    },
    coordinates: {
      latitude: 51.5126,
      longitude: -0.1235,
    },
    timezone: 'Europe/London',
    listingStatus: 'verified',
    orderability: 'catalogue_only',
    verifiedAt: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'f1000000-0000-4000-a000-000000000003',
    venueId: 'e1000000-0000-4000-a000-000000000003',
    merchantId: 'm1000000-0000-4000-a000-000000000003',
    displayName: 'Berlin Mitte Specialty Coffee - Torstraße',
    countryCode: parseCountryCode('DE'),
    publicAddress: {
      formattedAddress: 'Torstraße 101, 10119 Berlin, Germany',
      locality: 'Berlin',
      administrativeArea: 'Berlin',
      postalCode: '10119',
      countryCode: parseCountryCode('DE'),
    },
    coordinates: {
      latitude: 52.5295,
      longitude: 13.4012,
    },
    timezone: 'Europe/Berlin',
    listingStatus: 'verified',
    orderability: 'capability_pending',
    verifiedAt: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
  },
];

export const FIXTURE_CATALOGUES: Catalogue[] = [
  {
    id: 'c1000000-0000-4000-a000-000000000001',
    locationId: 'f1000000-0000-4000-a000-000000000001',
    version: 1,
    currency: parseCurrencyCode('GBP'),
    status: 'published',
    publishedAt: '2026-01-01T00:00:00Z',
    items: [
      {
        id: 'i1000000-0000-4000-a000-000000000001',
        name: 'Organic Sourdough Loaf',
        description: 'Naturally fermented 36-hour heritage flour loaf',
        price: { amountMinor: '450', currency: 'GBP' }, // £4.50
        available: true,
        allergens: ['gluten'],
        sortOrder: 1,
        modifierGroups: [
          {
            id: 'mg-slicing',
            name: 'Slicing Preference',
            minimumSelections: 0,
            maximumSelections: 1,
            options: [
              {
                id: 'opt-thick-slice',
                name: 'Thick Sliced',
                priceDelta: { amountMinor: '50', currency: 'GBP' },
                available: true,
              },
              {
                id: 'opt-seeded-crust',
                name: 'Seeded Crust',
                priceDelta: { amountMinor: '75', currency: 'GBP' },
                available: true,
              },
              {
                id: 'opt-gluten-free-crust',
                name: 'Gluten Free Crust',
                priceDelta: { amountMinor: '100', currency: 'GBP' },
                available: false,
              },
            ],
          },
        ],
      },
      {
        id: 'i1000000-0000-4000-a000-000000000002',
        name: 'Almond Croissant',
        description: 'Twice-baked butter croissant with frangipane',
        price: { amountMinor: '380', currency: 'GBP' }, // £3.80
        available: true,
        allergens: ['gluten', 'dairy', 'nuts'],
        sortOrder: 2,
        modifierGroups: [],
      },
    ],
  },
  {
    id: 'c1000000-0000-4000-a000-000000000002',
    locationId: 'f1000000-0000-4000-a000-000000000002',
    version: 1,
    currency: parseCurrencyCode('GBP'),
    status: 'published',
    publishedAt: '2026-01-01T00:00:00Z',
    items: [
      {
        id: 'i1000000-0000-4000-a000-000000000003',
        name: 'Margherita Verace',
        description: 'San Marzano tomatoes, Fior di Latte, fresh basil',
        price: { amountMinor: '1150', currency: 'GBP' }, // £11.50
        available: true,
        allergens: ['gluten', 'dairy'],
        sortOrder: 1,
        modifierGroups: [],
      },
    ],
  },
];

export const FIXTURE_CAPABILITIES: ProviderCapability[] = [
  {
    id: 'cap-001',
    providerKey: 'mock_pos',
    providerAccountRef: 'sandbox-account-uk',
    capability: 'order_create',
    countryCode: parseCountryCode('GB'),
    merchantId: 'm1000000-0000-4000-a000-000000000001',
    locationId: 'f1000000-0000-4000-a000-000000000001',
    currency: parseCurrencyCode('GBP'),
    status: 'sandbox_verified',
    evidenceUrl: 'synthetic://sandbox/mock-pos-uk',
    reviewedBy: 'system_fixture',
    reviewedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cap-002',
    providerKey: 'mock_payment',
    providerAccountRef: 'sandbox-pay-uk',
    capability: 'charge_collect',
    countryCode: parseCountryCode('GB'),
    currency: parseCurrencyCode('GBP'),
    status: 'sandbox_verified',
    evidenceUrl: 'synthetic://sandbox/mock-payment-uk',
    reviewedBy: 'system_fixture',
    reviewedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cap-003',
    providerKey: 'mock_delivery',
    providerAccountRef: 'sandbox-del-uk',
    capability: 'delivery_quote_and_dispatch',
    countryCode: parseCountryCode('GB'),
    currency: parseCurrencyCode('GBP'),
    status: 'sandbox_verified',
    evidenceUrl: 'synthetic://sandbox/mock-delivery-uk',
    reviewedBy: 'system_fixture',
    reviewedAt: '2026-01-01T00:00:00Z',
  },
];

/**
 * TEST-ONLY synthetic capability fixture for controlled E2E / integration tests.
 * Never represents real commercial approval or live production readiness.
 */
export const SYNTHETIC_TEST_CAPABILITIES: ProviderCapability[] = FIXTURE_CAPABILITIES.map((c) => ({
  ...c,
  status: 'production_verified' as const,
  evidenceUrl: `synthetic-test-only://${c.providerKey}/${c.countryCode}`,
}));

// Calculate Haversine distance in meters
function computeHaversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export class InMemoryPlacesRepository implements IPlacesRepository {
  constructor(
    private readonly venues: Venue[] = [...FIXTURE_VENUES],
    private readonly locations: MerchantLocation[] = [...FIXTURE_LOCATIONS]
  ) {}

  async search(query: SearchQuery): Promise<{ venues: Venue[]; locations: MerchantLocation[]; nextCursor?: string }> {
    const qLower = query.q.toLowerCase().trim();
    const matchedVenues = this.venues.filter((v) => {
      if (v.listingStatus !== 'verified') return false;
      return v.normalizedName.includes(qLower) || v.displayName.toLowerCase().includes(qLower);
    });

    const venueIds = new Set(matchedVenues.map((v) => v.id));
    let matchedLocations = this.locations.filter((l) => venueIds.has(l.venueId) && l.listingStatus === 'verified');

    if (query.country) {
      matchedLocations = matchedLocations.filter((l) => l.countryCode === query.country?.toUpperCase());
    }

    if (query.lat !== undefined && query.lon !== undefined) {
      matchedLocations = matchedLocations
        .map((loc) => ({
          loc,
          dist: computeHaversineMeters(query.lat!, query.lon!, loc.coordinates.latitude, loc.coordinates.longitude),
        }))
        .filter(({ dist }) => (query.radiusMeters ? dist <= query.radiusMeters : true))
        .sort((a, b) => a.dist - b.dist)
        .map(({ loc }) => loc);
    }

    const limit = query.limit || 20;
    const paginatedLocations = matchedLocations.slice(0, limit);
    const paginatedVenues = matchedVenues.filter((v) => paginatedLocations.some((l) => l.venueId === v.id));

    return {
      venues: paginatedVenues,
      locations: paginatedLocations,
      ...(matchedLocations.length > limit ? { nextCursor: 'cursor-end' } : {}),
    };
  }

  async getLocation(id: string): Promise<MerchantLocation | null> {
    return this.locations.find((l) => l.id === id) || null;
  }

  async getVenue(id: string): Promise<Venue | null> {
    return this.venues.find((v) => v.id === id) || null;
  }
}

export class InMemoryCatalogueRepository implements ICatalogueRepository {
  constructor(private readonly catalogues: Catalogue[] = [...FIXTURE_CATALOGUES]) {}

  async getCatalogueByLocation(locationId: string): Promise<Catalogue | null> {
    return this.catalogues.find((c) => c.locationId === locationId && c.status === 'published') || null;
  }

  async getCatalogueByLocationAndVersion(locationId: string, version: number): Promise<Catalogue | null> {
    return this.catalogues.find((c) => c.locationId === locationId && c.version === version) || null;
  }
}

export class InMemoryQuotesRepository implements IQuotesRepository {
  private readonly quotes = new Map<
    string,
    {
      quote: Quote;
      locationId: string;
      destinationCountry: string;
      items: QuoteLineSnapshot[];
      guestSessionId?: string | undefined;
      customerId?: string | undefined;
      deliveryAddressFormatted?: string | undefined;
      pricingBreakdown?: PricingBreakdown | undefined;
      consumedAt?: string | undefined;
    }
  >();

  async save(
    quote: Quote,
    metadata: {
      locationId: string;
      destinationCountry: string;
      items: QuoteLineSnapshot[];
      guestSessionId?: string | undefined;
      customerId?: string | undefined;
      deliveryAddressFormatted?: string | undefined;
      pricingBreakdown?: PricingBreakdown | undefined;
    }
  ): Promise<void> {
    this.quotes.set(quote.quoteId, { quote, ...metadata });
  }

  async getById(quoteId: string) {
    return this.quotes.get(quoteId) || null;
  }

  async markConsumed(quoteId: string): Promise<boolean> {
    const existing = this.quotes.get(quoteId);
    if (!existing || existing.consumedAt || new Date(existing.quote.expiresAt).getTime() <= Date.now()) {
      return false;
    }
    existing.consumedAt = new Date().toISOString();
    return true;
  }
}

export class InMemoryOrderRepository implements IOrderRepository {
  private readonly orders = new Map<string, OrderCreated>();
  private readonly events = new Map<string, OrderEventItem[]>();

  constructor(
    private readonly quotesRepo?: IQuotesRepository,
    private readonly outboxRepo?: IOutboxRepository,
    private readonly guestRepo?: IGuestSessionRepository
  ) {}

  async createOrder(params: {
    order: OrderCreated;
    quote: Quote;
    locationId: string;
    purchaseSnapshot: PurchaseSnapshot;
    items: QuoteLineSnapshot[];
    guestSessionId?: string | undefined;
    customerId?: string | undefined;
    idempotencyRecordId: string;
    outboxMessages: OutboxMessage[];
    guestGrants?: GuestOrderGrantRecord[] | undefined;
  }): Promise<{ quoteConsumed: boolean }> {
    if (this.quotesRepo) {
      const consumed = await this.quotesRepo.markConsumed(params.quote.quoteId);
      if (!consumed) {
        return { quoteConsumed: false };
      }
    }

    const storedOrder: OrderCreated = {
      ...params.order,
      purchaseSnapshot: params.purchaseSnapshot,
    };
    this.orders.set(params.order.orderId, storedOrder);
    this.events.set(params.order.orderId, [
      {
        eventType: 'order_submitted',
        occurredAt: params.order.updatedAt,
        message: 'Order submitted and queued for orchestration',
        source: 'arrival_api',
      },
    ]);

    if (this.guestRepo && params.guestGrants) {
      for (const grant of params.guestGrants) {
        await this.guestRepo.createOrderGrant(grant);
      }
    }

    if (this.outboxRepo) {
      for (const msg of params.outboxMessages) {
        await this.outboxRepo.publish(msg);
      }
    }

    return { quoteConsumed: true };
  }

  async getById(orderId: string): Promise<OrderView | null> {
    const order = this.orders.get(orderId);
    if (!order) return null;
    return {
      orderId: order.orderId,
      orderState: order.orderState,
      paymentState: order.paymentState,
      fulfilmentState: order.fulfilmentState,
      ...(order.merchantOrderState !== undefined ? { merchantOrderState: order.merchantOrderState } : {}),
      updatedAt: order.updatedAt,
      ...(order.purchaseSnapshot ? { purchaseSnapshot: order.purchaseSnapshot } : {}),
    };
  }

  async getEvents(orderId: string): Promise<OrderEventItem[]> {
    return this.events.get(orderId) || [];
  }

  async recordEvent(
    orderId: string,
    event: OrderEventItem & { fromState?: OrderState; toState?: OrderState }
  ): Promise<void> {
    const list = this.events.get(orderId) || [];
    list.push({
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      source: event.source,
      ...(event.message ? { message: event.message } : {}),
    });
    this.events.set(orderId, list);
  }

  async updateState(orderId: string, newState: OrderState, expectedFromState?: OrderState): Promise<boolean> {
    const existing = this.orders.get(orderId);
    if (!existing) return false;
    if (expectedFromState && existing.orderState !== expectedFromState) {
      return false;
    }
    existing.orderState = newState;
    existing.updatedAt = new Date().toISOString();
    return true;
  }

  async updateMerchantOrderState(
    orderId: string,
    newState: MerchantOrderState,
    _providerPosRef?: string
  ): Promise<void> {
    const existing = this.orders.get(orderId);
    if (existing) {
      existing.merchantOrderState = newState;
      existing.updatedAt = new Date().toISOString();
    }
  }

  async syncPaymentState(orderId: string, state: PaymentState): Promise<void> {
    const existing = this.orders.get(orderId);
    if (existing) {
      existing.paymentState = state;
      existing.updatedAt = new Date().toISOString();
    }
  }

  async syncFulfilmentState(orderId: string, state: FulfilmentState): Promise<void> {
    const existing = this.orders.get(orderId);
    if (existing) {
      existing.fulfilmentState = state;
      existing.updatedAt = new Date().toISOString();
    }
  }

  async listOrders(filters?: { state?: OrderState; limit?: number }): Promise<OrderView[]> {
    let items = Array.from(this.orders.values());
    if (filters?.state) {
      items = items.filter((o) => o.orderState === filters.state);
    }
    return items.slice(0, filters?.limit ?? 50).map((o) => ({
      orderId: o.orderId,
      orderState: o.orderState,
      paymentState: o.paymentState,
      fulfilmentState: o.fulfilmentState,
      ...(o.merchantOrderState !== undefined ? { merchantOrderState: o.merchantOrderState } : {}),
      updatedAt: o.updatedAt,
      ...(o.purchaseSnapshot ? { purchaseSnapshot: o.purchaseSnapshot } : {}),
    }));
  }
}

export class InMemoryGuestSessionRepository implements IGuestSessionRepository {
  private readonly sessions = new Map<string, GuestSessionRecord>(); // key: digest
  private readonly grants = new Map<string, GuestOrderGrantRecord>(); // key: digest

  async createSession(record: GuestSessionRecord): Promise<void> {
    this.sessions.set(record.tokenDigest, record);
  }

  async getSessionByDigest(digest: string): Promise<GuestSessionRecord | null> {
    return this.sessions.get(digest) || null;
  }

  async createOrderGrant(grant: GuestOrderGrantRecord): Promise<void> {
    this.grants.set(grant.tokenDigest, grant);
  }

  async getOrderGrantByDigest(digest: string): Promise<GuestOrderGrantRecord | null> {
    return this.grants.get(digest) || null;
  }

  async revokeSession(id: string): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.id === id) {
        session.revokedAt = new Date().toISOString();
        break;
      }
    }
  }

  async revokeOrderGrant(id: string): Promise<void> {
    for (const grant of this.grants.values()) {
      if (grant.id === id) {
        grant.revokedAt = new Date().toISOString();
        break;
      }
    }
  }
}

export class InMemoryCapabilityRepository implements ICapabilityRepository {
  constructor(private readonly capabilities: ProviderCapability[] = FIXTURE_CAPABILITIES.map((c) => ({ ...c }))) {}

  async getCapability(
    providerKey: string,
    capability: string,
    countryCode: string,
    locationId?: string
  ): Promise<ProviderCapability | null> {
    return (
      this.capabilities.find(
        (c) =>
          c.providerKey === providerKey &&
          c.capability === capability &&
          c.countryCode === countryCode &&
          (!locationId || !c.locationId || c.locationId === locationId)
      ) || null
    );
  }

  async listActiveCapabilities(): Promise<ProviderCapability[]> {
    return this.capabilities.filter((c) => isCapabilityActive(c));
  }

  async listAllCapabilities(): Promise<ProviderCapability[]> {
    return [...this.capabilities];
  }

  async suspendCapability(id: string, reason: string): Promise<boolean> {
    const cap = this.capabilities.find((c) => c.id === id);
    if (!cap) return false;
    cap.status = 'suspended';
    cap.revokedAt = new Date().toISOString();
    cap.revocationReason = reason;
    return true;
  }
}

export class InMemoryIdempotencyRepository implements IIdempotencyRepository {
  private readonly records = new Map<string, IdempotencyRecord>();

  private keyOf(scope: string, op: string, key: string): string {
    return `${scope}:${op}:${key}`;
  }

  async get(principalScope: string, operation: string, key: string): Promise<IdempotencyRecord | null> {
    return this.records.get(this.keyOf(principalScope, operation, key)) || null;
  }

  async save(record: IdempotencyRecord): Promise<void> {
    this.records.set(this.keyOf(record.principalScope, record.operation, record.idempotencyKey), record);
  }

  async tryReserve(
    principalScope: string,
    operation: string,
    key: string,
    requestHash: string,
    lockDurationMs: number
  ): Promise<{
    success: boolean;
    record?: IdempotencyRecord;
    conflictReason?: 'mismatch' | 'in_progress';
  }> {
    const k = this.keyOf(principalScope, operation, key);
    const existing = this.records.get(k);
    const now = Date.now();

    if (existing) {
      if (existing.requestHash !== requestHash) {
        return { success: false, conflictReason: 'mismatch', record: existing };
      }

      if (existing.status === 'completed') {
        return { success: true, record: existing };
      }

      if (existing.status === 'pending') {
        const lockExpired = existing.lockedUntil && new Date(existing.lockedUntil).getTime() <= now;
        if (!lockExpired) {
          return { success: false, conflictReason: 'in_progress', record: existing };
        }
        // Lock expired, lease renewed
        existing.lockedUntil = new Date(now + lockDurationMs).toISOString();
        return { success: true, record: existing };
      }

      if (existing.status === 'failed') {
        // Retry failed operation
        existing.status = 'pending';
        existing.lockedUntil = new Date(now + lockDurationMs).toISOString();
        existing.requestHash = requestHash;
        return { success: true, record: existing };
      }
    }

    const newRecord: IdempotencyRecord = {
      id: key,
      principalScope,
      operation,
      idempotencyKey: key,
      requestHash,
      status: 'pending',
      lockedUntil: new Date(now + lockDurationMs).toISOString(),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
    };
    this.records.set(k, newRecord);
    return { success: true, record: newRecord };
  }

  async complete(
    principalScope: string,
    operation: string,
    key: string,
    status: number,
    body: unknown
  ): Promise<void> {
    const k = this.keyOf(principalScope, operation, key);
    const existing = this.records.get(k);
    if (existing) {
      existing.status = 'completed';
      existing.responseStatus = status;
      existing.responseBody = body;
      existing.lockedUntil = null;
    }
  }

  async fail(principalScope: string, operation: string, key: string): Promise<void> {
    const k = this.keyOf(principalScope, operation, key);
    const existing = this.records.get(k);
    if (existing) {
      existing.status = 'failed';
      existing.lockedUntil = null;
    }
  }
}

export class InMemoryOutboxRepository implements IOutboxRepository {
  private readonly messages: OutboxMessage[] = [];

  async publish(message: OutboxMessage): Promise<void> {
    this.messages.push({ ...message, maxAttempts: message.maxAttempts ?? 5 });
  }

  async fetchPending(limit: number): Promise<OutboxMessage[]> {
    const now = Date.now();
    return this.messages
      .filter(
        (m) =>
          !m.publishedAt &&
          !m.deadLetteredAt &&
          new Date(m.availableAt).getTime() <= now &&
          (!m.lockedUntil || new Date(m.lockedUntil).getTime() <= now)
      )
      .slice(0, limit);
  }

  async claimBatch(workerId: string, limit: number, leaseDurationMs: number): Promise<OutboxMessage[]> {
    const now = Date.now();
    const lockUntil = new Date(now + leaseDurationMs).toISOString();
    const claimed: OutboxMessage[] = [];

    for (const msg of this.messages) {
      if (claimed.length >= limit) break;
      if (
        !msg.publishedAt &&
        !msg.deadLetteredAt &&
        new Date(msg.availableAt).getTime() <= now &&
        (!msg.lockedUntil || new Date(msg.lockedUntil).getTime() <= now)
      ) {
        msg.workerId = workerId;
        msg.leaseToken = randomUUID();
        msg.lockedUntil = lockUntil;
        msg.attempts += 1;
        claimed.push({ ...msg });
      }
    }

    return claimed;
  }

  async complete(messageId: string, leaseToken: string): Promise<boolean> {
    const msg = this.messages.find((m) => m.id === messageId && m.leaseToken === leaseToken && !m.publishedAt);
    if (!msg) return false;
    msg.publishedAt = new Date().toISOString();
    msg.lockedUntil = null;
    msg.leaseToken = null;
    return true;
  }

  async scheduleRetry(
    messageId: string,
    leaseToken: string,
    nextAvailableAt: string,
    errorMessage: string
  ): Promise<boolean> {
    const msg = this.messages.find(
      (m) => m.id === messageId && m.leaseToken === leaseToken && !m.publishedAt && !m.deadLetteredAt
    );
    if (!msg) return false;
    msg.availableAt = nextAvailableAt;
    msg.lockedUntil = null;
    msg.leaseToken = null;
    msg.lastError = errorMessage;
    return true;
  }

  async deadLetter(messageId: string, leaseToken: string, errorMessage: string): Promise<boolean> {
    const msg = this.messages.find((m) => m.id === messageId && m.leaseToken === leaseToken && !m.publishedAt);
    if (!msg) return false;
    msg.deadLetteredAt = new Date().toISOString();
    msg.lockedUntil = null;
    msg.leaseToken = null;
    msg.lastError = errorMessage;
    return true;
  }

  async listDeadLetter(limit = 50): Promise<OutboxMessage[]> {
    return this.messages.filter((m) => Boolean(m.deadLetteredAt)).slice(0, limit);
  }

  async replayDeadLetter(messageId: string): Promise<boolean> {
    const msg = this.messages.find((m) => m.id === messageId && Boolean(m.deadLetteredAt) && !m.publishedAt);
    if (!msg) return false;
    msg.deadLetteredAt = null;
    msg.lockedUntil = null;
    msg.leaseToken = null;
    msg.workerId = null;
    msg.attempts = 0;
    msg.availableAt = new Date().toISOString();
    msg.lastError = null;
    return true;
  }

  async getMetrics(): Promise<{ pendingCount: number; deadLetteredCount: number }> {
    return {
      pendingCount: this.messages.filter((m) => !m.publishedAt && !m.deadLetteredAt).length,
      deadLetteredCount: this.messages.filter((m) => Boolean(m.deadLetteredAt)).length,
    };
  }
}

export class InMemoryPaymentRepository implements IPaymentRepository {
  private readonly attempts = new Map<string, PaymentAttemptRecord>();
  private readonly events: Array<{ id: string; paymentAttemptId: string; eventType: string }> = [];

  constructor(private readonly orderRepo?: InMemoryOrderRepository) {}

  async createAttempt(attempt: PaymentAttemptRecord): Promise<void> {
    this.attempts.set(attempt.id, { ...attempt });
    if (this.orderRepo) {
      await this.orderRepo.syncPaymentState(attempt.orderId, attempt.state);
    }
  }

  async updateState(
    attemptId: string,
    newState: PaymentState,
    providerPaymentRef?: string
  ): Promise<PaymentAttemptRecord | null> {
    const attempt = this.attempts.get(attemptId);
    if (!attempt) return null;
    attempt.state = newState;
    if (providerPaymentRef) {
      attempt.providerPaymentRef = providerPaymentRef;
    }
    attempt.updatedAt = new Date().toISOString();
    if (this.orderRepo) {
      await this.orderRepo.syncPaymentState(attempt.orderId, newState);
    }
    return { ...attempt };
  }

  async getLatestByOrderId(orderId: string): Promise<PaymentAttemptRecord | null> {
    const matching = Array.from(this.attempts.values())
      .filter((a) => a.orderId === orderId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return matching[0] ? { ...matching[0] } : null;
  }

  async recordEvent(params: {
    id: string;
    paymentAttemptId: string;
    eventType: string;
  }): Promise<void> {
    this.events.push({ id: params.id, paymentAttemptId: params.paymentAttemptId, eventType: params.eventType });
  }

  async listReconciliationRequired(limit = 50): Promise<PaymentAttemptRecord[]> {
    return Array.from(this.attempts.values())
      .filter((a) => a.state === 'reconciliation_required')
      .slice(0, limit);
  }
}

export class InMemoryFulfilmentRepository implements IFulfilmentRepository {
  private readonly attempts = new Map<string, FulfilmentAttemptRecord>();

  constructor(private readonly orderRepo?: InMemoryOrderRepository) {}

  async createAttempt(attempt: FulfilmentAttemptRecord): Promise<void> {
    this.attempts.set(attempt.id, { ...attempt });
    if (this.orderRepo) {
      await this.orderRepo.syncFulfilmentState(attempt.orderId, attempt.state);
    }
  }

  async updateState(
    attemptId: string,
    newState: FulfilmentState,
    providerDeliveryRef?: string
  ): Promise<FulfilmentAttemptRecord | null> {
    const attempt = this.attempts.get(attemptId);
    if (!attempt) return null;
    attempt.state = newState;
    if (providerDeliveryRef) {
      attempt.providerDeliveryRef = providerDeliveryRef;
    }
    attempt.updatedAt = new Date().toISOString();
    if (this.orderRepo) {
      await this.orderRepo.syncFulfilmentState(attempt.orderId, newState);
    }
    return { ...attempt };
  }

  async getLatestByOrderId(orderId: string): Promise<FulfilmentAttemptRecord | null> {
    const matching = Array.from(this.attempts.values())
      .filter((a) => a.orderId === orderId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return matching[0] ? { ...matching[0] } : null;
  }
}

export class InMemoryWebhookInboxRepository implements IWebhookInboxRepository {
  private readonly messages = new Map<string, WebhookInboxMessage>();

  private keyOf(providerKey: string, accountRef: string, eventRef: string): string {
    return `${providerKey}:${accountRef}:${eventRef}`;
  }

  async ingest(message: WebhookInboxMessage): Promise<{ inserted: boolean; message: WebhookInboxMessage }> {
    const k = this.keyOf(message.providerKey, message.providerAccountRef, message.providerEventRef);
    const existing = this.messages.get(k);
    if (existing) {
      return { inserted: false, message: existing };
    }
    this.messages.set(k, { ...message });
    return { inserted: true, message };
  }

  async getByProviderEvent(
    providerKey: string,
    providerAccountRef: string,
    providerEventRef: string
  ): Promise<WebhookInboxMessage | null> {
    return this.messages.get(this.keyOf(providerKey, providerAccountRef, providerEventRef)) || null;
  }

  async markProcessed(id: string): Promise<void> {
    for (const msg of this.messages.values()) {
      if (msg.id === id) {
        msg.status = 'processed';
        msg.processedAt = new Date().toISOString();
        msg.processingError = null;
        break;
      }
    }
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    for (const msg of this.messages.values()) {
      if (msg.id === id) {
        msg.status = 'failed';
        msg.attempts += 1;
        msg.processingError = errorMessage;
        break;
      }
    }
  }

  async listFailed(limit = 50): Promise<WebhookInboxMessage[]> {
    return Array.from(this.messages.values())
      .filter((m) => m.status === 'failed' || m.status === 'dead_lettered')
      .slice(0, limit);
  }

  async claimPendingBatch(limit = 20): Promise<WebhookInboxMessage[]> {
    const claimed: WebhookInboxMessage[] = [];
    for (const msg of this.messages.values()) {
      if (claimed.length >= limit) break;
      if (msg.status === 'pending' && msg.signatureVerified) {
        msg.status = 'processing';
        msg.attempts += 1;
        claimed.push({ ...msg });
      }
    }
    return claimed;
  }
}

export class InMemoryAuditRepository implements IAuditRepository {
  private readonly audits: AuditRecord[] = [];
  private readonly compensations = new Map<string, CompensationRecord>();

  async recordAudit(record: AuditRecord): Promise<void> {
    this.audits.push({ ...record });
  }

  async listAuditByResource(resourceType: string, resourceId: string, limit = 50): Promise<AuditRecord[]> {
    return this.audits
      .filter((a) => a.resourceType === resourceType && a.resourceId === resourceId)
      .slice(-limit)
      .reverse();
  }

  async createCompensation(record: CompensationRecord): Promise<void> {
    this.compensations.set(record.id, { ...record });
  }

  async updateCompensationState(
    id: string,
    state: CompensationRecord['state'],
    providerRef?: string,
    lastError?: string
  ): Promise<void> {
    const rec = this.compensations.get(id);
    if (rec) {
      rec.state = state;
      if (providerRef) rec.providerRef = providerRef;
      if (lastError !== undefined) rec.lastError = lastError;
      rec.attempts += 1;
      rec.updatedAt = new Date().toISOString();
    }
  }

  async listCompensationsByOrder(orderId: string): Promise<CompensationRecord[]> {
    return Array.from(this.compensations.values()).filter((c) => c.orderId === orderId);
  }
}

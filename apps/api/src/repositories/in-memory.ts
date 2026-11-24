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
import { parseCountryCode, parseCurrencyCode } from '@arrival/contracts';
import type {
  IPlacesRepository,
  ICatalogueRepository,
  IQuotesRepository,
  IOrderRepository,
  IGuestSessionRepository,
  ICapabilityRepository,
  IIdempotencyRepository,
  IOutboxRepository,
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
        modifierGroups: [],
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
    capability: 'order_create',
    countryCode: parseCountryCode('GB'),
    locationId: 'f1000000-0000-4000-a000-000000000001',
    currency: parseCurrencyCode('GBP'),
    status: 'production_verified',
    evidenceUrl: 'https://arrival.internal/audit/pilot-uk-001',
    reviewedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cap-002',
    providerKey: 'mock_payment',
    capability: 'charge_collect',
    countryCode: parseCountryCode('GB'),
    currency: parseCurrencyCode('GBP'),
    status: 'production_verified',
    evidenceUrl: 'https://arrival.internal/audit/pilot-uk-payment',
    reviewedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cap-003',
    providerKey: 'mock_delivery',
    capability: 'delivery_quote_and_dispatch',
    countryCode: parseCountryCode('GB'),
    currency: parseCurrencyCode('GBP'),
    status: 'production_verified',
    evidenceUrl: 'https://arrival.internal/audit/pilot-uk-fulfilment',
    reviewedAt: '2026-01-01T00:00:00Z',
  },
];

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
  private readonly quotes = new Map<string, { quote: Quote; locationId: string; destinationCountry: string; items: any[]; guestSessionId?: string | undefined; consumedAt?: string | undefined }>();

  async save(quote: Quote, metadata: { locationId: string; destinationCountry: string; items: any[]; guestSessionId?: string | undefined }): Promise<void> {
    this.quotes.set(quote.quoteId, { quote, ...metadata });
  }

  async getById(quoteId: string) {
    return this.quotes.get(quoteId) || null;
  }

  async markConsumed(quoteId: string): Promise<void> {
    const existing = this.quotes.get(quoteId);
    if (existing) {
      existing.consumedAt = new Date().toISOString();
    }
  }
}

export class InMemoryOrderRepository implements IOrderRepository {
  private readonly orders = new Map<string, OrderCreated>();
  private readonly events = new Map<string, OrderEventItem[]>();

  async createOrder(order: OrderCreated, _quote: Quote, _outboxPayload: unknown): Promise<void> {
    this.orders.set(order.orderId, order);
    this.events.set(order.orderId, [
      {
        eventType: 'order_submitted',
        occurredAt: order.updatedAt,
        message: 'Order submitted and accepted for processing',
        source: 'arrival_operator',
      },
    ]);
  }

  async getById(orderId: string): Promise<OrderView | null> {
    const order = this.orders.get(orderId);
    if (!order) return null;
    return {
      orderId: order.orderId,
      orderState: order.orderState,
      paymentState: order.paymentState,
      fulfilmentState: order.fulfilmentState,
      updatedAt: order.updatedAt,
    };
  }

  async getEvents(orderId: string): Promise<OrderEventItem[]> {
    return this.events.get(orderId) || [];
  }

  async recordEvent(orderId: string, event: OrderEventItem): Promise<void> {
    const list = this.events.get(orderId) || [];
    list.push(event);
    this.events.set(orderId, list);
  }

  async updateState(orderId: string, newState: OrderState): Promise<void> {
    const existing = this.orders.get(orderId);
    if (existing) {
      existing.orderState = newState;
      existing.updatedAt = new Date().toISOString();
    }
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
  constructor(private readonly capabilities: ProviderCapability[] = [...FIXTURE_CAPABILITIES]) {}

  async getCapability(providerKey: string, capability: string, countryCode: string, locationId?: string): Promise<ProviderCapability | null> {
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
    return this.capabilities.filter((c) => c.status === 'production_verified');
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
    this.messages.push(message);
  }

  async fetchPending(limit: number): Promise<OutboxMessage[]> {
    return this.messages.filter((m) => !m.publishedAt).slice(0, limit);
  }
}

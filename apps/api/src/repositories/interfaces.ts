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
  save(
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
  ): Promise<void>;
  getById(quoteId: string): Promise<{
    quote: Quote;
    locationId: string;
    destinationCountry: string;
    items: QuoteLineSnapshot[];
    guestSessionId?: string | undefined;
    customerId?: string | undefined;
    consumedAt?: string | undefined;
  } | null>;
  markConsumed(quoteId: string): Promise<boolean>;
}

export interface IOrderRepository {
  createOrder(params: {
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
  }): Promise<{ quoteConsumed: boolean }>;
  getById(orderId: string): Promise<OrderView | null>;
  getEvents(orderId: string): Promise<OrderEventItem[]>;
  recordEvent(
    orderId: string,
    event: OrderEventItem & { fromState?: OrderState; toState?: OrderState }
  ): Promise<void>;
  updateState(orderId: string, newState: OrderState, expectedFromState?: OrderState): Promise<boolean>;
  updateMerchantOrderState(
    orderId: string,
    newState: MerchantOrderState,
    providerPosRef?: string
  ): Promise<void>;
  listOrders(filters?: { state?: OrderState; limit?: number }): Promise<OrderView[]>;
}

export interface IPaymentRepository {
  createAttempt(attempt: PaymentAttemptRecord): Promise<void>;
  updateState(
    attemptId: string,
    newState: PaymentState,
    providerPaymentRef?: string
  ): Promise<PaymentAttemptRecord | null>;
  getLatestByOrderId(orderId: string): Promise<PaymentAttemptRecord | null>;
  recordEvent(params: {
    id: string;
    paymentAttemptId: string;
    eventType: string;
    amountMinor?: string;
    providerEventRef?: string;
    redactedPayload?: Record<string, unknown>;
  }): Promise<void>;
  listReconciliationRequired(limit?: number): Promise<PaymentAttemptRecord[]>;
}

export interface IFulfilmentRepository {
  createAttempt(attempt: FulfilmentAttemptRecord): Promise<void>;
  updateState(
    attemptId: string,
    newState: FulfilmentState,
    providerDeliveryRef?: string
  ): Promise<FulfilmentAttemptRecord | null>;
  getLatestByOrderId(orderId: string): Promise<FulfilmentAttemptRecord | null>;
}

export interface IGuestSessionRepository {
  createSession(record: GuestSessionRecord): Promise<void>;
  getSessionByDigest(digest: string): Promise<GuestSessionRecord | null>;
  createOrderGrant(grant: GuestOrderGrantRecord): Promise<void>;
  getOrderGrantByDigest(digest: string): Promise<GuestOrderGrantRecord | null>;
  revokeSession(id: string): Promise<void>;
  revokeOrderGrant(id: string): Promise<void>;
}

export interface ICapabilityRepository {
  getCapability(
    providerKey: string,
    capability: string,
    countryCode: string,
    locationId?: string
  ): Promise<ProviderCapability | null>;
  listActiveCapabilities(): Promise<ProviderCapability[]>;
  listAllCapabilities(): Promise<ProviderCapability[]>;
  suspendCapability(id: string, reason: string): Promise<boolean>;
}

export interface IIdempotencyRepository {
  get(principalScope: string, operation: string, key: string): Promise<IdempotencyRecord | null>;
  save(record: IdempotencyRecord): Promise<void>;
  tryReserve(
    principalScope: string,
    operation: string,
    key: string,
    requestHash: string,
    lockDurationMs: number
  ): Promise<{
    success: boolean;
    record?: IdempotencyRecord;
    conflictReason?: 'mismatch' | 'in_progress';
  }>;
  complete(
    principalScope: string,
    operation: string,
    key: string,
    status: number,
    body: unknown
  ): Promise<void>;
  fail(principalScope: string, operation: string, key: string): Promise<void>;
}

export interface IOutboxRepository {
  publish(message: OutboxMessage): Promise<void>;
  fetchPending(limit: number): Promise<OutboxMessage[]>;
  claimBatch(workerId: string, limit: number, leaseDurationMs: number): Promise<OutboxMessage[]>;
  complete(messageId: string, leaseToken: string): Promise<boolean>;
  scheduleRetry(
    messageId: string,
    leaseToken: string,
    nextAvailableAt: string,
    errorMessage: string
  ): Promise<boolean>;
  deadLetter(messageId: string, leaseToken: string, errorMessage: string): Promise<boolean>;
  listDeadLetter(limit?: number): Promise<OutboxMessage[]>;
  replayDeadLetter(messageId: string): Promise<boolean>;
  getMetrics(): Promise<{ pendingCount: number; deadLetteredCount: number }>;
}

export interface IWebhookInboxRepository {
  ingest(message: WebhookInboxMessage): Promise<{ inserted: boolean; message: WebhookInboxMessage }>;
  getByProviderEvent(
    providerKey: string,
    providerAccountRef: string,
    providerEventRef: string
  ): Promise<WebhookInboxMessage | null>;
  markProcessed(id: string): Promise<void>;
  markFailed(id: string, errorMessage: string): Promise<void>;
  listFailed(limit?: number): Promise<WebhookInboxMessage[]>;
}

export interface IAuditRepository {
  recordAudit(record: AuditRecord): Promise<void>;
  listAuditByResource(resourceType: string, resourceId: string, limit?: number): Promise<AuditRecord[]>;
  createCompensation(record: CompensationRecord): Promise<void>;
  updateCompensationState(
    id: string,
    state: CompensationRecord['state'],
    providerRef?: string,
    lastError?: string
  ): Promise<void>;
  listCompensationsByOrder(orderId: string): Promise<CompensationRecord[]>;
}

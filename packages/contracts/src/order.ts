import type { CountryCode, CurrencyCode } from './iso.js';
import type { MoneyJson } from './money.js';

export type OrderState =
  | 'submitted'
  | 'awaiting_merchant'
  | 'accepted'
  | 'preparing'
  | 'ready_for_pickup'
  | 'completed'
  | 'rejected'
  | 'customer_cancelled'
  | 'merchant_cancelled'
  | 'failed'
  | 'delivery_exception';

export type PaymentState =
  | 'requires_action'
  | 'authorized'
  | 'capture_pending'
  | 'captured'
  | 'failed'
  | 'void_pending'
  | 'voided'
  | 'refund_pending'
  | 'partially_refunded'
  | 'refunded'
  | 'reconciliation_required';

export type FulfilmentState =
  | 'quote_pending'
  | 'quoted'
  | 'requested'
  | 'assignment_pending'
  | 'assigned'
  | 'at_pickup'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'reconciliation_required';

export type MerchantOrderState =
  | 'submission_requested'
  | 'submission_accepted_for_processing'
  | 'merchant_accepted'
  | 'merchant_rejected'
  | 'preparing'
  | 'ready_for_pickup'
  | 'merchant_cancelled'
  | 'submission_timeout'
  | 'unknown_provider_result'
  | 'reconciliation_required';

/**
 * Valid order transitions map.
 */
export const VALID_ORDER_TRANSITIONS: Record<OrderState, readonly OrderState[]> = {
  submitted: ['awaiting_merchant', 'accepted', 'rejected', 'failed', 'customer_cancelled'],
  awaiting_merchant: ['accepted', 'rejected', 'customer_cancelled', 'failed'],
  accepted: ['preparing', 'merchant_cancelled', 'failed'],
  preparing: ['ready_for_pickup', 'merchant_cancelled', 'failed'],
  ready_for_pickup: ['completed', 'delivery_exception', 'failed'],
  completed: [],
  rejected: [],
  customer_cancelled: [],
  merchant_cancelled: [],
  failed: [],
  delivery_exception: ['completed', 'failed', 'merchant_cancelled'],
};

export function canTransitionOrder(from: OrderState, to: OrderState): boolean {
  const allowed = VALID_ORDER_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Valid payment state transitions map.
 */
export const VALID_PAYMENT_TRANSITIONS: Record<PaymentState, readonly PaymentState[]> = {
  requires_action: ['authorized', 'captured', 'failed', 'reconciliation_required'],
  authorized: ['capture_pending', 'captured', 'void_pending', 'voided', 'failed', 'reconciliation_required'],
  capture_pending: ['captured', 'failed', 'reconciliation_required'],
  captured: ['refund_pending', 'partially_refunded', 'refunded', 'reconciliation_required'],
  failed: ['requires_action', 'reconciliation_required'],
  void_pending: ['voided', 'reconciliation_required'],
  voided: [],
  refund_pending: ['partially_refunded', 'refunded', 'reconciliation_required'],
  partially_refunded: ['refund_pending', 'refunded', 'reconciliation_required'],
  refunded: [],
  reconciliation_required: ['authorized', 'captured', 'voided', 'partially_refunded', 'refunded', 'failed'],
};

export function canTransitionPayment(from: PaymentState, to: PaymentState): boolean {
  const allowed = VALID_PAYMENT_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Valid fulfilment state transitions map.
 */
export const VALID_FULFILMENT_TRANSITIONS: Record<FulfilmentState, readonly FulfilmentState[]> = {
  quote_pending: ['quoted', 'failed', 'cancelled', 'reconciliation_required'],
  quoted: ['requested', 'cancelled', 'failed'],
  requested: ['assignment_pending', 'assigned', 'failed', 'cancelled', 'reconciliation_required'],
  assignment_pending: ['assigned', 'failed', 'cancelled', 'reconciliation_required'],
  assigned: ['at_pickup', 'picked_up', 'cancelled', 'failed', 'reconciliation_required'],
  at_pickup: ['picked_up', 'failed', 'reconciliation_required'],
  picked_up: ['in_transit', 'delivered', 'failed', 'reconciliation_required'],
  in_transit: ['delivered', 'failed', 'reconciliation_required'],
  delivered: [],
  failed: ['reconciliation_required'],
  cancelled: [],
  reconciliation_required: ['assigned', 'in_transit', 'delivered', 'cancelled', 'failed'],
};

export function canTransitionFulfilment(from: FulfilmentState, to: FulfilmentState): boolean {
  const allowed = VALID_FULFILMENT_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Valid merchant POS order transitions map.
 */
export const VALID_MERCHANT_ORDER_TRANSITIONS: Record<MerchantOrderState, readonly MerchantOrderState[]> = {
  submission_requested: [
    'submission_accepted_for_processing',
    'merchant_accepted',
    'merchant_rejected',
    'submission_timeout',
    'unknown_provider_result',
    'reconciliation_required',
  ],
  submission_accepted_for_processing: [
    'merchant_accepted',
    'merchant_rejected',
    'merchant_cancelled',
    'submission_timeout',
    'reconciliation_required',
  ],
  merchant_accepted: ['preparing', 'merchant_cancelled', 'reconciliation_required'],
  merchant_rejected: [],
  preparing: ['ready_for_pickup', 'merchant_cancelled', 'reconciliation_required'],
  ready_for_pickup: ['merchant_cancelled', 'reconciliation_required'],
  merchant_cancelled: [],
  submission_timeout: ['reconciliation_required', 'submission_accepted_for_processing', 'merchant_rejected'],
  unknown_provider_result: ['reconciliation_required', 'submission_accepted_for_processing', 'merchant_rejected'],
  reconciliation_required: ['merchant_accepted', 'merchant_rejected', 'merchant_cancelled'],
};

export function canTransitionMerchantOrder(from: MerchantOrderState, to: MerchantOrderState): boolean {
  const allowed = VALID_MERCHANT_ORDER_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export interface ModifierSelectionSnapshot {
  optionId: string;
  optionName: string;
  priceDelta: MoneyJson;
}

export interface QuoteLineSnapshot {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPriceMinor: string;
  totalPriceMinor: string;
  modifierOptionIds?: string[];
  modifiers?: ModifierSelectionSnapshot[];
}

export interface PricingBreakdown {
  currency: CurrencyCode;
  subtotal: MoneyJson;
  tax: MoneyJson;
  taxRateBasisPoints: number;
  taxInclusive: boolean;
  deliveryFee: MoneyJson;
  serviceFee: MoneyJson;
  total: MoneyJson;
}

export interface PurchaseSnapshot {
  quoteId: string;
  locationId: string;
  merchantId?: string;
  locationDisplayName?: string;
  destinationCountry: CountryCode;
  catalogueVersion: number;
  currency: CurrencyCode;
  items: QuoteLineSnapshot[];
  pricing: PricingBreakdown;
  deliveryQuoteRef?: string;
  capturedAt: string;
}

export interface PaymentAttemptRecord {
  id: string;
  orderId: string;
  providerKey: string;
  providerAccountRef: string;
  providerPaymentRef?: string | null;
  state: PaymentState;
  amountMinor: string;
  currency: CurrencyCode;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface FulfilmentAttemptRecord {
  id: string;
  orderId: string;
  providerKey: string;
  providerAccountRef: string;
  providerDeliveryRef?: string | null;
  state: FulfilmentState;
  quoteRef?: string | null;
  quoteExpiresAt?: string | null;
  feeMinor?: string | null;
  currency?: CurrencyCode | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompensationRecord {
  id: string;
  orderId: string;
  operationType: 'payment_refund' | 'payment_void' | 'pos_cancel' | 'fulfilment_cancel' | 'manual_reconciliation';
  state: 'pending' | 'succeeded' | 'failed' | 'reconciliation_required';
  idempotencyKey: string;
  providerRef?: string | null;
  attempts: number;
  lastError?: string | null;
  reason: string;
  createdAt: string;
  updatedAt: string;
}

export type OperatorRole = 'ops_readonly' | 'ops_admin';

export interface AuditRecord {
  id: string;
  actorId?: string | null;
  actorRole: OperatorRole | string;
  action: string;
  resourceType: string;
  resourceId: string;
  reason?: string | null;
  requestId?: string | null;
  occurredAt: string;
  metadataRedacted: Record<string, unknown>;
}

export interface DeliveryAddressInput {
  formattedAddress: string;
  addressLines?: string[];
  locality?: string;
  administrativeArea?: string;
  postalCode?: string;
  recipientName?: string;
  recipientContact?: string;
  deliveryInstructions?: string;
}

export interface QuoteRequest {
  locationId: string;
  catalogueVersion: number;
  destination: {
    countryCode: CountryCode;
    address: DeliveryAddressInput;
  };
  items: Array<{
    menuItemId: string;
    quantity: number;
    modifierOptionIds?: string[];
  }>;
}

export interface Quote {
  quoteId: string;
  currency: CurrencyCode;
  subtotal: MoneyJson;
  tax: MoneyJson;
  delivery: MoneyJson;
  serviceFee?: MoneyJson;
  total: MoneyJson;
  expiresAt: string;
  catalogueVersion: number;
  deliveryQuoteRef?: string;
  taxInclusive?: boolean;
}

export interface CreateOrderRequest {
  quoteId: string;
  paymentMethodToken: string;
}

export interface OrderView {
  orderId: string;
  orderState: OrderState;
  paymentState: PaymentState | null;
  fulfilmentState: FulfilmentState | null;
  merchantOrderState?: MerchantOrderState | null;
  updatedAt: string;
  purchaseSnapshot?: PurchaseSnapshot;
}

export interface OrderCreated extends OrderView {
  guestAccessGrant?: string;
  guestCancelGrant?: string;
}

export interface OrderEventItem {
  eventType: string;
  occurredAt: string;
  message?: string;
  source: 'merchant' | 'fulfilment' | 'payment' | 'arrival_operator' | 'arrival_api';
}

export interface OrderEventsResponse {
  items: OrderEventItem[];
}

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

/**
 * Valid order transitions map.
 */
export const VALID_ORDER_TRANSITIONS: Record<OrderState, readonly OrderState[]> = {
  submitted: ['awaiting_merchant', 'rejected', 'failed', 'customer_cancelled'],
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
  total: MoneyJson;
  expiresAt: string;
  catalogueVersion: number;
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
  updatedAt: string;
}

export interface OrderCreated extends OrderView {
  guestAccessGrant?: string;
  guestCancelGrant?: string;
}

export interface OrderEventItem {
  eventType: string;
  occurredAt: string;
  message?: string;
  source: 'merchant' | 'fulfilment' | 'payment' | 'arrival_operator';
}

export interface OrderEventsResponse {
  items: OrderEventItem[];
}

import { Money, ArrivalError, type CountryCode, type CurrencyCode, type DeliveryAddressInput } from '@arrival/contracts';

export class ProviderTimeoutError extends Error {
  readonly retryable = false; // Financial/order timeouts are uncertain, not blindly retryable
  constructor(
    public readonly providerKey: string,
    public readonly operation: string,
    message = `Provider ${providerKey} timed out during ${operation}`
  ) {
    super(message);
    this.name = 'ProviderTimeoutError';
  }
}

export class ProviderUnavailableError extends Error {
  readonly retryable = true;
  constructor(
    public readonly providerKey: string,
    public readonly operation: string,
    message = `Provider ${providerKey} unavailable during ${operation}`
  ) {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

export interface PosOrderSubmission {
  merchantLocationId: string;
  orderId: string;
  items: Array<{ name: string; quantity: number; priceMinor: bigint }>;
  currency: CurrencyCode;
  idempotencyKey?: string;
}

export interface IMerchantPosAdapter {
  readonly providerKey: string;
  submitOrder(
    submission: PosOrderSubmission
  ): Promise<{ providerRef: string; status: 'accepted_for_processing' | 'rejected' }>;
  cancelOrder(merchantLocationId: string, providerRef: string, reason?: string): Promise<{ confirmed: boolean }>;
  queryOrderStatus?(merchantLocationId: string, orderId: string): Promise<{ status: 'unknown' | 'accepted' | 'rejected' }>;
}

export interface IPaymentAdapter {
  readonly providerKey: string;
  collectPayment(params: {
    paymentMethodToken: string;
    amount: Money;
    orderId: string;
    idempotencyKey: string;
  }): Promise<{ providerRef: string; status: 'authorized' | 'captured' | 'failed' }>;
  capturePayment?(providerRef: string, amount: Money, idempotencyKey: string): Promise<{ status: 'captured' | 'failed' }>;
  voidPayment?(providerRef: string, idempotencyKey: string): Promise<{ status: 'voided' | 'failed' }>;
  refundPayment(providerRef: string, amount: Money, idempotencyKey: string): Promise<{ refundRef: string }>;
  queryPaymentStatus?(orderId: string, idempotencyKey: string): Promise<{ status: 'unknown' | 'authorized' | 'captured' | 'failed'; providerRef?: string }>;
}

export interface DeliveryQuoteParams {
  pickupCoordinates: { latitude: number; longitude: number };
  deliveryCoordinates?: { latitude: number; longitude: number };
  destinationCountry: CountryCode;
  currency: CurrencyCode;
  deliveryAddress?: DeliveryAddressInput;
}

export interface IFulfilmentAdapter {
  readonly providerKey: string;
  quoteDelivery(params: DeliveryQuoteParams): Promise<{
    quoteRef: string;
    fee: Money;
    estimatedMinutes: number;
    expiresAt: string;
    serviceable: boolean;
  }>;
  dispatchDelivery?(params: {
    orderId: string;
    quoteRef: string;
    idempotencyKey: string;
  }): Promise<{ deliveryRef: string; status: 'requested' | 'assignment_pending' }>;
  cancelDelivery?(deliveryRef: string, reason?: string): Promise<{ cancelled: boolean }>;
}

/**
 * Sandboxed Reference POS Adapter (NOT a production merchant integration).
 */
export class MockMerchantPosAdapter implements IMerchantPosAdapter {
  readonly providerKey = 'mock_pos';
  private shouldRejectNext = false;
  private shouldTimeoutNext = false;

  setRejectNext(reject: boolean): void {
    this.shouldRejectNext = reject;
  }

  setTimeoutNext(timeout: boolean): void {
    this.shouldTimeoutNext = timeout;
  }

  async submitOrder(
    submission: PosOrderSubmission
  ): Promise<{ providerRef: string; status: 'accepted_for_processing' | 'rejected' }> {
    if (!submission.items.length) {
      throw ArrivalError.unprocessableEntity('Cannot submit order with zero items');
    }
    if (this.shouldTimeoutNext) {
      this.shouldTimeoutNext = false;
      throw new ProviderTimeoutError(this.providerKey, 'submitOrder');
    }
    if (this.shouldRejectNext) {
      this.shouldRejectNext = false;
      return {
        providerRef: `pos-ref-rejected-${Date.now()}`,
        status: 'rejected',
      };
    }
    return {
      providerRef: `pos-ref-${Date.now()}`,
      status: 'accepted_for_processing',
    };
  }

  async cancelOrder(_merchantLocationId: string, _providerRef: string, _reason?: string): Promise<{ confirmed: boolean }> {
    return { confirmed: true };
  }

  async queryOrderStatus(): Promise<{ status: 'unknown' | 'accepted' | 'rejected' }> {
    return { status: 'unknown' };
  }
}

/**
 * Sandboxed Reference Payment Adapter (NOT a production payment processor).
 */
export class MockPaymentAdapter implements IPaymentAdapter {
  readonly providerKey = 'mock_payment';
  private shouldTimeoutNext = false;

  setTimeoutNext(timeout: boolean): void {
    this.shouldTimeoutNext = timeout;
  }

  async collectPayment(params: {
    paymentMethodToken: string;
    amount: Money;
    orderId: string;
    idempotencyKey: string;
  }): Promise<{ providerRef: string; status: 'authorized' | 'captured' | 'failed' }> {
    if (!params.paymentMethodToken || params.paymentMethodToken.trim() === '') {
      throw ArrivalError.badRequest('Invalid payment method token');
    }
    if (this.shouldTimeoutNext || params.paymentMethodToken === 'tok_timeout') {
      this.shouldTimeoutNext = false;
      throw new ProviderTimeoutError(this.providerKey, 'collectPayment');
    }
    if (params.paymentMethodToken === 'tok_declined') {
      return {
        providerRef: `pay-ref-declined-${Date.now()}`,
        status: 'failed',
      };
    }
    return {
      providerRef: `pay-ref-${Date.now()}`,
      status: 'authorized',
    };
  }

  async capturePayment(_providerRef: string, _amount: Money, _idempotencyKey: string): Promise<{ status: 'captured' | 'failed' }> {
    return { status: 'captured' };
  }

  async voidPayment(_providerRef: string, _idempotencyKey: string): Promise<{ status: 'voided' | 'failed' }> {
    return { status: 'voided' };
  }

  async refundPayment(_providerRef: string, _amount: Money, _idempotencyKey: string): Promise<{ refundRef: string }> {
    return { refundRef: `ref-refund-${Date.now()}` };
  }

  async queryPaymentStatus(): Promise<{ status: 'unknown' | 'authorized' | 'captured' | 'failed' }> {
    return { status: 'unknown' };
  }
}

/**
 * Sandboxed Reference Fulfilment Adapter (NOT a production courier network).
 */
export class MockFulfilmentAdapter implements IFulfilmentAdapter {
  readonly providerKey = 'mock_delivery';

  async quoteDelivery(params: DeliveryQuoteParams): Promise<{
    quoteRef: string;
    fee: Money;
    estimatedMinutes: number;
    expiresAt: string;
    serviceable: boolean;
  }> {
    const fee = new Money(250n, params.currency);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    return {
      quoteRef: `ful-quote-${Date.now()}`,
      fee,
      estimatedMinutes: 30,
      expiresAt,
      serviceable: true,
    };
  }

  async dispatchDelivery(params: { orderId: string; quoteRef: string; idempotencyKey: string }): Promise<{
    deliveryRef: string;
    status: 'requested' | 'assignment_pending';
  }> {
    return {
      deliveryRef: `ful-del-${params.orderId.slice(0, 8)}`,
      status: 'requested',
    };
  }

  async cancelDelivery(): Promise<{ cancelled: boolean }> {
    return { cancelled: true };
  }
}

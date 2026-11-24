import { Money, ArrivalError, type CountryCode, type CurrencyCode, type DeliveryAddressInput } from '@arrival/contracts';

export interface PosOrderSubmission {
  merchantLocationId: string;
  orderId: string;
  items: Array<{ name: string; quantity: number; priceMinor: bigint }>;
  currency: CurrencyCode;
}

export interface IMerchantPosAdapter {
  readonly providerKey: string;
  submitOrder(submission: PosOrderSubmission): Promise<{ providerRef: string; status: 'accepted_for_processing' | 'rejected' }>;
  cancelOrder(merchantLocationId: string, providerRef: string, reason?: string): Promise<{ confirmed: boolean }>;
}

export interface IPaymentAdapter {
  readonly providerKey: string;
  collectPayment(params: {
    paymentMethodToken: string;
    amount: Money;
    orderId: string;
    idempotencyKey: string;
  }): Promise<{ providerRef: string; status: 'authorized' | 'captured' | 'failed' }>;
  refundPayment(providerRef: string, amount: Money, idempotencyKey: string): Promise<{ refundRef: string }>;
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
  quoteDelivery(params: DeliveryQuoteParams): Promise<{ quoteRef: string; fee: Money; estimatedMinutes: number; expiresAt: string }>;
}

/**
 * Sandboxed Reference POS Adapter.
 */
export class MockMerchantPosAdapter implements IMerchantPosAdapter {
  readonly providerKey = 'mock_pos';
  private shouldRejectNext = false;

  setRejectNext(reject: boolean): void {
    this.shouldRejectNext = reject;
  }

  async submitOrder(submission: PosOrderSubmission): Promise<{ providerRef: string; status: 'accepted_for_processing' | 'rejected' }> {
    if (!submission.items.length) {
      throw ArrivalError.unprocessableEntity('Cannot submit order with zero items');
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
}

/**
 * Sandboxed Reference Payment Adapter.
 */
export class MockPaymentAdapter implements IPaymentAdapter {
  readonly providerKey = 'mock_payment';

  async collectPayment(params: {
    paymentMethodToken: string;
    amount: Money;
    orderId: string;
    idempotencyKey: string;
  }): Promise<{ providerRef: string; status: 'authorized' | 'captured' | 'failed' }> {
    if (!params.paymentMethodToken || params.paymentMethodToken.trim() === '') {
      throw ArrivalError.badRequest('Invalid payment method token');
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

  async refundPayment(_providerRef: string, _amount: Money, _idempotencyKey: string): Promise<{ refundRef: string }> {
    return { refundRef: `ref-refund-${Date.now()}` };
  }
}

/**
 * Sandboxed Reference Fulfilment Adapter.
 */
export class MockFulfilmentAdapter implements IFulfilmentAdapter {
  readonly providerKey = 'mock_delivery';

  async quoteDelivery(params: {
    pickupCoordinates: { latitude: number; longitude: number };
    deliveryCoordinates?: { latitude: number; longitude: number };
    destinationCountry: CountryCode;
    currency: CurrencyCode;
  }): Promise<{ quoteRef: string; fee: Money; estimatedMinutes: number; expiresAt: string }> {
    // Deliveries priced in minor units: £2.50 flat pilot fee
    const fee = new Money(250n, params.currency);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    return {
      quoteRef: `ful-quote-${Date.now()}`,
      fee,
      estimatedMinutes: 30,
      expiresAt,
    };
  }
}

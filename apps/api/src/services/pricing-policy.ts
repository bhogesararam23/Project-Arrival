import {
  Money,
  ArrivalError,
  type CountryCode,
  type CurrencyCode,
  type PricingBreakdown,
} from '@arrival/contracts';

export interface MarketPricingRule {
  countryCode: CountryCode;
  currency: CurrencyCode;
  taxRateBasisPoints: number; // e.g. 2000 = 20.00%
  taxInclusive: boolean;
  serviceFeeMinor: bigint;
}

export interface IPricingPolicy {
  getMarketRule(countryCode: CountryCode, currency: CurrencyCode): MarketPricingRule | null;
  calculateTax(subtotal: Money, countryCode: CountryCode, currency: CurrencyCode): Money;
  calculateServiceFee(countryCode: CountryCode, currency: CurrencyCode): Money;
  buildBreakdown(
    subtotal: Money,
    deliveryFee: Money,
    countryCode: CountryCode,
    currency: CurrencyCode
  ): PricingBreakdown;
}

export class DefaultPricingPolicy implements IPricingPolicy {
  private readonly rules = new Map<string, MarketPricingRule>();

  constructor(customRules?: MarketPricingRule[]) {
    const defaults: MarketPricingRule[] = [
      {
        countryCode: 'GB' as CountryCode,
        currency: 'GBP' as CurrencyCode,
        taxRateBasisPoints: 2000, // 20% UK VAT
        taxInclusive: true,
        serviceFeeMinor: 50n, // 50p standard service fee
      },
      {
        countryCode: 'DE' as CountryCode,
        currency: 'EUR' as CurrencyCode,
        taxRateBasisPoints: 1900, // 19% German MwSt
        taxInclusive: true,
        serviceFeeMinor: 50n,
      },
      {
        countryCode: 'FR' as CountryCode,
        currency: 'EUR' as CurrencyCode,
        taxRateBasisPoints: 2000, // 20% French TVA
        taxInclusive: true,
        serviceFeeMinor: 50n,
      },
      {
        countryCode: 'US' as CountryCode,
        currency: 'USD' as CurrencyCode,
        taxRateBasisPoints: 888, // 8.88% illustrative destination sales tax
        taxInclusive: false,
        serviceFeeMinor: 100n, // $1.00
      },
    ];

    const allRules = customRules ?? defaults;
    for (const rule of allRules) {
      this.rules.set(this.keyOf(rule.countryCode, rule.currency), rule);
    }
  }

  private keyOf(country: string, currency: string): string {
    return `${country}:${currency}`;
  }

  getMarketRule(countryCode: CountryCode, currency: CurrencyCode): MarketPricingRule | null {
    return this.rules.get(this.keyOf(countryCode, currency)) || null;
  }

  calculateTax(subtotal: Money, countryCode: CountryCode, currency: CurrencyCode): Money {
    const rule = this.getMarketRule(countryCode, currency);
    if (!rule) {
      throw ArrivalError.unprocessableEntity(
        `Market pricing and tax policy is not configured for destination country ${countryCode} with currency ${currency}`,
        'MARKET_NOT_CONFIGURED'
      );
    }
    return subtotal.multiplyBasisPoints(rule.taxRateBasisPoints);
  }

  calculateServiceFee(countryCode: CountryCode, currency: CurrencyCode): Money {
    const rule = this.getMarketRule(countryCode, currency);
    if (!rule) {
      throw ArrivalError.unprocessableEntity(
        `Market pricing policy is not configured for destination country ${countryCode} with currency ${currency}`,
        'MARKET_NOT_CONFIGURED'
      );
    }
    return new Money(rule.serviceFeeMinor, currency);
  }

  buildBreakdown(
    subtotal: Money,
    deliveryFee: Money,
    countryCode: CountryCode,
    currency: CurrencyCode
  ): PricingBreakdown {
    const rule = this.getMarketRule(countryCode, currency);
    if (!rule) {
      throw ArrivalError.unprocessableEntity(
        `Market pricing policy is not configured for destination country ${countryCode} with currency ${currency}`,
        'MARKET_NOT_CONFIGURED'
      );
    }
    const tax = subtotal.multiplyBasisPoints(rule.taxRateBasisPoints);
    const serviceFee = new Money(rule.serviceFeeMinor, currency);
    const total = subtotal.add(tax).add(deliveryFee).add(serviceFee);

    return {
      currency,
      subtotal: subtotal.toJson(),
      tax: tax.toJson(),
      taxRateBasisPoints: rule.taxRateBasisPoints,
      taxInclusive: rule.taxInclusive,
      deliveryFee: deliveryFee.toJson(),
      serviceFee: serviceFee.toJson(),
      total: total.toJson(),
    };
  }
}

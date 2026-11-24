import { parseCurrencyCode, type CurrencyCode } from './iso.js';

/**
 * Money value object representing monetary amounts in minor units (e.g. pence, cents).
 * Encoded over wire/JSON as string to prevent 64-bit float precision loss.
 */
export interface MoneyJson {
  amountMinor: string;
  currency: string;
}

export class Money {
  readonly amountMinor: bigint;
  readonly currency: CurrencyCode;

  constructor(amountMinor: bigint | number | string, currency: string) {
    const parsedAmount = typeof amountMinor === 'bigint' ? amountMinor : BigInt(amountMinor);
    if (parsedAmount < 0n) {
      throw new Error(`Monetary amount cannot be negative: ${parsedAmount}`);
    }
    this.amountMinor = parsedAmount;
    this.currency = parseCurrencyCode(currency);
  }

  static zero(currency: string): Money {
    return new Money(0n, currency);
  }

  static fromMinor(amountMinor: bigint | number | string, currency: string): Money {
    return new Money(amountMinor, currency);
  }

  static fromJson(json: MoneyJson): Money {
    return new Money(json.amountMinor, json.currency);
  }

  toJson(): MoneyJson {
    return {
      amountMinor: this.amountMinor.toString(),
      currency: this.currency,
    };
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(`Currency mismatch: cannot operate on ${this.currency} and ${other.currency}`);
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinor + other.amountMinor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    if (this.amountMinor < other.amountMinor) {
      throw new Error(`Resulting monetary amount cannot be negative: ${this.amountMinor} - ${other.amountMinor}`);
    }
    return new Money(this.amountMinor - other.amountMinor, this.currency);
  }

  multiply(factor: number): Money {
    if (factor < 0) {
      throw new Error(`Multiplication factor cannot be negative: ${factor}`);
    }
    const scaled = Math.round(Number(this.amountMinor) * factor);
    return new Money(BigInt(scaled), this.currency);
  }

  /**
   * Allocate monetary amounts across integer ratios without rounding loss (e.g. tax allocation, fees).
   * Remainder minor units are distributed to the first parties.
   */
  allocate(ratios: number[]): Money[] {
    if (ratios.length === 0) {
      return [];
    }
    const totalRatio = ratios.reduce((sum, r) => sum + r, 0);
    if (totalRatio <= 0) {
      throw new Error('Total allocation ratio must be positive');
    }

    const totalMinor = this.amountMinor;
    let remainder = totalMinor;
    const results: Money[] = [];

    for (const ratio of ratios) {
      if (ratio < 0) {
        throw new Error('Allocation ratios cannot be negative');
      }
      const share = (totalMinor * BigInt(ratio)) / BigInt(totalRatio);
      results.push(new Money(share, this.currency));
      remainder -= share;
    }

    // Distribute remainder penny by penny to preserve exact sum
    for (let i = 0; remainder > 0n && i < results.length; i++) {
      const current = results[i]!;
      results[i] = new Money(current.amountMinor + 1n, this.currency);
      remainder -= 1n;
    }

    return results;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amountMinor === other.amountMinor;
  }

  format(locale: string = 'en-GB'): string {
    const majorUnits = Number(this.amountMinor) / 100;
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: this.currency,
      }).format(majorUnits);
    } catch {
      return `${this.currency} ${majorUnits.toFixed(2)}`;
    }
  }
}

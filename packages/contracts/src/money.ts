import { parseCurrencyCode, getCurrencyExponent, type CurrencyCode } from './iso.js';

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

  get exponent(): number {
    return getCurrencyExponent(this.currency);
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

  /**
   * Construct Money from major unit amount (e.g. "12.50" GBP -> 1250 minor, "500" JPY -> 500 minor).
   * Exact integer arithmetic avoids float rounding artifacts.
   */
  static fromMajor(major: string | number, currency: string): Money {
    const exp = getCurrencyExponent(currency);
    const str = typeof major === 'number' ? major.toFixed(exp) : major.trim();
    if (exp === 0) {
      const intVal = BigInt(str.split('.')[0] || '0');
      return new Money(intVal, currency);
    }
    const parts = str.split('.');
    const intPart = parts[0] || '0';
    const rawFrac = parts[1] || '';
    const fracPart = rawFrac.padEnd(exp, '0').slice(0, exp);
    const combined = `${intPart}${fracPart}`.replace(/^(-?)0+/, '$1') || '0';
    return new Money(BigInt(combined), currency);
  }

  toJson(): MoneyJson {
    return {
      amountMinor: this.amountMinor.toString(),
      currency: this.currency,
    };
  }

  toMajorString(): string {
    const exp = this.exponent;
    const str = this.amountMinor.toString();
    if (exp === 0) {
      return str;
    }
    const padded = str.padStart(exp + 1, '0');
    const intPart = padded.slice(0, padded.length - exp);
    const fracPart = padded.slice(padded.length - exp);
    return `${intPart}.${fracPart}`;
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

  /**
   * Multiply monetary amount by basis points (1 bp = 0.01% = 1/10000).
   * Uses integer half-up rounding.
   */
  multiplyBasisPoints(basisPoints: bigint | number): Money {
    const bp = typeof basisPoints === 'bigint' ? basisPoints : BigInt(basisPoints);
    if (bp < 0n) {
      throw new Error(`Basis points cannot be negative: ${bp}`);
    }
    const product = this.amountMinor * bp;
    const rounded = (product + 5000n) / 10000n;
    return new Money(rounded, this.currency);
  }

  /**
   * Multiply monetary amount by exact integer ratio (numerator / denominator).
   * Half-up rounding.
   */
  multiplyRatio(numerator: bigint | number, denominator: bigint | number): Money {
    const num = typeof numerator === 'bigint' ? numerator : BigInt(numerator);
    const den = typeof denominator === 'bigint' ? denominator : BigInt(denominator);
    if (den <= 0n) {
      throw new Error('Denominator must be positive');
    }
    if (num < 0n) {
      throw new Error('Numerator cannot be negative');
    }
    const product = this.amountMinor * num;
    const rounded = (product + den / 2n) / den;
    return new Money(rounded, this.currency);
  }

  multiply(factor: number): Money {
    if (factor < 0) {
      throw new Error(`Multiplication factor cannot be negative: ${factor}`);
    }
    const factorBp = BigInt(Math.round(factor * 10000));
    return this.multiplyBasisPoints(factorBp);
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

  static formatJson(json: MoneyJson, locale = 'en-GB'): string {
    return Money.fromJson(json).format(locale);
  }

  format(locale = 'en-GB'): string {
    const exp = this.exponent;
    const majorNumber = Number(this.toMajorString());
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: this.currency,
        minimumFractionDigits: exp,
        maximumFractionDigits: exp,
      }).format(majorNumber);
    } catch {
      return `${this.currency} ${this.toMajorString()}`;
    }
  }
}

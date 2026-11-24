import { describe, it, expect } from 'vitest';
import { Money, getCurrencyExponent } from '../src/index.js';

describe('Money and Currency Exponent Precision Tests', () => {
  it('correctly resolves currency exponents for standard, zero-decimal, and three-decimal currencies', () => {
    expect(getCurrencyExponent('GBP')).toBe(2);
    expect(getCurrencyExponent('USD')).toBe(2);
    expect(getCurrencyExponent('EUR')).toBe(2);

    expect(getCurrencyExponent('JPY')).toBe(0);
    expect(getCurrencyExponent('KRW')).toBe(0);
    expect(getCurrencyExponent('VND')).toBe(0);

    expect(getCurrencyExponent('BHD')).toBe(3);
    expect(getCurrencyExponent('KWD')).toBe(3);
    expect(getCurrencyExponent('OMR')).toBe(3);
  });

  it('constructs and converts major/minor string representations respecting currency exponents', () => {
    // 2-decimal: GBP
    const gbp = Money.fromMajor('12.50', 'GBP');
    expect(gbp.amountMinor).toBe(1250n);
    expect(gbp.toMajorString()).toBe('12.50');

    // 0-decimal: JPY
    const jpy = Money.fromMajor('1500', 'JPY');
    expect(jpy.amountMinor).toBe(1500n);
    expect(jpy.toMajorString()).toBe('1500');

    // 3-decimal: BHD
    const bhd = Money.fromMajor('2.500', 'BHD');
    expect(bhd.amountMinor).toBe(2500n);
    expect(bhd.toMajorString()).toBe('2.500');
  });

  it('performs exact basis points multiplication with half-up rounding', () => {
    // 20% VAT on £12.50 (1250p) = 250p
    const amount = new Money(1250n, 'GBP');
    const vat = amount.multiplyBasisPoints(2000n); // 20.00%
    expect(vat.amountMinor).toBe(250n);

    // Rounding check: 105p at 2000bp = 21p
    const small = new Money(105n, 'GBP');
    expect(small.multiplyBasisPoints(2000n).amountMinor).toBe(21n);

    // Half-up rounding: 102p at 2000bp = 20.4 -> 20p
    const halfDown = new Money(102n, 'GBP');
    expect(halfDown.multiplyBasisPoints(2000n).amountMinor).toBe(20n);

    // Half-up rounding: 103p at 2000bp = 20.6 -> 21p
    const halfUp = new Money(103n, 'GBP');
    expect(halfUp.multiplyBasisPoints(2000n).amountMinor).toBe(21n);
  });

  it('handles arbitrary precision amounts exceeding Number.MAX_SAFE_INTEGER without precision loss', () => {
    const hugeAmount = 900719925474099200n; // 900 quadrillion minor units
    const money = new Money(hugeAmount, 'USD');

    // 10% calculation: 1000 basis points
    const tenPercent = money.multiplyBasisPoints(1000n);
    expect(tenPercent.amountMinor).toBe(90071992547409920n);

    // Subtraction preserves exactness
    const diff = money.subtract(tenPercent);
    expect(diff.amountMinor).toBe(810647932926689280n);
  });

  it('allocates proportions exactly without losing a single penny', () => {
    const total = new Money(100n, 'GBP'); // £1.00
    // Split 3 ways: 1:1:1
    const split = total.allocate([1, 1, 1]);
    expect(split).toHaveLength(3);
    expect(split[0]!.amountMinor).toBe(34n); // first gets remainder
    expect(split[1]!.amountMinor).toBe(33n);
    expect(split[2]!.amountMinor).toBe(33n);

    const sum = split[0]!.add(split[1]!).add(split[2]!);
    expect(sum.amountMinor).toBe(100n);
  });

  it('throws on invalid operations', () => {
    expect(() => new Money(-10n, 'GBP')).toThrow();
    expect(() => Money.zero('GBP').subtract(new Money(1n, 'GBP'))).toThrow();
    expect(() => new Money(10n, 'GBP').add(new Money(10n, 'EUR'))).toThrow(/Currency mismatch/);
    expect(() => new Money(10n, 'GBP').multiply(-1)).toThrow();
    expect(new Money(10n, 'GBP').allocate([])).toEqual([]);
    expect(() => new Money(10n, 'GBP').allocate([0, 0])).toThrow();
  });
});

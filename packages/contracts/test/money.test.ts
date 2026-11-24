import { describe, it, expect } from 'vitest';
import { Money } from '../src/money.js';

describe('Money value object', () => {
  it('correctly creates money in minor units and converts to JSON', () => {
    const m = new Money(1250n, 'GBP');
    expect(m.amountMinor).toBe(1250n);
    expect(m.currency).toBe('GBP');
    expect(m.toJson()).toEqual({
      amountMinor: '1250',
      currency: 'GBP',
    });
  });

  it('performs arithmetic operations preserving minor units precision', () => {
    const a = new Money(1000n, 'GBP');
    const b = new Money(250n, 'GBP');
    expect(a.add(b).amountMinor).toBe(1250n);
    expect(a.subtract(b).amountMinor).toBe(750n);
  });

  it('prevents cross-currency operations', () => {
    const gbp = new Money(1000n, 'GBP');
    const usd = new Money(1000n, 'USD');
    expect(() => gbp.add(usd)).toThrowError(/Currency mismatch/);
  });

  it('rejects negative amounts on creation or subtraction', () => {
    expect(() => new Money(-100n, 'EUR')).toThrow();
    const low = new Money(100n, 'EUR');
    const high = new Money(500n, 'EUR');
    expect(() => low.subtract(high)).toThrow();
  });

  it('formats correctly using Intl', () => {
    const m = new Money(1599n, 'GBP');
    const formatted = m.format('en-GB');
    expect(formatted).toContain('15.99');
  });
});

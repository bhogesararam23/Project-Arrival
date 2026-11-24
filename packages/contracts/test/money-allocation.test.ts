import { describe, it, expect } from 'vitest';
import { Money } from '../src/money.js';

describe('Money.allocate exact distribution without precision loss', () => {
  it('allocates £10.00 across 3 equal parts preserving exact sum (3.34 + 3.33 + 3.33 = 10.00)', () => {
    const total = new Money(1000n, 'GBP');
    const parts = total.allocate([1, 1, 1]);

    expect(parts).toHaveLength(3);
    expect(parts[0]?.amountMinor).toBe(334n);
    expect(parts[1]?.amountMinor).toBe(333n);
    expect(parts[2]?.amountMinor).toBe(333n);

    const sum = parts.reduce((acc, m) => acc.add(m), Money.zero('GBP'));
    expect(sum.amountMinor).toBe(1000n);
  });

  it('allocates according to weighted shares', () => {
    const total = new Money(10000n, 'GBP'); // £100.00
    const parts = total.allocate([70, 20, 10]);

    expect(parts[0]?.amountMinor).toBe(7000n);
    expect(parts[1]?.amountMinor).toBe(2000n);
    expect(parts[2]?.amountMinor).toBe(1000n);
  });
});

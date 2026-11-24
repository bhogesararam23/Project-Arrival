import { describe, it, expect } from 'vitest';
import { canTransitionOrder } from '../src/order.js';

describe('Order state transitions', () => {
  it('permits valid linear progression', () => {
    expect(canTransitionOrder('submitted', 'awaiting_merchant')).toBe(true);
    expect(canTransitionOrder('awaiting_merchant', 'accepted')).toBe(true);
    expect(canTransitionOrder('accepted', 'preparing')).toBe(true);
    expect(canTransitionOrder('preparing', 'ready_for_pickup')).toBe(true);
    expect(canTransitionOrder('ready_for_pickup', 'completed')).toBe(true);
  });

  it('permits cancellation from awaiting_merchant but not from completed', () => {
    expect(canTransitionOrder('awaiting_merchant', 'customer_cancelled')).toBe(true);
    expect(canTransitionOrder('completed', 'customer_cancelled')).toBe(false);
    expect(canTransitionOrder('rejected', 'accepted')).toBe(false);
  });

  it('prevents skipping intermediate phases', () => {
    expect(canTransitionOrder('submitted', 'delivered' as any)).toBe(false);
    expect(canTransitionOrder('submitted', 'completed')).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { generateGuestSecret, hashGuestSecret, verifyGuestSecret } from '../src/guest.js';

describe('Guest secret generation and hashing', () => {
  it('generates 64-char hex entropy (32 bytes)', () => {
    const token = generateGuestSecret();
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(token)).toBe(true);
  });

  it('hashes secrets deterministically with sha256', () => {
    const token = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const digest1 = hashGuestSecret(token);
    const digest2 = hashGuestSecret(token);
    expect(digest1).toBe(digest2);
    expect(digest1).not.toBe(token);
  });

  it('verifies correct tokens and rejects invalid tokens in constant time', () => {
    const token = generateGuestSecret();
    const digest = hashGuestSecret(token);
    expect(verifyGuestSecret(token, digest)).toBe(true);
    expect(verifyGuestSecret('wrong-secret', digest)).toBe(false);
  });
});

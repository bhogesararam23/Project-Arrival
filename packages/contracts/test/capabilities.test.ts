import { describe, it, expect } from 'vitest';
import { isCapabilityActive, type ProviderCapability } from '../src/capabilities.js';
import { parseCountryCode } from '../src/iso.js';

describe('Provider capability gate', () => {
  it('returns false for sandbox_tested or pending capabilities', () => {
    const cap: ProviderCapability = {
      id: 'cap-1',
      providerKey: 'mock_pos',
      capability: 'order_create',
      countryCode: parseCountryCode('GB'),
      status: 'sandbox_tested',
      evidenceUrl: 'https://arrival.internal/evidence/sandbox',
      reviewedAt: new Date().toISOString(),
    };
    expect(isCapabilityActive(cap)).toBe(false);
  });

  it('returns true for production_verified capability without expiry', () => {
    const cap: ProviderCapability = {
      id: 'cap-2',
      providerKey: 'mock_pos',
      capability: 'order_create',
      countryCode: parseCountryCode('GB'),
      status: 'production_verified',
      evidenceUrl: 'https://arrival.internal/evidence/prod',
      reviewedAt: new Date().toISOString(),
    };
    expect(isCapabilityActive(cap)).toBe(true);
  });

  it('returns false for expired capability', () => {
    const cap: ProviderCapability = {
      id: 'cap-3',
      providerKey: 'mock_pos',
      capability: 'order_create',
      countryCode: parseCountryCode('GB'),
      status: 'production_verified',
      evidenceUrl: 'https://arrival.internal/evidence/prod',
      reviewedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() - 60000).toISOString(),
    };
    expect(isCapabilityActive(cap)).toBe(false);
  });
});

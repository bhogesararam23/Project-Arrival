import type { CountryCode, CurrencyCode } from './iso.js';

export type CapabilityStatus =
  | 'unknown'
  | 'pending'
  | 'sandbox_tested'
  | 'production_verified'
  | 'disabled';

export interface ProviderCapability {
  id: string;
  providerKey: string;
  capability: string;
  countryCode: CountryCode;
  locationId?: string;
  currency?: CurrencyCode;
  status: CapabilityStatus;
  evidenceUrl: string;
  reviewedAt: string;
  expiresAt?: string;
}

export interface CapabilityGate {
  providerKey: string;
  capability: string;
  countryCode: CountryCode;
  locationId?: string;
}

/**
 * Fail-closed policy evaluator.
 * Only 'production_verified' capabilities are considered active for transactional operations.
 */
export function isCapabilityActive(capability: ProviderCapability): boolean {
  if (capability.status !== 'production_verified') {
    return false;
  }
  if (capability.expiresAt && new Date(capability.expiresAt).getTime() <= Date.now()) {
    return false;
  }
  return true;
}

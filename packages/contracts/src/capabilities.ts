import type { CountryCode, CurrencyCode } from './iso.js';

export type CapabilityStatus =
  | 'not_configured'
  | 'researching'
  | 'sandbox_available'
  | 'sandbox_verified'
  | 'pending_commercial_approval'
  | 'pending_merchant_approval'
  | 'production_verified'
  | 'suspended'
  | 'revoked'
  | 'expired'
  | 'unknown'
  | 'pending'
  | 'sandbox_tested'
  | 'disabled';

export interface ProviderCapability {
  id: string;
  providerKey: string;
  providerAccountRef?: string;
  capability: string;
  countryCode: CountryCode;
  merchantId?: string;
  locationId?: string;
  currency?: CurrencyCode;
  status: CapabilityStatus;
  evidenceUrl: string;
  reviewedBy?: string;
  reviewedAt: string;
  expiresAt?: string;
  revokedAt?: string;
  revocationReason?: string;
}

export interface CapabilityGate {
  providerKey: string;
  capability: string;
  countryCode: CountryCode;
  locationId?: string;
  merchantId?: string;
}

/**
 * Fail-closed policy evaluator.
 * Only 'production_verified' capabilities that are not revoked and not expired
 * are considered active for production transactional operations.
 */
export function isCapabilityActive(capability: ProviderCapability, nowMs = Date.now()): boolean {
  if (capability.status !== 'production_verified') {
    return false;
  }
  if (capability.revokedAt) {
    return false;
  }
  if (capability.expiresAt && new Date(capability.expiresAt).getTime() <= nowMs) {
    return false;
  }
  return true;
}

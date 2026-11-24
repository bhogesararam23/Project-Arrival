import { createHash, randomBytes } from 'node:crypto';

export interface GuestSession {
  sessionToken: string;
  expiresAt: string;
}

export interface GuestSessionRecord {
  id: string;
  tokenDigest: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | null;
}

export interface GuestOrderGrantRecord {
  id: string;
  orderId: string;
  tokenDigest: string;
  scope: 'read_order' | 'cancel_order';
  expiresAt: string;
  revokedAt?: string | null;
  createdAt: string;
}

/**
 * Generate 32 bytes of secure random entropy encoded in hex for guest session tokens.
 */
export function generateGuestSecret(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Compute SHA-256 digest of guest tokens before persistence.
 * Raw bearer secrets are never stored in the database.
 */
export function hashGuestSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/**
 * Constant-time digest comparison to mitigate timing attacks.
 */
export function verifyGuestSecret(candidateSecret: string, storedDigest: string): boolean {
  const candidateDigest = hashGuestSecret(candidateSecret);
  if (candidateDigest.length !== storedDigest.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < candidateDigest.length; i++) {
    result |= candidateDigest.charCodeAt(i) ^ storedDigest.charCodeAt(i);
  }
  return result === 0;
}

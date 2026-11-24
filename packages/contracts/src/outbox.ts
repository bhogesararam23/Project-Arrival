export interface OutboxMessage<T = unknown> {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: T;
  createdAt: string;
  availableAt: string;
  attempts: number;
  lockedUntil?: string | null;
  publishedAt?: string | null;
  lastError?: string | null;
}

export interface WebhookInboxMessage<T = unknown> {
  id: string;
  providerKey: string;
  providerAccountRef: string;
  providerEventRef: string;
  eventType: string;
  receivedAt: string;
  signatureVerified: boolean;
  payloadDigest: string;
  redactedPayload: T;
  processedAt?: string | null;
  processingError?: string | null;
}

export type IdempotencyStatus = 'pending' | 'completed' | 'failed';

export interface IdempotencyRecord<T = unknown> {
  id: string;
  principalScope: string;
  operation: string;
  idempotencyKey: string;
  requestHash: string;
  status: IdempotencyStatus;
  lockedUntil?: string | null;
  responseStatus?: number;
  responseBody?: T;
  createdAt: string;
  expiresAt: string;
}

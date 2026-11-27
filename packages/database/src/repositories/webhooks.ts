import type pg from 'pg';
import { type WebhookInboxMessage, type WebhookInboxStatus } from '@arrival/contracts';

export class PgWebhookInboxRepository {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Inserts a webhook event atomically, deduplicating on (provider_key, provider_account_ref, provider_event_ref).
   * Returns { inserted: true, message } if new, or { inserted: false, message } if duplicate.
   */
  async ingest(message: WebhookInboxMessage): Promise<{ inserted: boolean; message: WebhookInboxMessage }> {
    const insertRes = await this.pool.query(
      `INSERT INTO webhook_inbox (
        id, provider_key, provider_account_ref, provider_event_ref,
        event_type, received_at, event_timestamp, signature_verified,
        payload_digest, redacted_payload, status, attempts, correlation_order_id
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        decode($9, 'hex'), $10, $11, $12, $13
      )
      ON CONFLICT (provider_key, provider_account_ref, provider_event_ref) DO NOTHING
      RETURNING id;`,
      [
        message.id,
        message.providerKey,
        message.providerAccountRef,
        message.providerEventRef,
        message.eventType,
        message.receivedAt,
        message.eventTimestamp || null,
        message.signatureVerified,
        message.payloadDigest,
        JSON.stringify(message.redactedPayload),
        message.status,
        message.attempts,
        message.correlationOrderId || null,
      ]
    );

    if (insertRes.rows.length > 0) {
      return { inserted: true, message };
    }

    const existing = await this.getByProviderEvent(
      message.providerKey,
      message.providerAccountRef,
      message.providerEventRef
    );
    return { inserted: false, message: existing || message };
  }

  async getByProviderEvent(
    providerKey: string,
    providerAccountRef: string,
    providerEventRef: string
  ): Promise<WebhookInboxMessage | null> {
    const res = await this.pool.query(
      `SELECT id, provider_key, provider_account_ref, provider_event_ref,
              event_type, received_at, event_timestamp, signature_verified,
              encode(payload_digest, 'hex') as payload_digest,
              redacted_payload, status, attempts, correlation_order_id,
              processed_at, processing_error
       FROM webhook_inbox
       WHERE provider_key = $1 AND provider_account_ref = $2 AND provider_event_ref = $3
       LIMIT 1;`,
      [providerKey, providerAccountRef, providerEventRef]
    );
    return res.rows.length > 0 ? mapWebhookRow(res.rows[0]) : null;
  }

  async markProcessed(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE webhook_inbox SET status = 'processed', processed_at = now(), processing_error = NULL WHERE id = $1;`,
      [id]
    );
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await this.pool.query(
      `UPDATE webhook_inbox
       SET status = 'failed', attempts = attempts + 1, processing_error = $2
       WHERE id = $1;`,
      [id, errorMessage.slice(0, 1000)]
    );
  }

  async listFailed(limit = 50): Promise<WebhookInboxMessage[]> {
    const res = await this.pool.query(
      `SELECT id, provider_key, provider_account_ref, provider_event_ref,
              event_type, received_at, event_timestamp, signature_verified,
              encode(payload_digest, 'hex') as payload_digest,
              redacted_payload, status, attempts, correlation_order_id,
              processed_at, processing_error
       FROM webhook_inbox
       WHERE status IN ('failed', 'dead_lettered')
       ORDER BY received_at DESC
       LIMIT $1;`,
      [limit]
    );
    return res.rows.map(mapWebhookRow);
  }
}

function mapWebhookRow(row: any): WebhookInboxMessage {
  return {
    id: row.id,
    providerKey: row.provider_key,
    providerAccountRef: row.provider_account_ref,
    providerEventRef: row.provider_event_ref,
    eventType: row.event_type,
    receivedAt: new Date(row.received_at).toISOString(),
    eventTimestamp: row.event_timestamp ? new Date(row.event_timestamp).toISOString() : null,
    signatureVerified: Boolean(row.signature_verified),
    payloadDigest: row.payload_digest,
    redactedPayload: row.redacted_payload,
    status: (row.status || 'pending') as WebhookInboxStatus,
    attempts: Number(row.attempts || 0),
    correlationOrderId: row.correlation_order_id || null,
    processedAt: row.processed_at ? new Date(row.processed_at).toISOString() : null,
    processingError: row.processing_error || null,
  };
}

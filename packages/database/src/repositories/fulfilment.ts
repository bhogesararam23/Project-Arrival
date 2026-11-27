import type pg from 'pg';
import {
  type FulfilmentAttemptRecord,
  type FulfilmentState,
  parseCurrencyCode,
} from '@arrival/contracts';

export class PgFulfilmentRepository {
  constructor(private readonly pool: pg.Pool) {}

  async createAttempt(attempt: FulfilmentAttemptRecord): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN;');
      await client.query(
        `INSERT INTO fulfilment_attempts (
          id, order_id, provider_key, provider_account_ref, provider_delivery_ref,
          state, quote_ref, quote_expires_at, fee_minor, currency,
          idempotency_key, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13
        );`,
        [
          attempt.id,
          attempt.orderId,
          attempt.providerKey,
          attempt.providerAccountRef,
          attempt.providerDeliveryRef || null,
          attempt.state,
          attempt.quoteRef || null,
          attempt.quoteExpiresAt || null,
          attempt.feeMinor || null,
          attempt.currency || null,
          attempt.idempotencyKey,
          attempt.createdAt,
          attempt.updatedAt,
        ]
      );

      await client.query(
        `UPDATE orders SET fulfilment_state = $1, version = version + 1, updated_at = now() WHERE id = $2;`,
        [attempt.state, attempt.orderId]
      );

      await client.query('COMMIT;');
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateState(
    attemptId: string,
    newState: FulfilmentState,
    providerDeliveryRef?: string
  ): Promise<FulfilmentAttemptRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN;');
      const res = await client.query(
        `UPDATE fulfilment_attempts
         SET state = $1,
             provider_delivery_ref = COALESCE($2, provider_delivery_ref),
             updated_at = now()
         WHERE id = $3
         RETURNING id, order_id, provider_key, provider_account_ref, provider_delivery_ref,
                   state, quote_ref, quote_expires_at, fee_minor, currency,
                   idempotency_key, created_at, updated_at;`,
        [newState, providerDeliveryRef || null, attemptId]
      );

      if (res.rows.length === 0) {
        await client.query('ROLLBACK;');
        return null;
      }

      const row = res.rows[0];
      await client.query(
        `UPDATE orders SET fulfilment_state = $1, version = version + 1, updated_at = now() WHERE id = $2;`,
        [newState, row.order_id]
      );

      await client.query('COMMIT;');
      return mapFulfilmentRow(row);
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  async getLatestByOrderId(orderId: string): Promise<FulfilmentAttemptRecord | null> {
    const res = await this.pool.query(
      `SELECT id, order_id, provider_key, provider_account_ref, provider_delivery_ref,
              state, quote_ref, quote_expires_at, fee_minor, currency,
              idempotency_key, created_at, updated_at
       FROM fulfilment_attempts
       WHERE order_id = $1
       ORDER BY created_at DESC
       LIMIT 1;`,
      [orderId]
    );
    return res.rows.length > 0 ? mapFulfilmentRow(res.rows[0]) : null;
  }
}

function mapFulfilmentRow(row: any): FulfilmentAttemptRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    providerKey: row.provider_key,
    providerAccountRef: row.provider_account_ref,
    providerDeliveryRef: row.provider_delivery_ref || null,
    state: row.state as FulfilmentState,
    quoteRef: row.quote_ref || null,
    quoteExpiresAt: row.quote_expires_at ? new Date(row.quote_expires_at).toISOString() : null,
    feeMinor: row.fee_minor !== null && row.fee_minor !== undefined ? row.fee_minor.toString() : null,
    currency: row.currency ? parseCurrencyCode(row.currency) : null,
    idempotencyKey: row.idempotency_key,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

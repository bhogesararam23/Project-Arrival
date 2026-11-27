import type pg from 'pg';
import {
  type PaymentAttemptRecord,
  type PaymentState,
  parseCurrencyCode,
} from '@arrival/contracts';

export class PgPaymentRepository {
  constructor(private readonly pool: pg.Pool) {}

  async createAttempt(attempt: PaymentAttemptRecord): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN;');
      await client.query(
        `INSERT INTO payment_attempts (
          id, order_id, provider_key, provider_account_ref, provider_payment_ref,
          state, amount_minor, currency, idempotency_key, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10, $11
        );`,
        [
          attempt.id,
          attempt.orderId,
          attempt.providerKey,
          attempt.providerAccountRef,
          attempt.providerPaymentRef || null,
          attempt.state,
          attempt.amountMinor,
          attempt.currency,
          attempt.idempotencyKey,
          attempt.createdAt,
          attempt.updatedAt,
        ]
      );

      await client.query(
        `UPDATE orders SET payment_state = $1, version = version + 1, updated_at = now() WHERE id = $2;`,
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
    newState: PaymentState,
    providerPaymentRef?: string
  ): Promise<PaymentAttemptRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN;');
      const res = await client.query(
        `UPDATE payment_attempts
         SET state = $1,
             provider_payment_ref = COALESCE($2, provider_payment_ref),
             updated_at = now()
         WHERE id = $3
         RETURNING id, order_id, provider_key, provider_account_ref, provider_payment_ref,
                   state, amount_minor, currency, idempotency_key, created_at, updated_at;`,
        [newState, providerPaymentRef || null, attemptId]
      );

      if (res.rows.length === 0) {
        await client.query('ROLLBACK;');
        return null;
      }

      const row = res.rows[0];
      await client.query(
        `UPDATE orders SET payment_state = $1, version = version + 1, updated_at = now() WHERE id = $2;`,
        [newState, row.order_id]
      );

      await client.query('COMMIT;');
      return mapPaymentRow(row);
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  async getLatestByOrderId(orderId: string): Promise<PaymentAttemptRecord | null> {
    const res = await this.pool.query(
      `SELECT id, order_id, provider_key, provider_account_ref, provider_payment_ref,
              state, amount_minor, currency, idempotency_key, created_at, updated_at
       FROM payment_attempts
       WHERE order_id = $1
       ORDER BY created_at DESC
       LIMIT 1;`,
      [orderId]
    );
    return res.rows.length > 0 ? mapPaymentRow(res.rows[0]) : null;
  }

  async recordEvent(params: {
    id: string;
    paymentAttemptId: string;
    eventType: string;
    amountMinor?: string;
    providerEventRef?: string;
    redactedPayload?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO payment_events (
        id, payment_attempt_id, event_type, amount_minor, provider_event_ref,
        occurred_at, received_at, redacted_payload
      ) VALUES ($1, $2, $3, $4, $5, now(), now(), $6);`,
      [
        params.id,
        params.paymentAttemptId,
        params.eventType,
        params.amountMinor || null,
        params.providerEventRef || null,
        JSON.stringify(params.redactedPayload || {}),
      ]
    );
  }

  async listReconciliationRequired(limit = 50): Promise<PaymentAttemptRecord[]> {
    const res = await this.pool.query(
      `SELECT id, order_id, provider_key, provider_account_ref, provider_payment_ref,
              state, amount_minor, currency, idempotency_key, created_at, updated_at
       FROM payment_attempts
       WHERE state = 'reconciliation_required'
       ORDER BY updated_at DESC
       LIMIT $1;`,
      [limit]
    );
    return res.rows.map(mapPaymentRow);
  }
}

function mapPaymentRow(row: any): PaymentAttemptRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    providerKey: row.provider_key,
    providerAccountRef: row.provider_account_ref,
    providerPaymentRef: row.provider_payment_ref || null,
    state: row.state as PaymentState,
    amountMinor: row.amount_minor.toString(),
    currency: parseCurrencyCode(row.currency),
    idempotencyKey: row.idempotency_key,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

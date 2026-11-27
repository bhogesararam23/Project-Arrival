import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { type OutboxMessage } from '@arrival/contracts';

export class PgOutboxRepository {
  constructor(private readonly pool: pg.Pool) {}

  async publish(message: OutboxMessage): Promise<void> {
    await this.pool.query(
      `INSERT INTO outbox (
        id, aggregate_type, aggregate_id, event_type, payload,
        created_at, available_at, attempts, max_attempts, locked_until
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10
      );`,
      [
        message.id,
        message.aggregateType,
        message.aggregateId,
        message.eventType,
        JSON.stringify(message.payload),
        message.createdAt,
        message.availableAt,
        message.attempts,
        message.maxAttempts ?? 5,
        message.lockedUntil || null,
      ]
    );
  }

  async fetchPending(limit: number): Promise<OutboxMessage[]> {
    const res = await this.pool.query(
      `SELECT
        id, aggregate_type, aggregate_id, event_type, payload,
        created_at, available_at, attempts, max_attempts,
        worker_id, lease_token, locked_until, published_at, dead_lettered_at, last_error
       FROM outbox
       WHERE published_at IS NULL
         AND dead_lettered_at IS NULL
         AND available_at <= now()
         AND (locked_until IS NULL OR locked_until <= now())
       ORDER BY available_at ASC, created_at ASC
       LIMIT $1;`,
      [limit]
    );

    return res.rows.map(mapOutboxRow);
  }

  /**
   * Atomically claims a batch of eligible outbox messages using FOR UPDATE SKIP LOCKED.
   * Two concurrent workers will never claim the same message.
   */
  async claimBatch(workerId: string, limit: number, leaseDurationMs: number): Promise<OutboxMessage[]> {
    const leaseToken = randomUUID();
    const lockUntil = new Date(Date.now() + leaseDurationMs).toISOString();

    const res = await this.pool.query(
      `WITH candidate AS (
         SELECT id
         FROM outbox
         WHERE published_at IS NULL
           AND dead_lettered_at IS NULL
           AND available_at <= now()
           AND (locked_until IS NULL OR locked_until <= now())
         ORDER BY available_at ASC, created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE outbox o
       SET worker_id = $2,
           lease_token = $3,
           locked_until = $4,
           attempts = o.attempts + 1
       FROM candidate c
       WHERE o.id = c.id
       RETURNING
         o.id, o.aggregate_type, o.aggregate_id, o.event_type, o.payload,
         o.created_at, o.available_at, o.attempts, o.max_attempts,
         o.worker_id, o.lease_token, o.locked_until, o.published_at, o.dead_lettered_at, o.last_error;`,
      [limit, workerId, leaseToken, lockUntil]
    );

    return res.rows.map(mapOutboxRow);
  }

  async complete(messageId: string, leaseToken: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE outbox
       SET published_at = now(),
           locked_until = NULL,
           lease_token = NULL
       WHERE id = $1 AND lease_token = $2 AND published_at IS NULL
       RETURNING id;`,
      [messageId, leaseToken]
    );
    return res.rows.length > 0;
  }

  async scheduleRetry(
    messageId: string,
    leaseToken: string,
    nextAvailableAt: string,
    errorMessage: string
  ): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE outbox
       SET available_at = $3,
           locked_until = NULL,
           lease_token = NULL,
           last_error = $4
       WHERE id = $1 AND lease_token = $2 AND published_at IS NULL AND dead_lettered_at IS NULL
       RETURNING id;`,
      [messageId, leaseToken, nextAvailableAt, errorMessage.slice(0, 1000)]
    );
    return res.rows.length > 0;
  }

  async deadLetter(messageId: string, leaseToken: string, errorMessage: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE outbox
       SET dead_lettered_at = now(),
           locked_until = NULL,
           lease_token = NULL,
           last_error = $3
       WHERE id = $1 AND lease_token = $2 AND published_at IS NULL
       RETURNING id;`,
      [messageId, leaseToken, errorMessage.slice(0, 1000)]
    );
    return res.rows.length > 0;
  }

  async listDeadLetter(limit = 50): Promise<OutboxMessage[]> {
    const res = await this.pool.query(
      `SELECT
        id, aggregate_type, aggregate_id, event_type, payload,
        created_at, available_at, attempts, max_attempts,
        worker_id, lease_token, locked_until, published_at, dead_lettered_at, last_error
       FROM outbox
       WHERE dead_lettered_at IS NOT NULL
       ORDER BY dead_lettered_at DESC
       LIMIT $1;`,
      [limit]
    );
    return res.rows.map(mapOutboxRow);
  }

  async replayDeadLetter(messageId: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE outbox
       SET dead_lettered_at = NULL,
           locked_until = NULL,
           lease_token = NULL,
           worker_id = NULL,
           attempts = 0,
           available_at = now(),
           last_error = NULL
       WHERE id = $1 AND dead_lettered_at IS NOT NULL AND published_at IS NULL
       RETURNING id;`,
      [messageId]
    );
    return res.rows.length > 0;
  }

  async getMetrics(): Promise<{ pendingCount: number; deadLetteredCount: number }> {
    const res = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE published_at IS NULL AND dead_lettered_at IS NULL)::int AS pending_count,
        COUNT(*) FILTER (WHERE dead_lettered_at IS NOT NULL)::int AS dlq_count
      FROM outbox;
    `);
    const row = res.rows[0] || { pending_count: 0, dlq_count: 0 };
    return {
      pendingCount: Number(row.pending_count || 0),
      deadLetteredCount: Number(row.dlq_count || 0),
    };
  }
}

function mapOutboxRow(row: any): OutboxMessage {
  return {
    id: row.id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    eventType: row.event_type,
    payload: row.payload,
    createdAt: new Date(row.created_at).toISOString(),
    availableAt: new Date(row.available_at).toISOString(),
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts ?? 5),
    workerId: row.worker_id || null,
    leaseToken: row.lease_token || null,
    lockedUntil: row.locked_until ? new Date(row.locked_until).toISOString() : null,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    deadLetteredAt: row.dead_lettered_at ? new Date(row.dead_lettered_at).toISOString() : null,
    lastError: row.last_error || null,
  };
}

import type pg from 'pg';
import { type OutboxMessage } from '@arrival/contracts';

export class PgOutboxRepository {
  constructor(private readonly pool: pg.Pool) {}

  async publish(message: OutboxMessage): Promise<void> {
    await this.pool.query(
      `INSERT INTO outbox (
        id, aggregate_type, aggregate_id, event_type, payload,
        created_at, available_at, attempts, locked_until
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9
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
        message.lockedUntil || null,
      ]
    );
  }

  async fetchPending(limit: number): Promise<OutboxMessage[]> {
    const res = await this.pool.query(
      `SELECT
        id, aggregate_type, aggregate_id, event_type, payload,
        created_at, available_at, attempts, locked_until, published_at, last_error
       FROM outbox
       WHERE published_at IS NULL
         AND available_at <= now()
         AND (locked_until IS NULL OR locked_until <= now())
       ORDER BY available_at ASC, created_at ASC
       LIMIT $1;`,
      [limit]
    );

    return res.rows.map((row) => ({
      id: row.id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      payload: row.payload,
      createdAt: new Date(row.created_at).toISOString(),
      availableAt: new Date(row.available_at).toISOString(),
      attempts: row.attempts,
      lockedUntil: row.locked_until ? new Date(row.locked_until).toISOString() : null,
      publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
      lastError: row.last_error || null,
    }));
  }
}

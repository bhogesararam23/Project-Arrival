import type pg from 'pg';
import {
  type OrderView,
  type OrderCreated,
  type OrderEventItem,
  type OrderState,
  type Quote,
} from '@arrival/contracts';

export class PgOrderRepository {
  constructor(private readonly pool: pg.Pool) {}

  async createOrder(order: OrderCreated, quote: Quote, outboxPayload: unknown): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN;');

      // 1. Insert order
      await client.query(
        `INSERT INTO orders (
          id, location_id, delivery_address_id, quote_id,
          state, currency, total_minor, purchase_snapshot,
          idempotency_record_id, created_at, updated_at
        ) VALUES (
          $1,
          (SELECT location_id FROM checkout_quotes WHERE id = $2),
          gen_random_uuid(),
          $2,
          $3,
          $4,
          $5,
          $6,
          gen_random_uuid(),
          now(),
          now()
        );`,
        [
          order.orderId,
          quote.quoteId,
          order.orderState,
          quote.currency,
          quote.total.amountMinor,
          JSON.stringify(quote),
        ]
      );

      // 2. Insert initial order event
      await client.query(
        `INSERT INTO order_events (
          order_id, from_state, to_state, source, occurred_at, received_at, details_redacted
        ) VALUES (
          $1, NULL, $2, 'arrival_api', now(), now(), $3
        );`,
        [order.orderId, order.orderState, JSON.stringify({ event: 'order_submitted' })]
      );

      // 3. Insert outbox message
      await client.query(
        `INSERT INTO outbox (
          aggregate_type, aggregate_id, event_type, payload, created_at, available_at
        ) VALUES (
          'order', $1, 'order_submitted', $2, now(), now()
        );`,
        [order.orderId, JSON.stringify(outboxPayload)]
      );

      await client.query('COMMIT;');
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  async getById(orderId: string): Promise<OrderView | null> {
    const res = await this.pool.query(
      `SELECT
        id, state, updated_at
       FROM orders
       WHERE id = $1
       LIMIT 1;`,
      [orderId]
    );

    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0];
    return {
      orderId: row.id,
      orderState: row.state as OrderState,
      paymentState: 'authorized',
      fulfilmentState: 'quote_pending',
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async getEvents(orderId: string): Promise<OrderEventItem[]> {
    const res = await this.pool.query(
      `SELECT
        to_state, source, occurred_at, received_at, details_redacted
       FROM order_events
       WHERE order_id = $1
       ORDER BY received_at ASC;`,
      [orderId]
    );

    return res.rows.map((row) => ({
      eventType: `order_${row.to_state}`,
      occurredAt: new Date(row.occurred_at || row.received_at).toISOString(),
      source: row.source === 'merchant' ? 'merchant' : 'arrival_operator',
      message: (row.details_redacted as any)?.message,
    }));
  }

  async recordEvent(orderId: string, event: OrderEventItem): Promise<void> {
    await this.pool.query(
      `INSERT INTO order_events (
        order_id, from_state, to_state, source, occurred_at, received_at, details_redacted
      ) VALUES (
        $1, NULL, 'completed', $2, $3, now(), $4
      );`,
      [
        orderId,
        event.source,
        event.occurredAt,
        JSON.stringify({ message: event.message, eventType: event.eventType }),
      ]
    );
  }

  async updateState(orderId: string, newState: OrderState): Promise<void> {
    await this.pool.query(
      `UPDATE orders SET state = $1, updated_at = now() WHERE id = $2;`,
      [newState, orderId]
    );
  }
}

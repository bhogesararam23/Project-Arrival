import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  type OrderView,
  type OrderCreated,
  type OrderEventItem,
  type OrderState,
  type PaymentState,
  type FulfilmentState,
  type MerchantOrderState,
  type Quote,
  type QuoteLineSnapshot,
  type PurchaseSnapshot,
  type OutboxMessage,
  type GuestOrderGrantRecord,
} from '@arrival/contracts';

export interface CreateOrderParams {
  order: OrderCreated;
  quote: Quote;
  locationId: string;
  purchaseSnapshot: PurchaseSnapshot;
  items: QuoteLineSnapshot[];
  guestSessionId?: string | undefined;
  customerId?: string | undefined;
  idempotencyRecordId: string;
  outboxMessages: OutboxMessage[];
  guestGrants?: GuestOrderGrantRecord[] | undefined;
}

export class PgOrderRepository {
  constructor(private readonly pool: pg.Pool) {}

  async createOrder(params: CreateOrderParams): Promise<{ quoteConsumed: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN;');

      // 1. Atomically consume the quote inside the transaction
      const quoteRes = await client.query(
        `UPDATE checkout_quotes
         SET consumed_at = now(), version = version + 1
         WHERE id = $1 AND consumed_at IS NULL AND expires_at > now()
         RETURNING id, location_id, delivery_address_id, guest_session_id, customer_id;`,
        [params.quote.quoteId]
      );

      if (quoteRes.rows.length === 0) {
        await client.query('ROLLBACK;');
        return { quoteConsumed: false };
      }

      const quoteRow = quoteRes.rows[0];
      const resolvedLocationId = quoteRow.location_id || params.locationId;
      const resolvedDeliveryAddressId = quoteRow.delivery_address_id;
      const resolvedGuestSessionId = params.guestSessionId || quoteRow.guest_session_id || null;
      const resolvedCustomerId = params.customerId || quoteRow.customer_id || null;

      // 2. Insert order with real foreign keys and immutable purchase snapshot
      await client.query(
        `INSERT INTO orders (
          id, location_id, delivery_address_id, quote_id,
          customer_id, guest_session_id,
          state, payment_state, fulfilment_state, merchant_order_state,
          currency, total_minor, purchase_snapshot,
          idempotency_record_id, version, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13,
          $14, 1, now(), now()
        );`,
        [
          params.order.orderId,
          resolvedLocationId,
          resolvedDeliveryAddressId,
          params.quote.quoteId,
          resolvedCustomerId,
          resolvedGuestSessionId,
          params.order.orderState,
          params.order.paymentState || 'requires_action',
          params.order.fulfilmentState || 'quote_pending',
          params.order.merchantOrderState || 'submission_requested',
          params.quote.currency,
          params.quote.total.amountMinor,
          JSON.stringify(params.purchaseSnapshot),
          params.idempotencyRecordId,
        ]
      );

      // 3. Insert normalized order_items rows
      for (const item of params.items) {
        await client.query(
          `INSERT INTO order_items (
            id, order_id, source_menu_item_id, item_name_snapshot,
            quantity, unit_price_minor, modifiers_snapshot, line_total_minor
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8
          );`,
          [
            randomUUID(),
            params.order.orderId,
            item.menuItemId,
            item.name,
            item.quantity,
            item.unitPriceMinor,
            JSON.stringify(item.modifiers || item.modifierOptionIds || []),
            item.totalPriceMinor,
          ]
        );
      }

      // 4. Insert guest order grants if present
      if (params.guestGrants && params.guestGrants.length > 0) {
        for (const grant of params.guestGrants) {
          await client.query(
            `INSERT INTO guest_order_grants (
              id, order_id, token_digest, scope, expires_at, created_at
            ) VALUES (
              $1, $2, decode($3, 'hex'), $4, $5, $6
            );`,
            [grant.id, params.order.orderId, grant.tokenDigest, grant.scope, grant.expiresAt, grant.createdAt]
          );
        }
      }

      // 5. Insert initial order event
      await client.query(
        `INSERT INTO order_events (
          order_id, from_state, to_state, source, occurred_at, received_at, details_redacted
        ) VALUES (
          $1, NULL, $2, 'arrival_api', now(), now(), $3
        );`,
        [
          params.order.orderId,
          params.order.orderState,
          JSON.stringify({ eventType: 'order_submitted', message: 'Order submitted and queued for orchestration' }),
        ]
      );

      // 6. Atomically insert outbox messages in the same transaction
      for (const msg of params.outboxMessages) {
        await client.query(
          `INSERT INTO outbox (
            id, aggregate_type, aggregate_id, event_type, payload,
            created_at, available_at, attempts, max_attempts
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9
          );`,
          [
            msg.id,
            msg.aggregateType,
            msg.aggregateId,
            msg.eventType,
            JSON.stringify(msg.payload),
            msg.createdAt,
            msg.availableAt,
            msg.attempts,
            msg.maxAttempts ?? 5,
          ]
        );
      }

      await client.query('COMMIT;');
      return { quoteConsumed: true };
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
        id, state, payment_state, fulfilment_state, merchant_order_state,
        purchase_snapshot, updated_at
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
      paymentState: (row.payment_state as PaymentState) ?? null,
      fulfilmentState: (row.fulfilment_state as FulfilmentState) ?? null,
      merchantOrderState: (row.merchant_order_state as MerchantOrderState) ?? null,
      updatedAt: new Date(row.updated_at).toISOString(),
      ...(row.purchase_snapshot ? { purchaseSnapshot: row.purchase_snapshot as PurchaseSnapshot } : {}),
    };
  }

  async getEvents(orderId: string): Promise<OrderEventItem[]> {
    const res = await this.pool.query(
      `SELECT
        to_state, source, occurred_at, received_at, details_redacted
       FROM order_events
       WHERE order_id = $1
       ORDER BY received_at ASC, id ASC;`,
      [orderId]
    );

    return res.rows.map((row) => {
      const details = (row.details_redacted || {}) as { eventType?: string; message?: string };
      const rawSource = row.source as string;
      const validSource: OrderEventItem['source'] =
        rawSource === 'merchant' ||
        rawSource === 'fulfilment' ||
        rawSource === 'payment' ||
        rawSource === 'arrival_api' ||
        rawSource === 'arrival_operator'
          ? rawSource
          : 'arrival_operator';

      return {
        eventType: details.eventType || `order_${row.to_state}`,
        occurredAt: new Date(row.occurred_at || row.received_at).toISOString(),
        source: validSource,
        ...(details.message ? { message: details.message } : {}),
      };
    });
  }

  async recordEvent(
    orderId: string,
    event: OrderEventItem & { fromState?: OrderState; toState?: OrderState }
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      let toState = event.toState;
      if (!toState) {
        const cur = await client.query(`SELECT state FROM orders WHERE id = $1 LIMIT 1;`, [orderId]);
        toState = (cur.rows[0]?.state as OrderState) || 'submitted';
      }

      await client.query(
        `INSERT INTO order_events (
          order_id, from_state, to_state, source, occurred_at, received_at, details_redacted
        ) VALUES (
          $1, $2, $3, $4, $5, now(), $6
        );`,
        [
          orderId,
          event.fromState || null,
          toState,
          event.source,
          event.occurredAt,
          JSON.stringify({ message: event.message, eventType: event.eventType }),
        ]
      );
    } finally {
      client.release();
    }
  }

  async updateState(
    orderId: string,
    newState: OrderState,
    expectedFromState?: OrderState
  ): Promise<boolean> {
    const params: unknown[] = [newState, orderId];
    let sql = `UPDATE orders SET state = $1, version = version + 1, updated_at = now() WHERE id = $2`;
    if (expectedFromState) {
      params.push(expectedFromState);
      sql += ` AND state = $3`;
    }
    sql += ` RETURNING id;`;

    const res = await this.pool.query(sql, params);
    return res.rows.length > 0;
  }

  async updateMerchantOrderState(
    orderId: string,
    newState: MerchantOrderState,
    providerPosRef?: string
  ): Promise<void> {
    await this.pool.query(
      `UPDATE orders
       SET merchant_order_state = $1,
           provider_pos_ref = COALESCE($2, provider_pos_ref),
           version = version + 1,
           updated_at = now()
       WHERE id = $3;`,
      [newState, providerPosRef || null, orderId]
    );
  }

  async listOrders(filters?: { state?: OrderState; limit?: number }): Promise<OrderView[]> {
    const params: unknown[] = [];
    let sql = `
      SELECT id, state, payment_state, fulfilment_state, merchant_order_state, purchase_snapshot, updated_at
      FROM orders
    `;
    if (filters?.state) {
      params.push(filters.state);
      sql += ` WHERE state = $1`;
    }
    params.push(Math.min(Math.max(filters?.limit ?? 50, 1), 200));
    sql += ` ORDER BY created_at DESC LIMIT $${params.length};`;

    const res = await this.pool.query(sql, params);
    return res.rows.map((row) => ({
      orderId: row.id,
      orderState: row.state as OrderState,
      paymentState: (row.payment_state as PaymentState) ?? null,
      fulfilmentState: (row.fulfilment_state as FulfilmentState) ?? null,
      merchantOrderState: (row.merchant_order_state as MerchantOrderState) ?? null,
      updatedAt: new Date(row.updated_at).toISOString(),
      ...(row.purchase_snapshot ? { purchaseSnapshot: row.purchase_snapshot as PurchaseSnapshot } : {}),
    }));
  }
}

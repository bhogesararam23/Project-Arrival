import type pg from 'pg';

export interface RetentionPurgeResult {
  expiredIdempotencyRecords: number;
  expiredDeliveryCoordinates: number;
  expiredGuestOrderGrants: number;
  expiredGuestSessions: number;
}

/**
 * Enforces data retention policies for ephemeral/sensitive records while strictly
 * preserving financial, order, and immutable audit records.
 */
export class RetentionCleanupService {
  constructor(private readonly pool: pg.Pool) {}

  async purgeExpired(nowIso = new Date().toISOString()): Promise<RetentionPurgeResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN;');

      const idemRes = await client.query(
        `DELETE FROM idempotency_records
         WHERE expires_at <= $1
           AND id NOT IN (SELECT idempotency_record_id FROM orders);`,
        [nowIso]
      );

      const coordRes = await client.query(
        `DELETE FROM restricted_delivery_coordinates WHERE expires_at <= $1;`,
        [nowIso]
      );

      const grantRes = await client.query(
        `DELETE FROM guest_order_grants WHERE expires_at <= $1;`,
        [nowIso]
      );

      // Only delete expired guest sessions that have no dependent quotes, orders, or addresses
      const sessRes = await client.query(
        `DELETE FROM guest_sessions gs
         WHERE gs.expires_at <= $1
           AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.guest_session_id = gs.id)
           AND NOT EXISTS (SELECT 1 FROM checkout_quotes q WHERE q.guest_session_id = gs.id)
           AND NOT EXISTS (SELECT 1 FROM delivery_addresses da WHERE da.guest_session_id = gs.id);`,
        [nowIso]
      );

      await client.query('COMMIT;');
      return {
        expiredIdempotencyRecords: idemRes.rowCount ?? 0,
        expiredDeliveryCoordinates: coordRes.rowCount ?? 0,
        expiredGuestOrderGrants: grantRes.rowCount ?? 0,
        expiredGuestSessions: sessRes.rowCount ?? 0,
      };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }
}

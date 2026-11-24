import type pg from 'pg';
import {
  type GuestSessionRecord,
  type GuestOrderGrantRecord,
} from '@arrival/contracts';

export class PgGuestSessionRepository {
  constructor(private readonly pool: pg.Pool) {}

  async createSession(record: GuestSessionRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO guest_sessions (
        id, token_digest, created_at, expires_at
      ) VALUES (
        $1, decode($2, 'hex'), $3, $4
      );`,
      [record.id, record.tokenDigest, record.createdAt, record.expiresAt]
    );
  }

  async getSessionByDigest(digest: string): Promise<GuestSessionRecord | null> {
    const res = await this.pool.query(
      `SELECT
        id, encode(token_digest, 'hex') as token_digest,
        created_at, expires_at, revoked_at
       FROM guest_sessions
       WHERE token_digest = decode($1, 'hex')
       LIMIT 1;`,
      [digest]
    );

    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0];
    return {
      id: row.id,
      tokenDigest: row.token_digest,
      createdAt: new Date(row.created_at).toISOString(),
      expiresAt: new Date(row.expires_at).toISOString(),
      revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    };
  }

  async createOrderGrant(grant: GuestOrderGrantRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO guest_order_grants (
        id, order_id, token_digest, scope, expires_at, created_at
      ) VALUES (
        $1, $2, decode($3, 'hex'), $4, $5, $6
      );`,
      [grant.id, grant.orderId, grant.tokenDigest, grant.scope, grant.expiresAt, grant.createdAt]
    );
  }

  async getOrderGrantByDigest(digest: string): Promise<GuestOrderGrantRecord | null> {
    const res = await this.pool.query(
      `SELECT
        id, order_id, encode(token_digest, 'hex') as token_digest,
        scope, expires_at, revoked_at, created_at
       FROM guest_order_grants
       WHERE token_digest = decode($1, 'hex')
       LIMIT 1;`,
      [digest]
    );

    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0];
    return {
      id: row.id,
      orderId: row.order_id,
      tokenDigest: row.token_digest,
      scope: row.scope as 'read_order' | 'cancel_order',
      expiresAt: new Date(row.expires_at).toISOString(),
      revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  async revokeSession(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE guest_sessions SET revoked_at = now() WHERE id = $1;`,
      [id]
    );
  }

  async revokeOrderGrant(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE guest_order_grants SET revoked_at = now() WHERE id = $1;`,
      [id]
    );
  }
}

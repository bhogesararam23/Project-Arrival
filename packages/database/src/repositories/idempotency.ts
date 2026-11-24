import type pg from 'pg';
import {
  type IdempotencyRecord,
  type IdempotencyStatus,
} from '@arrival/contracts';

export class PgIdempotencyRepository {
  constructor(private readonly pool: pg.Pool) {}

  async get(principalScope: string, operation: string, key: string): Promise<IdempotencyRecord | null> {
    const res = await this.pool.query(
      `SELECT
        id, principal_scope, operation, idempotency_key,
        encode(request_hash, 'hex') as request_hash,
        status, locked_until, response_status, response_body,
        created_at, expires_at
       FROM idempotency_records
       WHERE principal_scope = $1 AND operation = $2 AND idempotency_key = $3
       LIMIT 1;`,
      [principalScope, operation, key]
    );

    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0];
    return {
      id: row.id,
      principalScope: row.principal_scope,
      operation: row.operation,
      idempotencyKey: row.idempotency_key,
      requestHash: row.request_hash,
      status: (row.status || 'completed') as IdempotencyStatus,
      lockedUntil: row.locked_until ? new Date(row.locked_until).toISOString() : null,
      responseStatus: row.response_status ?? undefined,
      responseBody: row.response_body ?? undefined,
      createdAt: new Date(row.created_at).toISOString(),
      expiresAt: new Date(row.expires_at).toISOString(),
    };
  }

  async save(record: IdempotencyRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO idempotency_records (
        principal_scope, operation, idempotency_key, request_hash,
        status, locked_until, response_status, response_body,
        created_at, expires_at
      ) VALUES (
        $1, $2, $3, decode($4, 'hex'),
        $5, $6, $7, $8,
        $9, $10
      ) ON CONFLICT (principal_scope, operation, idempotency_key) DO UPDATE SET
        status = EXCLUDED.status,
        locked_until = EXCLUDED.locked_until,
        response_status = EXCLUDED.response_status,
        response_body = EXCLUDED.response_body;`,
      [
        record.principalScope,
        record.operation,
        record.idempotencyKey,
        record.requestHash,
        record.status,
        record.lockedUntil || null,
        record.responseStatus || null,
        record.responseBody ? JSON.stringify(record.responseBody) : null,
        record.createdAt,
        record.expiresAt,
      ]
    );
  }

  async tryReserve(
    principalScope: string,
    operation: string,
    key: string,
    requestHash: string,
    lockDurationMs: number
  ): Promise<{
    success: boolean;
    record?: IdempotencyRecord;
    conflictReason?: 'mismatch' | 'in_progress';
  }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN;');

      // Select existing record with row lock
      const existingRes = await client.query(
        `SELECT
          id, principal_scope, operation, idempotency_key,
          encode(request_hash, 'hex') as request_hash,
          status, locked_until, response_status, response_body,
          created_at, expires_at
         FROM idempotency_records
         WHERE principal_scope = $1 AND operation = $2 AND idempotency_key = $3
         FOR UPDATE;`,
        [principalScope, operation, key]
      );

      const now = Date.now();
      const lockUntilIso = new Date(now + lockDurationMs).toISOString();

      if (existingRes.rows.length > 0) {
        const row = existingRes.rows[0];
        const record: IdempotencyRecord = {
          id: row.id,
          principalScope: row.principal_scope,
          operation: row.operation,
          idempotencyKey: row.idempotency_key,
          requestHash: row.request_hash,
          status: (row.status || 'completed') as IdempotencyStatus,
          lockedUntil: row.locked_until ? new Date(row.locked_until).toISOString() : null,
          responseStatus: row.response_status ?? undefined,
          responseBody: row.response_body ?? undefined,
          createdAt: new Date(row.created_at).toISOString(),
          expiresAt: new Date(row.expires_at).toISOString(),
        };

        if (record.requestHash !== requestHash) {
          await client.query('COMMIT;');
          return { success: false, conflictReason: 'mismatch', record };
        }

        if (record.status === 'completed') {
          await client.query('COMMIT;');
          return { success: true, record };
        }

        if (record.status === 'pending') {
          const lockExpired = record.lockedUntil && new Date(record.lockedUntil).getTime() <= now;
          if (!lockExpired) {
            await client.query('COMMIT;');
            return { success: false, conflictReason: 'in_progress', record };
          }
          // Renew expired lock
          await client.query(
            `UPDATE idempotency_records SET locked_until = $1 WHERE id = $2;`,
            [lockUntilIso, record.id]
          );
          record.lockedUntil = lockUntilIso;
          await client.query('COMMIT;');
          return { success: true, record };
        }

        if (record.status === 'failed') {
          await client.query(
            `UPDATE idempotency_records SET status = 'pending', locked_until = $1, request_hash = decode($2, 'hex') WHERE id = $3;`,
            [lockUntilIso, requestHash, record.id]
          );
          record.status = 'pending';
          record.lockedUntil = lockUntilIso;
          record.requestHash = requestHash;
          await client.query('COMMIT;');
          return { success: true, record };
        }
      }

      // Insert fresh pending record
      const insertRes = await client.query(
        `INSERT INTO idempotency_records (
          principal_scope, operation, idempotency_key, request_hash,
          status, locked_until, created_at, expires_at
        ) VALUES (
          $1, $2, $3, decode($4, 'hex'),
          'pending', $5, now(), now() + interval '24 hours'
        ) RETURNING id, created_at, expires_at;`,
        [principalScope, operation, key, requestHash, lockUntilIso]
      );

      const inserted = insertRes.rows[0];
      const newRecord: IdempotencyRecord = {
        id: inserted.id,
        principalScope,
        operation,
        idempotencyKey: key,
        requestHash,
        status: 'pending',
        lockedUntil: lockUntilIso,
        createdAt: new Date(inserted.created_at).toISOString(),
        expiresAt: new Date(inserted.expires_at).toISOString(),
      };

      await client.query('COMMIT;');
      return { success: true, record: newRecord };
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  async complete(
    principalScope: string,
    operation: string,
    key: string,
    status: number,
    body: unknown
  ): Promise<void> {
    await this.pool.query(
      `UPDATE idempotency_records SET
        status = 'completed',
        locked_until = NULL,
        response_status = $1,
        response_body = $2
       WHERE principal_scope = $3 AND operation = $4 AND idempotency_key = $5;`,
      [status, JSON.stringify(body), principalScope, operation, key]
    );
  }

  async fail(principalScope: string, operation: string, key: string): Promise<void> {
    await this.pool.query(
      `UPDATE idempotency_records SET
        status = 'failed',
        locked_until = NULL
       WHERE principal_scope = $1 AND operation = $2 AND idempotency_key = $3;`,
      [principalScope, operation, key]
    );
  }
}

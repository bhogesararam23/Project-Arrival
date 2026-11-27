import type pg from 'pg';
import { type AuditRecord, type CompensationRecord } from '@arrival/contracts';

export class PgAuditRepository {
  constructor(private readonly pool: pg.Pool) {}

  async recordAudit(record: AuditRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_records (
        id, actor_id, actor_role, action, resource_type, resource_id,
        reason, request_id, occurred_at, metadata_redacted
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10
      );`,
      [
        record.id,
        record.actorId || null,
        record.actorRole,
        record.action,
        record.resourceType,
        record.resourceId,
        record.reason || null,
        record.requestId || null,
        record.occurredAt,
        JSON.stringify(record.metadataRedacted || {}),
      ]
    );
  }

  async listAuditByResource(resourceType: string, resourceId: string, limit = 50): Promise<AuditRecord[]> {
    const res = await this.pool.query(
      `SELECT id, actor_id, actor_role, action, resource_type, resource_id,
              reason, request_id, occurred_at, metadata_redacted
       FROM audit_records
       WHERE resource_type = $1 AND resource_id = $2
       ORDER BY occurred_at DESC
       LIMIT $3;`,
      [resourceType, resourceId, limit]
    );
    return res.rows.map((row) => ({
      id: row.id,
      actorId: row.actor_id || null,
      actorRole: row.actor_role,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      reason: row.reason || null,
      requestId: row.request_id || null,
      occurredAt: new Date(row.occurred_at).toISOString(),
      metadataRedacted: row.metadata_redacted || {},
    }));
  }

  async createCompensation(record: CompensationRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO compensation_records (
        id, order_id, operation_type, state, idempotency_key,
        provider_ref, attempts, last_error, reason, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11
      ) ON CONFLICT (order_id, operation_type, idempotency_key) DO NOTHING;`,
      [
        record.id,
        record.orderId,
        record.operationType,
        record.state,
        record.idempotencyKey,
        record.providerRef || null,
        record.attempts,
        record.lastError || null,
        record.reason,
        record.createdAt,
        record.updatedAt,
      ]
    );
  }

  async updateCompensationState(
    id: string,
    state: CompensationRecord['state'],
    providerRef?: string,
    lastError?: string
  ): Promise<void> {
    await this.pool.query(
      `UPDATE compensation_records
       SET state = $1,
           provider_ref = COALESCE($2, provider_ref),
           last_error = $3,
           attempts = attempts + 1,
           updated_at = now()
       WHERE id = $4;`,
      [state, providerRef || null, lastError || null, id]
    );
  }

  async listCompensationsByOrder(orderId: string): Promise<CompensationRecord[]> {
    const res = await this.pool.query(
      `SELECT id, order_id, operation_type, state, idempotency_key,
              provider_ref, attempts, last_error, reason, created_at, updated_at
       FROM compensation_records
       WHERE order_id = $1
       ORDER BY created_at DESC;`,
      [orderId]
    );
    return res.rows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      operationType: row.operation_type,
      state: row.state,
      idempotencyKey: row.idempotency_key,
      providerRef: row.provider_ref || null,
      attempts: Number(row.attempts),
      lastError: row.last_error || null,
      reason: row.reason,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
  }
}

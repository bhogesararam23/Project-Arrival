import type pg from 'pg';
import {
  type ProviderCapability,
  parseCountryCode,
  parseCurrencyCode,
} from '@arrival/contracts';

export class PgCapabilityRepository {
  constructor(private readonly pool: pg.Pool) {}

  async getCapability(
    providerKey: string,
    capability: string,
    countryCode: string,
    locationId?: string
  ): Promise<ProviderCapability | null> {
    const params: unknown[] = [providerKey, capability, countryCode.toUpperCase()];
    let sql = `
      SELECT
        id, provider_key, provider_account_ref, capability, country_code,
        merchant_id, location_id, currency, status, evidence_url,
        reviewed_by, reviewed_at, expires_at, revoked_at, revocation_reason
      FROM provider_capabilities
      WHERE provider_key = $1
        AND capability = $2
        AND country_code = $3
    `;

    if (locationId) {
      params.push(locationId);
      sql += ` AND (location_id IS NULL OR location_id = $4)`;
    } else {
      sql += ` AND location_id IS NULL`;
    }

    sql += ` ORDER BY location_id NULLS LAST LIMIT 1;`;

    const res = await this.pool.query(sql, params);
    if (res.rows.length === 0) {
      return null;
    }

    return mapCapabilityRow(res.rows[0]);
  }

  async listActiveCapabilities(): Promise<ProviderCapability[]> {
    const res = await this.pool.query(
      `SELECT
        id, provider_key, provider_account_ref, capability, country_code,
        merchant_id, location_id, currency, status, evidence_url,
        reviewed_by, reviewed_at, expires_at, revoked_at, revocation_reason
       FROM provider_capabilities
       WHERE status = 'production_verified'
         AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > now());`
    );

    return res.rows.map(mapCapabilityRow);
  }

  async listAllCapabilities(): Promise<ProviderCapability[]> {
    const res = await this.pool.query(
      `SELECT
        id, provider_key, provider_account_ref, capability, country_code,
        merchant_id, location_id, currency, status, evidence_url,
        reviewed_by, reviewed_at, expires_at, revoked_at, revocation_reason
       FROM provider_capabilities
       ORDER BY reviewed_at DESC;`
    );
    return res.rows.map(mapCapabilityRow);
  }

  async suspendCapability(id: string, reason: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE provider_capabilities
       SET status = 'suspended',
           revoked_at = now(),
           revocation_reason = $2
       WHERE id = $1
       RETURNING id;`,
      [id, reason]
    );
    return res.rows.length > 0;
  }
}

function mapCapabilityRow(row: any): ProviderCapability {
  return {
    id: row.id,
    providerKey: row.provider_key,
    capability: row.capability,
    countryCode: parseCountryCode(row.country_code),
    status: row.status,
    evidenceUrl: row.evidence_url,
    reviewedAt: new Date(row.reviewed_at).toISOString(),
    ...(row.provider_account_ref ? { providerAccountRef: row.provider_account_ref } : {}),
    ...(row.merchant_id ? { merchantId: row.merchant_id } : {}),
    ...(row.location_id ? { locationId: row.location_id } : {}),
    ...(row.currency ? { currency: parseCurrencyCode(row.currency) } : {}),
    ...(row.reviewed_by ? { reviewedBy: row.reviewed_by } : {}),
    ...(row.expires_at ? { expiresAt: new Date(row.expires_at).toISOString() } : {}),
    ...(row.revoked_at ? { revokedAt: new Date(row.revoked_at).toISOString() } : {}),
    ...(row.revocation_reason ? { revocationReason: row.revocation_reason } : {}),
  };
}

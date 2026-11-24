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
        id, provider_key, capability, country_code, location_id, currency,
        status, evidence_url, reviewed_at, expires_at
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

    const row = res.rows[0];
    return {
      id: row.id,
      providerKey: row.provider_key,
      capability: row.capability,
      countryCode: parseCountryCode(row.country_code),
      status: row.status,
      evidenceUrl: row.evidence_url,
      reviewedAt: new Date(row.reviewed_at).toISOString(),
      ...(row.location_id ? { locationId: row.location_id } : {}),
      ...(row.currency ? { currency: parseCurrencyCode(row.currency) } : {}),
      ...(row.expires_at ? { expiresAt: new Date(row.expires_at).toISOString() } : {}),
    };
  }

  async listActiveCapabilities(): Promise<ProviderCapability[]> {
    const res = await this.pool.query(
      `SELECT
        id, provider_key, capability, country_code, location_id, currency,
        status, evidence_url, reviewed_at, expires_at
       FROM provider_capabilities
       WHERE status = 'production_verified';`
    );

    return res.rows.map((row) => ({
      id: row.id,
      providerKey: row.provider_key,
      capability: row.capability,
      countryCode: parseCountryCode(row.country_code),
      status: row.status,
      evidenceUrl: row.evidence_url,
      reviewedAt: new Date(row.reviewed_at).toISOString(),
      ...(row.location_id ? { locationId: row.location_id } : {}),
      ...(row.currency ? { currency: parseCurrencyCode(row.currency) } : {}),
      ...(row.expires_at ? { expiresAt: new Date(row.expires_at).toISOString() } : {}),
    }));
  }
}

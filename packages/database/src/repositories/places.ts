import type pg from 'pg';
import {
  type Venue,
  type MerchantLocation,
  type SearchQuery,
  type OrderabilityStatus,
  parseCountryCode,
} from '@arrival/contracts';

function deriveOrderability(row: {
  has_verified_order_cap: boolean;
  has_published_catalogue: boolean;
  loc_listing_status: string;
}): OrderabilityStatus {
  if (row.has_verified_order_cap) {
    return 'native_orderable';
  }
  if (row.has_published_catalogue) {
    return 'catalogue_only';
  }
  if (row.loc_listing_status === 'pending_review') {
    return 'capability_pending';
  }
  return 'not_integrated';
}

export class PgPlacesRepository {
  constructor(private readonly pool: pg.Pool) {}

  async search(query: SearchQuery): Promise<{ venues: Venue[]; locations: MerchantLocation[]; nextCursor?: string }> {
    const qTerm = `%${query.q.trim().toLowerCase()}%`;
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const offset = query.cursor ? Math.max(0, Number.parseInt(query.cursor, 10) || 0) : 0;

    const params: unknown[] = [qTerm];
    let sql = `
      SELECT
        v.id as venue_id,
        v.display_name as venue_display_name,
        v.normalized_name as venue_normalized_name,
        v.listing_status as venue_listing_status,
        v.primary_language,
        v.created_at as venue_created_at,
        v.updated_at as venue_updated_at,
        ml.id as loc_id,
        ml.merchant_id,
        ml.display_name as loc_display_name,
        ml.country_code as loc_country_code,
        ml.public_address,
        ST_Y(ml.location::geometry) as latitude,
        ST_X(ml.location::geometry) as longitude,
        ml.timezone,
        ml.listing_status as loc_listing_status,
        ml.verified_at,
        ml.created_at as loc_created_at,
        EXISTS (
          SELECT 1 FROM provider_capabilities pc
          WHERE pc.capability = 'order_create'
            AND pc.country_code = ml.country_code
            AND (pc.location_id IS NULL OR pc.location_id = ml.id)
            AND pc.status = 'production_verified'
            AND pc.revoked_at IS NULL
            AND (pc.expires_at IS NULL OR pc.expires_at > now())
        ) as has_verified_order_cap,
        EXISTS (
          SELECT 1 FROM catalogues c
          WHERE c.location_id = ml.id AND c.status = 'published'
        ) as has_published_catalogue
      FROM venues v
      JOIN merchant_locations ml ON ml.venue_id = v.id
      WHERE (LOWER(v.display_name) LIKE $1 OR LOWER(v.normalized_name) LIKE $1)
        AND v.listing_status = 'verified'
    `;

    if (query.country) {
      params.push(query.country.toUpperCase());
      sql += ` AND ml.country_code = $${params.length}`;
    }

    if (query.lat !== undefined && query.lon !== undefined && query.radiusMeters !== undefined) {
      params.push(query.lon, query.lat, query.radiusMeters);
      const lonIdx = params.length - 2;
      const latIdx = params.length - 1;
      const radIdx = params.length;
      sql += ` AND ST_DWithin(ml.location, ST_SetSRID(ST_MakePoint($${lonIdx}, $${latIdx}), 4326)::geography, $${radIdx})`;
    }

    if (query.lat !== undefined && query.lon !== undefined) {
      params.push(query.lon, query.lat);
      const lonIdx = params.length - 1;
      const latIdx = params.length;
      sql += ` ORDER BY ST_Distance(ml.location, ST_SetSRID(ST_MakePoint($${lonIdx}, $${latIdx}), 4326)::geography) ASC, ml.id ASC`;
    } else {
      sql += ` ORDER BY v.display_name ASC, ml.id ASC`;
    }

    params.push(limit + 1, offset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length};`;

    const res = await this.pool.query(sql, params);
    const hasMore = res.rows.length > limit;
    const rows = hasMore ? res.rows.slice(0, limit) : res.rows;

    const venuesMap = new Map<string, Venue>();
    const locations: MerchantLocation[] = [];

    for (const row of rows) {
      if (!venuesMap.has(row.venue_id)) {
        venuesMap.set(row.venue_id, {
          id: row.venue_id,
          displayName: row.venue_display_name,
          normalizedName: row.venue_normalized_name,
          listingStatus: row.venue_listing_status,
          primaryLanguage: row.primary_language || 'en',
          createdAt: new Date(row.venue_created_at).toISOString(),
          updatedAt: new Date(row.venue_updated_at).toISOString(),
        });
      }

      const loc: MerchantLocation = {
        id: row.loc_id,
        venueId: row.venue_id,
        displayName: row.loc_display_name,
        countryCode: parseCountryCode(row.loc_country_code),
        publicAddress: row.public_address,
        coordinates: {
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
        },
        timezone: row.timezone,
        listingStatus: row.loc_listing_status,
        orderability: deriveOrderability(row),
        createdAt: new Date(row.loc_created_at).toISOString(),
        ...(row.merchant_id ? { merchantId: row.merchant_id } : {}),
        ...(row.verified_at ? { verifiedAt: new Date(row.verified_at).toISOString() } : {}),
      };

      locations.push(loc);
    }

    return {
      venues: Array.from(venuesMap.values()),
      locations,
      ...(hasMore ? { nextCursor: String(offset + limit) } : {}),
    };
  }

  async getLocation(id: string): Promise<MerchantLocation | null> {
    const res = await this.pool.query(
      `
      SELECT
        ml.id,
        ml.venue_id,
        ml.merchant_id,
        ml.display_name,
        ml.country_code,
        ml.public_address,
        ST_Y(ml.location::geometry) as latitude,
        ST_X(ml.location::geometry) as longitude,
        ml.timezone,
        ml.listing_status as loc_listing_status,
        ml.verified_at,
        ml.created_at,
        EXISTS (
          SELECT 1 FROM provider_capabilities pc
          WHERE pc.capability = 'order_create'
            AND pc.country_code = ml.country_code
            AND (pc.location_id IS NULL OR pc.location_id = ml.id)
            AND pc.status = 'production_verified'
            AND pc.revoked_at IS NULL
            AND (pc.expires_at IS NULL OR pc.expires_at > now())
        ) as has_verified_order_cap,
        EXISTS (
          SELECT 1 FROM catalogues c
          WHERE c.location_id = ml.id AND c.status = 'published'
        ) as has_published_catalogue
      FROM merchant_locations ml
      WHERE ml.id = $1
      LIMIT 1;
      `,
      [id]
    );

    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0];
    return {
      id: row.id,
      venueId: row.venue_id,
      displayName: row.display_name,
      countryCode: parseCountryCode(row.country_code),
      publicAddress: row.public_address,
      coordinates: {
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
      },
      timezone: row.timezone,
      listingStatus: row.loc_listing_status,
      orderability: deriveOrderability(row),
      createdAt: new Date(row.created_at).toISOString(),
      ...(row.merchant_id ? { merchantId: row.merchant_id } : {}),
      ...(row.verified_at ? { verifiedAt: new Date(row.verified_at).toISOString() } : {}),
    };
  }

  async getVenue(id: string): Promise<Venue | null> {
    const res = await this.pool.query(
      `SELECT id, display_name, normalized_name, listing_status, primary_language, created_at, updated_at FROM venues WHERE id = $1 LIMIT 1;`,
      [id]
    );

    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0];
    return {
      id: row.id,
      displayName: row.display_name,
      normalizedName: row.normalized_name,
      listingStatus: row.listing_status,
      primaryLanguage: row.primary_language || 'en',
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}

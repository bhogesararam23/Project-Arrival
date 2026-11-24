import type pg from 'pg';
import {
  type Venue,
  type MerchantLocation,
  type SearchQuery,
  parseCountryCode,
} from '@arrival/contracts';

export class PgPlacesRepository {
  constructor(private readonly pool: pg.Pool) {}

  async search(query: SearchQuery): Promise<{ venues: Venue[]; locations: MerchantLocation[]; nextCursor?: string }> {
    const qTerm = `%${query.q.trim().toLowerCase()}%`;
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
        ml.created_at as loc_created_at
      FROM venues v
      JOIN merchant_locations ml ON ml.venue_id = v.id
      WHERE (LOWER(v.display_name) LIKE $1 OR LOWER(v.normalized_name) LIKE $1)
        AND v.listing_status = 'verified'
    `;

    if (query.country) {
      params.push(query.country.toUpperCase());
      sql += ` AND ml.country_code = $${params.length}`;
    }

    if (query.lat !== undefined && query.lon !== undefined) {
      params.push(query.lon, query.lat);
      const lonIdx = params.length - 1;
      const latIdx = params.length;
      sql += ` ORDER BY ST_Distance(ml.location, ST_SetSRID(ST_MakePoint($${lonIdx}, $${latIdx}), 4326)::geography) ASC`;
    } else {
      sql += ` ORDER BY v.display_name ASC`;
    }

    sql += ` LIMIT 50;`;

    const res = await this.pool.query(sql, params);
    const venuesMap = new Map<string, Venue>();
    const locations: MerchantLocation[] = [];

    for (const row of res.rows) {
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
        orderability: 'native_orderable',
        createdAt: new Date(row.loc_created_at).toISOString(),
        ...(row.merchant_id ? { merchantId: row.merchant_id } : {}),
        ...(row.verified_at ? { verifiedAt: new Date(row.verified_at).toISOString() } : {}),
      };

      locations.push(loc);
    }

    return {
      venues: Array.from(venuesMap.values()),
      locations,
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
        ml.listing_status,
        ml.verified_at,
        ml.created_at
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
      listingStatus: row.listing_status,
      orderability: 'native_orderable',
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

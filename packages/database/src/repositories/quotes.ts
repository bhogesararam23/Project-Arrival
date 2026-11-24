import type pg from 'pg';
import { type Quote, parseCurrencyCode } from '@arrival/contracts';

export class PgQuotesRepository {
  constructor(private readonly pool: pg.Pool) {}

  async save(
    quote: Quote,
    metadata: {
      locationId: string;
      destinationCountry: string;
      items: any[];
      guestSessionId?: string;
    }
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO checkout_quotes (
        id, location_id, destination_country, currency,
        subtotal_minor, tax_minor, delivery_minor, service_fee_minor, total_minor,
        expires_at, delivery_address_id, catalogue_id, guest_session_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        gen_random_uuid(),
        (SELECT id FROM catalogues WHERE location_id = $2 AND version = $11 LIMIT 1),
        $12
      ) ON CONFLICT (id) DO UPDATE SET
        subtotal_minor = EXCLUDED.subtotal_minor,
        tax_minor = EXCLUDED.tax_minor,
        delivery_minor = EXCLUDED.delivery_minor,
        total_minor = EXCLUDED.total_minor,
        expires_at = EXCLUDED.expires_at;`,
      [
        quote.quoteId,
        metadata.locationId,
        metadata.destinationCountry,
        quote.currency,
        quote.subtotal.amountMinor,
        quote.tax.amountMinor,
        quote.delivery.amountMinor,
        '50', // service fee
        quote.total.amountMinor,
        quote.expiresAt,
        quote.catalogueVersion,
        metadata.guestSessionId || null,
      ]
    );
  }

  async getById(quoteId: string): Promise<{
    quote: Quote;
    locationId: string;
    destinationCountry: string;
    items: any[];
    consumedAt?: string;
  } | null> {
    const res = await this.pool.query(
      `SELECT
        cq.id,
        cq.location_id,
        cq.destination_country,
        cq.currency,
        cq.subtotal_minor,
        cq.tax_minor,
        cq.delivery_minor,
        cq.service_fee_minor,
        cq.total_minor,
        cq.expires_at,
        cq.consumed_at,
        c.version as catalogue_version
       FROM checkout_quotes cq
       LEFT JOIN catalogues c ON c.id = cq.catalogue_id
       WHERE cq.id = $1
       LIMIT 1;`,
      [quoteId]
    );

    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0];
    const quote: Quote = {
      quoteId: row.id,
      currency: parseCurrencyCode(row.currency),
      subtotal: { amountMinor: row.subtotal_minor.toString(), currency: row.currency },
      tax: { amountMinor: row.tax_minor.toString(), currency: row.currency },
      delivery: { amountMinor: row.delivery_minor.toString(), currency: row.currency },
      total: { amountMinor: row.total_minor.toString(), currency: row.currency },
      expiresAt: new Date(row.expires_at).toISOString(),
      catalogueVersion: Number(row.catalogue_version || 1),
    };

    return {
      quote,
      locationId: row.location_id,
      destinationCountry: row.destination_country,
      items: [],
      ...(row.consumed_at ? { consumedAt: new Date(row.consumed_at).toISOString() } : {}),
    };
  }

  async markConsumed(quoteId: string): Promise<void> {
    await this.pool.query(
      `UPDATE checkout_quotes SET consumed_at = now() WHERE id = $1;`,
      [quoteId]
    );
  }
}

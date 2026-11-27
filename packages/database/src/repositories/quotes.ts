import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  type Quote,
  type QuoteLineSnapshot,
  type PricingBreakdown,
  parseCurrencyCode,
} from '@arrival/contracts';

export interface SaveQuoteMetadata {
  locationId: string;
  destinationCountry: string;
  items: QuoteLineSnapshot[];
  guestSessionId?: string | undefined;
  customerId?: string | undefined;
  deliveryAddressId?: string | undefined;
  deliveryAddressFormatted?: string | undefined;
  pricingBreakdown?: PricingBreakdown | undefined;
}

export interface PersistedQuoteRecord {
  quote: Quote;
  locationId: string;
  destinationCountry: string;
  items: QuoteLineSnapshot[];
  guestSessionId?: string | undefined;
  customerId?: string | undefined;
  deliveryAddressId?: string | undefined;
  consumedAt?: string | undefined;
}

export class PgQuotesRepository {
  constructor(private readonly pool: pg.Pool) {}

  async save(quote: Quote, metadata: SaveQuoteMetadata): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN;');

      let deliveryAddressId = metadata.deliveryAddressId;
      if (!deliveryAddressId) {
        deliveryAddressId = randomUUID();
        const addrPayload = Buffer.from(
          JSON.stringify({ formattedAddress: metadata.deliveryAddressFormatted || 'Destination provided at quote' }),
          'utf8'
        );
        const recipientPayload = Buffer.from('{}', 'utf8');

        await client.query(
          `INSERT INTO delivery_addresses (
            id, customer_id, guest_session_id, country_code, address_ciphertext, recipient_ciphertext
          ) VALUES ($1, $2, $3, $4, $5, $6);`,
          [
            deliveryAddressId,
            metadata.customerId || null,
            metadata.guestSessionId || null,
            metadata.destinationCountry.toUpperCase(),
            addrPayload,
            recipientPayload,
          ]
        );
      }

      const serviceFeeMinor = quote.serviceFee?.amountMinor ?? metadata.pricingBreakdown?.serviceFee.amountMinor ?? '0';

      await client.query(
        `INSERT INTO checkout_quotes (
          id, location_id, destination_country, currency,
          subtotal_minor, tax_minor, delivery_minor, service_fee_minor, total_minor,
          provider_quote_ref, expires_at, delivery_address_id, catalogue_id,
          guest_session_id, customer_id, items_snapshot, pricing_breakdown
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8, $9,
          $10, $11, $12,
          (SELECT id FROM catalogues WHERE location_id = $2 AND version = $13 LIMIT 1),
          $14, $15, $16, $17
        ) ON CONFLICT (id) DO UPDATE SET
          subtotal_minor = EXCLUDED.subtotal_minor,
          tax_minor = EXCLUDED.tax_minor,
          delivery_minor = EXCLUDED.delivery_minor,
          service_fee_minor = EXCLUDED.service_fee_minor,
          total_minor = EXCLUDED.total_minor,
          provider_quote_ref = EXCLUDED.provider_quote_ref,
          expires_at = EXCLUDED.expires_at,
          items_snapshot = EXCLUDED.items_snapshot,
          pricing_breakdown = EXCLUDED.pricing_breakdown;`,
        [
          quote.quoteId,
          metadata.locationId,
          metadata.destinationCountry.toUpperCase(),
          quote.currency,
          quote.subtotal.amountMinor,
          quote.tax.amountMinor,
          quote.delivery.amountMinor,
          serviceFeeMinor,
          quote.total.amountMinor,
          quote.deliveryQuoteRef || null,
          quote.expiresAt,
          deliveryAddressId,
          quote.catalogueVersion,
          metadata.guestSessionId || null,
          metadata.customerId || null,
          JSON.stringify(metadata.items || []),
          JSON.stringify(metadata.pricingBreakdown || {}),
        ]
      );

      await client.query('COMMIT;');
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }
  }

  async getById(quoteId: string): Promise<PersistedQuoteRecord | null> {
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
        cq.provider_quote_ref,
        cq.expires_at,
        cq.consumed_at,
        cq.delivery_address_id,
        cq.guest_session_id,
        cq.customer_id,
        cq.items_snapshot,
        cq.pricing_breakdown,
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
    const pricing = (row.pricing_breakdown || {}) as Partial<PricingBreakdown>;
    const quote: Quote = {
      quoteId: row.id,
      currency: parseCurrencyCode(row.currency),
      subtotal: { amountMinor: row.subtotal_minor.toString(), currency: row.currency },
      tax: { amountMinor: row.tax_minor.toString(), currency: row.currency },
      delivery: { amountMinor: row.delivery_minor.toString(), currency: row.currency },
      serviceFee: { amountMinor: row.service_fee_minor.toString(), currency: row.currency },
      total: { amountMinor: row.total_minor.toString(), currency: row.currency },
      expiresAt: new Date(row.expires_at).toISOString(),
      catalogueVersion: Number(row.catalogue_version || 1),
      ...(row.provider_quote_ref ? { deliveryQuoteRef: row.provider_quote_ref } : {}),
      ...(pricing.taxInclusive !== undefined ? { taxInclusive: pricing.taxInclusive } : {}),
    };

    return {
      quote,
      locationId: row.location_id,
      destinationCountry: row.destination_country,
      items: Array.isArray(row.items_snapshot) ? row.items_snapshot : [],
      ...(row.guest_session_id ? { guestSessionId: row.guest_session_id } : {}),
      ...(row.customer_id ? { customerId: row.customer_id } : {}),
      ...(row.delivery_address_id ? { deliveryAddressId: row.delivery_address_id } : {}),
      ...(row.consumed_at ? { consumedAt: new Date(row.consumed_at).toISOString() } : {}),
    };
  }

  /**
   * Atomically consumes an unexpired, unconsumed quote.
   * Returns true if consumed by this call, false if already consumed or expired.
   */
  async markConsumed(quoteId: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE checkout_quotes
       SET consumed_at = now(), version = version + 1
       WHERE id = $1 AND consumed_at IS NULL AND expires_at > now()
       RETURNING id;`,
      [quoteId]
    );
    return res.rows.length > 0;
  }
}

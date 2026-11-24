import { randomUUID } from 'node:crypto';
import {
  Money,
  ArrivalError,
  parseCountryCode,
  isCapabilityActive,
  type QuoteRequest,
  type Quote,
} from '@arrival/contracts';
import type {
  IPlacesRepository,
  ICatalogueRepository,
  IQuotesRepository,
  ICapabilityRepository,
} from '../repositories/interfaces.js';
import type { IFulfilmentAdapter } from '../adapters/provider-adapters.js';

export class QuoteService {
  constructor(
    private readonly placesRepo: IPlacesRepository,
    private readonly catalogueRepo: ICatalogueRepository,
    private readonly quotesRepo: IQuotesRepository,
    private readonly capabilityRepo: ICapabilityRepository,
    private readonly fulfilmentAdapter: IFulfilmentAdapter,
    private readonly quoteTtlSeconds = 900
  ) {}

  async createQuote(request: QuoteRequest, guestSessionId?: string): Promise<Quote> {
    // 1. Verify location
    const location = await this.placesRepo.getLocation(request.locationId);
    if (!location) {
      throw ArrivalError.notFound(`Merchant location not found: ${request.locationId}`);
    }

    // 2. Strict Cross-Border Gate
    const destinationCountry = parseCountryCode(request.destination.countryCode);
    if (destinationCountry !== location.countryCode) {
      // Check if explicit cross-border capability is approved
      const crossBorderCap = await this.capabilityRepo.getCapability(
        'platform_cross_border',
        'cross_border_ordering',
        destinationCountry,
        location.id
      );
      if (!crossBorderCap || !isCapabilityActive(crossBorderCap)) {
        throw ArrivalError.unprocessableEntity(
          `Cross-border delivery from ${location.countryCode} to ${destinationCountry} is not authorized for this merchant route`,
          'CROSS_BORDER_BLOCKED'
        );
      }
    }

    // 3. Verify catalogue and version
    const catalogue = await this.catalogueRepo.getCatalogueByLocationAndVersion(
      location.id,
      request.catalogueVersion
    );
    if (!catalogue || catalogue.status !== 'published') {
      throw ArrivalError.unprocessableEntity(
        `Catalogue version ${request.catalogueVersion} is retired or does not match current menu`,
        'STALE_CATALOGUE'
      );
    }

    // 4. Calculate subtotal in minor units
    const itemMap = new Map(catalogue.items.map((i) => [i.id, i]));
    let subtotal = Money.zero(catalogue.currency);

    for (const line of request.items) {
      const item = itemMap.get(line.menuItemId);
      if (!item) {
        throw ArrivalError.notFound(`Menu item not found in catalogue: ${line.menuItemId}`);
      }
      if (!item.available) {
        throw ArrivalError.unprocessableEntity(`Item "${item.name}" is currently unavailable`);
      }
      if (line.quantity < 1 || line.quantity > 100) {
        throw ArrivalError.badRequest(`Invalid line quantity: ${line.quantity}`);
      }

      const linePrice = Money.fromJson(item.price).multiply(line.quantity);
      subtotal = subtotal.add(linePrice);
    }

    // 5. Calculate tax and fees
    // In UK pilot: 20% VAT inclusive/derived
    const tax = subtotal.multiply(0.2);
    const serviceFee = new Money(50n, catalogue.currency); // 50p service fee

    // 6. Request delivery quote from fulfilment provider
    const deliveryQuote = await this.fulfilmentAdapter.quoteDelivery({
      pickupCoordinates: location.coordinates,
      destinationCountry,
      currency: catalogue.currency,
    });

    const total = subtotal.add(tax).add(deliveryQuote.fee).add(serviceFee);

    const expiresAt = new Date(Date.now() + this.quoteTtlSeconds * 1000).toISOString();
    const quoteId = randomUUID();

    const quote: Quote = {
      quoteId,
      currency: catalogue.currency,
      subtotal: subtotal.toJson(),
      tax: tax.toJson(),
      delivery: deliveryQuote.fee.toJson(),
      total: total.toJson(),
      expiresAt,
      catalogueVersion: catalogue.version,
    };

    await this.quotesRepo.save(quote, {
      locationId: location.id,
      destinationCountry,
      items: request.items,
      guestSessionId,
    });

    return quote;
  }
}

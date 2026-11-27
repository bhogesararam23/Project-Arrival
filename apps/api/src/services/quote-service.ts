import { randomUUID } from 'node:crypto';
import {
  Money,
  ArrivalError,
  parseCountryCode,
  isCapabilityActive,
  type QuoteRequest,
  type Quote,
  type QuoteLineSnapshot,
  type ModifierSelectionSnapshot,
} from '@arrival/contracts';
import type {
  IPlacesRepository,
  ICatalogueRepository,
  IQuotesRepository,
  ICapabilityRepository,
} from '../repositories/interfaces.js';
import type { IFulfilmentAdapter } from '../adapters/provider-adapters.js';
import { DefaultPricingPolicy, type IPricingPolicy } from './pricing-policy.js';

export class QuoteService {
  constructor(
    private readonly placesRepo: IPlacesRepository,
    private readonly catalogueRepo: ICatalogueRepository,
    private readonly quotesRepo: IQuotesRepository,
    private readonly capabilityRepo: ICapabilityRepository,
    private readonly fulfilmentAdapter: IFulfilmentAdapter,
    private readonly pricingPolicy: IPricingPolicy = new DefaultPricingPolicy(),
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

    // 4. Calculate subtotal in minor units and validate modifiers
    const itemMap = new Map(catalogue.items.map((i) => [i.id, i]));
    let subtotal = Money.zero(catalogue.currency);
    const enrichedItems: QuoteLineSnapshot[] = [];

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

      let unitPrice = Money.fromJson(item.price);
      const selectedModIds = new Set(line.modifierOptionIds || []);
      const claimedModIds = new Set<string>();
      const modifierSnapshots: ModifierSelectionSnapshot[] = [];

      for (const group of item.modifierGroups || []) {
        const optionMap = new Map(group.options.map((o) => [o.id, o]));
        let selectionsInGroup = 0;

        for (const optId of selectedModIds) {
          const opt = optionMap.get(optId);
          if (opt) {
            if (!opt.available) {
              throw ArrivalError.unprocessableEntity(
                `Modifier option "${opt.name}" in group "${group.name}" is currently unavailable`
              );
            }
            selectionsInGroup++;
            claimedModIds.add(optId);
            unitPrice = unitPrice.add(Money.fromJson(opt.priceDelta));
            modifierSnapshots.push({
              optionId: opt.id,
              optionName: opt.name,
              priceDelta: opt.priceDelta,
            });
          }
        }

        if (selectionsInGroup < group.minimumSelections) {
          throw ArrivalError.badRequest(
            `Modifier group "${group.name}" requires at least ${group.minimumSelections} selection(s), but ${selectionsInGroup} selected`
          );
        }
        if (selectionsInGroup > group.maximumSelections) {
          throw ArrivalError.badRequest(
            `Modifier group "${group.name}" allows at most ${group.maximumSelections} selection(s), but ${selectionsInGroup} selected`
          );
        }
      }

      for (const optId of selectedModIds) {
        if (!claimedModIds.has(optId)) {
          throw ArrivalError.badRequest(
            `Modifier option "${optId}" does not belong to any modifier group for item "${item.name}"`
          );
        }
      }

      const lineTotal = unitPrice.multiply(line.quantity);
      subtotal = subtotal.add(lineTotal);

      enrichedItems.push({
        menuItemId: item.id,
        name: item.name,
        quantity: line.quantity,
        unitPriceMinor: unitPrice.amountMinor.toString(),
        totalPriceMinor: lineTotal.amountMinor.toString(),
        ...(line.modifierOptionIds ? { modifierOptionIds: line.modifierOptionIds } : {}),
        ...(modifierSnapshots.length > 0 ? { modifiers: modifierSnapshots } : {}),
      });
    }

    // 5. Request delivery quote from fulfilment provider
    const deliveryQuote = await this.fulfilmentAdapter.quoteDelivery({
      pickupCoordinates: location.coordinates,
      destinationCountry,
      currency: catalogue.currency,
      deliveryAddress: request.destination.address,
    });

    if (!deliveryQuote.serviceable) {
      throw ArrivalError.unprocessableEntity(
        `Destination is outside the serviceable delivery area for ${location.displayName}`,
        'DELIVERY_UNSERVICEABLE'
      );
    }

    // 6. Build auditable pricing breakdown via policy
    const breakdown = this.pricingPolicy.buildBreakdown(
      subtotal,
      deliveryQuote.fee,
      destinationCountry,
      catalogue.currency
    );

    const expiresAt = new Date(Date.now() + this.quoteTtlSeconds * 1000).toISOString();
    const quoteId = randomUUID();

    const quote: Quote = {
      quoteId,
      currency: catalogue.currency,
      subtotal: breakdown.subtotal,
      tax: breakdown.tax,
      delivery: breakdown.deliveryFee,
      serviceFee: breakdown.serviceFee,
      total: breakdown.total,
      expiresAt,
      catalogueVersion: catalogue.version,
      deliveryQuoteRef: deliveryQuote.quoteRef,
      taxInclusive: breakdown.taxInclusive,
    };

    await this.quotesRepo.save(quote, {
      locationId: location.id,
      destinationCountry,
      items: enrichedItems,
      guestSessionId,
      deliveryAddressFormatted: request.destination.address.formattedAddress,
      pricingBreakdown: breakdown,
    });

    return quote;
  }
}

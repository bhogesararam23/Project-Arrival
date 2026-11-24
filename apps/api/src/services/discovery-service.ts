import type { SearchQuery, SearchResponse, SearchItem } from '@arrival/contracts';
import type { IPlacesRepository } from '../repositories/interfaces.js';

export class DiscoveryService {
  constructor(private readonly placesRepo: IPlacesRepository) {}

  async search(query: SearchQuery): Promise<SearchResponse> {
    const { venues, locations, nextCursor } = await this.placesRepo.search(query);
    const venueMap = new Map(venues.map((v) => [v.id, v]));

    const items: SearchItem[] = locations.map((loc) => {
      const venue = venueMap.get(loc.venueId);
      const name = venue ? venue.displayName : loc.displayName;
      const isDiscoverable = loc.listingStatus === 'verified' && (!venue || venue.listingStatus === 'verified');

      return {
        venueId: loc.venueId,
        locationId: loc.id,
        name,
        countryCode: loc.countryCode,
        address: loc.publicAddress.formattedAddress,
        discoverable: isDiscoverable,
        lastVerifiedAt: loc.verifiedAt ?? null,
        orderability: loc.orderability,
        attribution: ['Arrival Licensed Core Registry', 'Direct Merchant Submission'],
      };
    });

    return {
      items,
      nextCursor: nextCursor ?? null,
    };
  }

  async getLocation(locationId: string) {
    return this.placesRepo.getLocation(locationId);
  }
}

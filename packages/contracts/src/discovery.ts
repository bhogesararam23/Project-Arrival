import type { CountryCode } from './iso.js';

export type ListingStatus =
  | 'pending_review'
  | 'verified'
  | 'temporarily_unavailable'
  | 'suspended'
  | 'closed';

export type OrderabilityStatus =
  | 'not_integrated'
  | 'catalogue_only'
  | 'capability_pending'
  | 'native_orderable';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface PublicAddress {
  formattedAddress: string;
  locality?: string;
  administrativeArea?: string;
  postalCode?: string;
  countryCode: CountryCode;
}

export interface Venue {
  id: string;
  displayName: string;
  normalizedName: string;
  listingStatus: ListingStatus;
  primaryLanguage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MerchantLocation {
  id: string;
  venueId: string;
  merchantId?: string;
  displayName: string;
  countryCode: CountryCode;
  publicAddress: PublicAddress;
  coordinates: GeoPoint;
  timezone: string;
  listingStatus: ListingStatus;
  orderability: OrderabilityStatus;
  verifiedAt?: string;
  createdAt: string;
}

export interface SearchQuery {
  q: string;
  country?: string;
  lat?: number;
  lon?: number;
  radiusMeters?: number;
  cursor?: string;
  limit?: number;
}

export interface SearchItem {
  venueId: string;
  locationId: string;
  name: string;
  countryCode: string;
  address: string;
  distanceMeters?: number;
  discoverable: boolean;
  lastVerifiedAt?: string | null;
  orderability: OrderabilityStatus;
  attribution: string[];
}

export interface SearchResponse {
  items: SearchItem[];
  nextCursor?: string | null;
}

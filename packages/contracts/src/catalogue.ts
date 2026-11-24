import type { CurrencyCode } from './iso.js';
import type { MoneyJson } from './money.js';

export type CatalogueStatus = 'draft' | 'published' | 'retired';

export interface ModifierOption {
  id: string;
  name: string;
  priceDelta: MoneyJson;
  available: boolean;
}

export interface ModifierGroup {
  id: string;
  name: string;
  minimumSelections: number;
  maximumSelections: number;
  options: ModifierOption[];
}

export interface MenuItem {
  id: string;
  externalItemKey?: string;
  name: string;
  description?: string;
  price: MoneyJson;
  available: boolean;
  allergens: string[];
  sortOrder: number;
  modifierGroups: ModifierGroup[];
}

export interface Catalogue {
  id: string;
  locationId: string;
  version: number;
  currency: CurrencyCode;
  status: CatalogueStatus;
  publishedAt?: string;
  validUntil?: string;
  items: MenuItem[];
}

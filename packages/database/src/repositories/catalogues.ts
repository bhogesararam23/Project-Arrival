import type pg from 'pg';
import {
  type Catalogue,
  type MenuItem,
  type ModifierGroup,
  type ModifierOption,
  parseCurrencyCode,
} from '@arrival/contracts';

export class PgCatalogueRepository {
  constructor(private readonly pool: pg.Pool) {}

  async getCatalogueByLocation(locationId: string): Promise<Catalogue | null> {
    const catRes = await this.pool.query(
      `SELECT id, location_id, version, currency, status, published_at, valid_until
       FROM catalogues
       WHERE location_id = $1 AND status = 'published'
       ORDER BY version DESC LIMIT 1;`,
      [locationId]
    );

    if (catRes.rows.length === 0) {
      return null;
    }

    return this.hydrateCatalogue(catRes.rows[0]);
  }

  async getCatalogueByLocationAndVersion(locationId: string, version: number): Promise<Catalogue | null> {
    const catRes = await this.pool.query(
      `SELECT id, location_id, version, currency, status, published_at, valid_until
       FROM catalogues
       WHERE location_id = $1 AND version = $2 LIMIT 1;`,
      [locationId, version]
    );

    if (catRes.rows.length === 0) {
      return null;
    }

    return this.hydrateCatalogue(catRes.rows[0]);
  }

  private async hydrateCatalogue(catRow: any): Promise<Catalogue> {
    const catalogueId = catRow.id;

    // Fetch items
    const itemsRes = await this.pool.query(
      `SELECT id, external_item_key, name, description, price_minor, available, allergens, sort_order
       FROM menu_items
       WHERE catalogue_id = $1
       ORDER BY sort_order ASC, name ASC;`,
      [catalogueId]
    );

    // Fetch modifier groups and options
    const modGroupsRes = await this.pool.query(
      `SELECT id, name, minimum_selections, maximum_selections
       FROM modifier_groups
       WHERE catalogue_id = $1;`,
      [catalogueId]
    );

    const groupIds = modGroupsRes.rows.map((g) => g.id);
    let optionsByGroup = new Map<string, ModifierOption[]>();

    if (groupIds.length > 0) {
      const optionsRes = await this.pool.query(
        `SELECT id, group_id, name, price_delta_minor, available
         FROM modifier_options
         WHERE group_id = ANY($1::uuid[]);`,
        [groupIds]
      );

      for (const optRow of optionsRes.rows) {
        const list = optionsByGroup.get(optRow.group_id) || [];
        list.push({
          id: optRow.id,
          name: optRow.name,
          priceDelta: {
            amountMinor: optRow.price_delta_minor.toString(),
            currency: catRow.currency,
          },
          available: optRow.available,
        });
        optionsByGroup.set(optRow.group_id, list);
      }
    }

    const modifierGroupMap = new Map<string, ModifierGroup>();
    for (const gRow of modGroupsRes.rows) {
      modifierGroupMap.set(gRow.id, {
        id: gRow.id,
        name: gRow.name,
        minimumSelections: gRow.minimum_selections,
        maximumSelections: gRow.maximum_selections,
        options: optionsByGroup.get(gRow.id) || [],
      });
    }

    // Fetch item modifier group linkages
    const linkagesRes = await this.pool.query(
      `SELECT img.item_id, img.group_id
       FROM item_modifier_groups img
       JOIN menu_items mi ON mi.id = img.item_id
       WHERE mi.catalogue_id = $1;`,
      [catalogueId]
    );

    const groupsByItem = new Map<string, ModifierGroup[]>();
    for (const lRow of linkagesRes.rows) {
      const group = modifierGroupMap.get(lRow.group_id);
      if (group) {
        const list = groupsByItem.get(lRow.item_id) || [];
        list.push(group);
        groupsByItem.set(lRow.item_id, list);
      }
    }

    const items: MenuItem[] = itemsRes.rows.map((row) => ({
      id: row.id,
      name: row.name,
      price: {
        amountMinor: row.price_minor.toString(),
        currency: catRow.currency,
      },
      available: row.available,
      allergens: Array.isArray(row.allergens) ? row.allergens : [],
      sortOrder: row.sort_order,
      modifierGroups: groupsByItem.get(row.id) || [],
      ...(row.external_item_key ? { externalItemKey: row.external_item_key } : {}),
      ...(row.description ? { description: row.description } : {}),
    }));

    return {
      id: catRow.id,
      locationId: catRow.location_id,
      version: Number(catRow.version),
      currency: parseCurrencyCode(catRow.currency),
      status: catRow.status,
      items,
      ...(catRow.published_at ? { publishedAt: new Date(catRow.published_at).toISOString() } : {}),
      ...(catRow.valid_until ? { validUntil: new Date(catRow.valid_until).toISOString() } : {}),
    };
  }
}

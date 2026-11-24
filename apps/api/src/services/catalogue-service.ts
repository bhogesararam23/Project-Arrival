import { ArrivalError, type Catalogue } from '@arrival/contracts';
import type { ICatalogueRepository } from '../repositories/interfaces.js';

export class CatalogueService {
  constructor(private readonly catalogueRepo: ICatalogueRepository) {}

  async getCatalogue(locationId: string): Promise<Catalogue> {
    const catalogue = await this.catalogueRepo.getCatalogueByLocation(locationId);
    if (!catalogue) {
      throw ArrivalError.notFound(`No published catalogue found for location: ${locationId}`);
    }
    return catalogue;
  }
}

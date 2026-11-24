import { describe, it, expect } from 'vitest';
import {
  jaroWinklerSimilarity,
  tokenJaccardSimilarity,
  haversineMeters,
  scoreEntityPair,
  type EntityRecord,
} from '../src/entity-resolution.js';

describe('Entity Resolution Algorithm baselines', () => {
  it('computes Jaro-Winkler similarity accurately', () => {
    expect(jaroWinklerSimilarity('martha', 'martha')).toBe(1.0);
    expect(jaroWinklerSimilarity('martha', 'marhta')).toBeGreaterThan(0.94);
    expect(jaroWinklerSimilarity('pizza', 'sushi')).toBeLessThan(0.5);
  });

  it('computes Haversine distance in meters', () => {
    // London Westminster to Covent Garden is ~1.5km
    const dist = haversineMeters(51.4988, -0.1309, 51.5126, -0.1235);
    expect(dist).toBeGreaterThan(1400);
    expect(dist).toBeLessThan(1700);
  });

  it('disambiguates true matches and enforces hard negative constraints for multi-branch chains', () => {
    const venueA: EntityRecord = {
      id: 'v1',
      sourceKey: 'src-1',
      name: 'Dishoom Covent Garden',
      normalizedName: 'dishoom covent garden',
      address: '12 Upper St Martins Ln, London',
      postalCode: 'WC2H 9FB',
      countryCode: 'GB',
      latitude: 51.5127,
      longitude: -0.1264,
    };

    const matchOfA: EntityRecord = {
      id: 'v1-match',
      sourceKey: 'src-2',
      name: 'Dishoom - Covent Garden',
      normalizedName: 'dishoom covent garden',
      address: '12 Upper St Martin\'s Lane',
      postalCode: 'WC2H 9FB',
      countryCode: 'GB',
      latitude: 51.5128,
      longitude: -0.1263,
    };

    const differentBranch: EntityRecord = {
      id: 'v2-branch',
      sourceKey: 'src-1',
      name: 'Dishoom Shoreditch',
      normalizedName: 'dishoom shoreditch',
      address: '7 Boundary St, London',
      postalCode: 'E2 7JE',
      countryCode: 'GB',
      latitude: 51.5245,
      longitude: -0.0772,
    };

    const trueMatchResult = scoreEntityPair(venueA, matchOfA);
    expect(trueMatchResult.compositeScore).toBeGreaterThanOrEqual(0.85);
    expect(trueMatchResult.isHardNegative).toBe(false);

    const hardNegResult = scoreEntityPair(venueA, differentBranch);
    expect(hardNegResult.isHardNegative).toBe(true);
    expect(hardNegResult.compositeScore).toBe(0.0);
  });
});

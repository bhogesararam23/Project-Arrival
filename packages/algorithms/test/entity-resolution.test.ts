import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  jaroWinklerSimilarity,
  tokenJaccardSimilarity,
  haversineMeters,
  scoreEntityPair,
  blockCandidates,
  evaluatePairs,
  type EntityRecord,
} from '../src/entity-resolution.js';

interface GoldenFixture {
  description: string;
  version: string;
  records: EntityRecord[];
  labeledPairs: Array<{
    idA: string;
    idB: string;
    isMatch: boolean;
    reason?: string;
  }>;
}

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

  it('correctly recalls boundary matches straddling adjacent spatial grid cells', () => {
    const fixturePath = resolve(__dirname, '../fixtures/golden_evaluation_pairs.json');
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as GoldenFixture;

    const boundaryRecord1 = fixture.records.find((r) => r.id === 'venue-bound-01')!;
    const boundaryRecord2 = fixture.records.find((r) => r.id === 'venue-bound-02')!;

    // Confirm that these two records round to different primary latCells
    const latCell1 = Math.round(boundaryRecord1.latitude * 100);
    const latCell2 = Math.round(boundaryRecord2.latitude * 100);
    expect(latCell1).not.toBe(latCell2);

    // Run blocking on the full golden record set
    const candidatePairs = blockCandidates(fixture.records);
    const idMap = new Map<number, string>(fixture.records.map((r, i) => [i, r.id]));
    const candidatePairKeys = new Set(
      candidatePairs.map(([i, j]) => {
        const idA = idMap.get(i)!;
        const idB = idMap.get(j)!;
        return idA < idB ? `${idA}<->${idB}` : `${idB}<->${idA}`;
      })
    );

    // Boundary pair MUST be blocked together via Moore neighborhood spatial expansion
    expect(candidatePairKeys.has('venue-bound-01<->venue-bound-02')).toBe(true);
  });

  it('evaluates against the adjudicated golden evaluation fixture with 100% recall on golden matches', () => {
    const fixturePath = resolve(__dirname, '../fixtures/golden_evaluation_pairs.json');
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as GoldenFixture;

    const trueMatches = new Set<string>();
    const hardNegatives = new Set<string>();

    for (const pair of fixture.labeledPairs) {
      const key = `${pair.idA}<->${pair.idB}`;
      if (pair.isMatch) {
        trueMatches.add(key);
      } else {
        hardNegatives.add(key);
      }
    }

    const metrics = evaluatePairs(fixture.records, trueMatches, hardNegatives, 0.85);

    // Mathematical identity: TP + FP + FN + TN === totalPossiblePairs
    expect(metrics.truePositives + metrics.falsePositives + metrics.falseNegatives + metrics.trueNegatives)
      .toBe(metrics.totalPossiblePairs);

    // All labeled true matches must be recalled
    expect(metrics.truePositives).toBe(trueMatches.size);
    expect(metrics.falseNegatives).toBe(0);
    expect(metrics.recall).toBe(1.0);

    // No hard negatives or non-matches should be falsely merged
    expect(metrics.falsePositives).toBe(0);
    expect(metrics.precision).toBe(1.0);
    expect(metrics.f1Score).toBe(1.0);
  });

  it('handles large blocks gracefully through sub-blocking without dropping candidates', () => {
    // Generate 120 records in the exact same spatial cell
    const records: EntityRecord[] = [];
    for (let i = 0; i < 120; i++) {
      const prefix = i < 60 ? 'pizza' : 'burger';
      records.push({
        id: `large-block-venue-${i}`,
        sourceKey: 'test-src',
        name: `${prefix} Place #${i}`,
        normalizedName: `${prefix} place ${i}`,
        address: `${i} Oxford St`,
        postalCode: 'W1D 1BS',
        countryCode: 'GB',
        latitude: 51.5150,
        longitude: -0.1300,
      });
    }

    const pairs = blockCandidates(records);
    // Large block handling must generate pairs within sub-blocks rather than returning 0
    expect(pairs.length).toBeGreaterThan(0);
  });
});

import {
  EntityRecord,
  evaluatePairs,
  BenchmarkMetrics,
} from './entity-resolution.js';

export function runBenchmark(): BenchmarkMetrics {
  const records: EntityRecord[] = [];
  const trueMatches = new Set<string>();
  const hardNegatives = new Set<string>();

  const numClusters = 100;
  for (let i = 0; i < numClusters; i++) {
    const idA = `cluster-${i}-v1`;
    const idB = `cluster-${i}-v2`;
    const baseLat = 51.5 + i * 0.001;
    const baseLon = -0.12 + i * 0.001;

    records.push({
      id: idA,
      sourceKey: 'feed_osm',
      name: `Artisan Bakery #${i}`,
      normalizedName: `artisan bakery ${i}`,
      address: `${i * 10} High Street, London`,
      postalCode: 'SW1A 1AA',
      countryCode: 'GB',
      latitude: baseLat,
      longitude: baseLon,
    });

    records.push({
      id: idB,
      sourceKey: 'feed_partner',
      name: `The Artisan Bakery No. ${i} Ltd`,
      normalizedName: `artisan bakery ${i}`,
      address: `${i * 10} High St`,
      postalCode: 'SW1A 1AA',
      countryCode: 'GB',
      latitude: baseLat + 0.0001,
      longitude: baseLon + 0.0001,
    });

    trueMatches.add(`${idA}<->${idB}`);
  }

  // 50 chain branches
  for (let i = 0; i < 50; i++) {
    const id = `chain-branch-${i}`;
    records.push({
      id,
      sourceKey: 'feed_osm',
      name: 'Pret A Manger',
      normalizedName: 'pret a manger',
      address: `${100 + i} Kings Road, London`,
      postalCode: 'SW3 4TZ',
      countryCode: 'GB',
      latitude: 51.488 + i * 0.01,
      longitude: -0.16 - i * 0.01,
    });

    if (i > 0) {
      hardNegatives.add(`${id}<->chain-branch-${i - 1}`);
    }
  }

  return evaluatePairs(records, trueMatches, hardNegatives, 0.85);
}

console.log('================================================================');
console.log('   Project Arrival: TypeScript Baseline Benchmark               ');
console.log('================================================================');
const m = runBenchmark();
console.log(`  Total all-pairs space:          ${m.totalPossiblePairs}`);
console.log(`  Candidate pairs after blocking: ${m.candidatePairsBlocked}`);
console.log(`  Blocking reduction ratio:       ${(m.blockingReductionRatio * 100).toFixed(4)} %`);
console.log(`  True Positives (TP):            ${m.truePositives}`);
console.log(`  False Positives (FP):           ${m.falsePositives}`);
console.log(`  False Negatives (FN):           ${m.falseNegatives}`);
console.log(`  True Negatives (TN):            ${m.trueNegatives}`);
console.log(`  Pairwise Precision:             ${m.precision.toFixed(4)}`);
console.log(`  Pairwise Recall:                ${m.recall.toFixed(4)}`);
console.log(`  Pairwise F1 Score:              ${m.f1Score.toFixed(4)}`);
console.log(`  False Merge Rate:               ${(m.falseMergeRate * 100).toFixed(4)} %`);
console.log(`  Execution Time:                 ${m.elapsedMs.toFixed(2)} ms`);
console.log(`  Throughput:                     ${m.throughputPairsPerSec.toFixed(0)} pairs/sec`);
console.log('================================================================');

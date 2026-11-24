import {
  EntityRecord,
  blockCandidates,
  scoreEntityPair,
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

  const start = performance.now();
  const n = records.length;
  const totalPossiblePairs = (n * (n - 1)) / 2;

  const candidatePairs = blockCandidates(records);
  const blockedCandidates = candidatePairs.length;

  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;

  const predictedMatches = new Set<string>();
  const autoMergeThreshold = 0.85;

  for (const [i, j] of candidatePairs) {
    const a = records[i]!;
    const b = records[j]!;

    const key1 = `${a.id}<->${b.id}`;
    const key2 = `${b.id}<->${a.id}`;
    const isTrue = trueMatches.has(key1) || trueMatches.has(key2);

    const scoreResult = scoreEntityPair(a, b);
    const predicted = scoreResult.compositeScore >= autoMergeThreshold && !scoreResult.isHardNegative;

    if (predicted) {
      predictedMatches.add(key1);
      if (isTrue) tp++;
      else fp++;
    } else {
      if (isTrue) fn++;
      else tn++;
    }
  }

  for (const truePair of trueMatches) {
    if (!predictedMatches.has(truePair)) {
      fn++;
    }
  }

  const elapsedMs = performance.now() - start;

  const precision = tp + fp > 0 ? tp / (tp + fp) : 1.0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1.0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0.0;
  const falseMergeRate = fp + tn > 0 ? fp / (fp + tn) : 0.0;
  const blockingReductionRatio = totalPossiblePairs > 0 ? 1.0 - blockedCandidates / totalPossiblePairs : 1.0;
  const throughputPairsPerSec = elapsedMs > 0 ? blockedCandidates / (elapsedMs / 1000) : 0;

  return {
    totalPossiblePairs,
    candidatePairsBlocked: blockedCandidates,
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    trueNegatives: tn,
    precision,
    recall,
    f1Score,
    falseMergeRate,
    blockingReductionRatio,
    elapsedMs,
    throughputPairsPerSec,
  };
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

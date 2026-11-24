export interface EntityRecord {
  id: string;
  sourceKey: string;
  name: string;
  normalizedName: string;
  address: string;
  postalCode: string;
  countryCode: string;
  latitude: number;
  longitude: number;
}

export interface PairScoreResult {
  idA: string;
  idB: string;
  nameScore: number;
  addressScore: number;
  geoProximity: number;
  compositeScore: number;
  distanceMeters: number;
  isHardNegative: boolean;
}

export interface BenchmarkMetrics {
  totalPossiblePairs: number;
  candidatePairsBlocked: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
  falseMergeRate: number;
  blockingReductionRatio: number;
  elapsedMs: number;
  throughputPairsPerSec: number;
}

const PI = Math.PI;
const EARTH_RADIUS_METERS = 6371000;

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * PI) / 180;
  const dLon = ((lon2 - lon1) * PI) / 180;
  const rLat1 = (lat1 * PI) / 180;
  const rLat2 = (lat2 * PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c);
}

export function jaroWinklerSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const len1 = s1.length;
  const len2 = s2.length;
  const matchDistance = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1);

  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions += 0.5;
    k++;
  }

  const m = matches;
  const jaro = (m / len1 + m / len2 + (m - transpositions) / m) / 3.0;

  let prefix = 0;
  const maxPrefix = Math.min(4, Math.min(len1, len2));
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1.0 - jaro);
}

export function tokenJaccardSimilarity(s1: string, s2: string): number {
  const t1 = new Set(s1.toLowerCase().split(/[\s,]+/).filter(Boolean));
  const t2 = new Set(s2.toLowerCase().split(/[\s,]+/).filter(Boolean));

  if (t1.size === 0 && t2.size === 0) return 1.0;
  if (t1.size === 0 || t2.size === 0) return 0.0;

  let intersection = 0;
  for (const item of t1) {
    if (t2.has(item)) intersection++;
  }

  const union = t1.size + t2.size - intersection;
  return union === 0 ? 1.0 : intersection / union;
}

export function scoreEntityPair(a: EntityRecord, b: EntityRecord): PairScoreResult {
  const distM = haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);

  let geoProx = 0.0;
  if (distM <= 50) geoProx = 1.0;
  else if (distM <= 250) geoProx = 0.85;
  else if (distM <= 1000) geoProx = 0.5;
  else if (distM <= 5000) geoProx = 0.1;

  const jw = jaroWinklerSimilarity(a.normalizedName, b.normalizedName);
  const jaccard = tokenJaccardSimilarity(a.normalizedName, b.normalizedName);
  const nameScore = 0.6 * jw + 0.4 * jaccard;

  let addrScore = tokenJaccardSimilarity(a.address, b.address);
  if (a.postalCode && a.postalCode === b.postalCode) {
    addrScore = Math.max(addrScore, 0.85);
  }

  // Hard negative invariant
  let isHardNegative = false;
  if (distM > 1500) {
    isHardNegative = true;
  }
  if (a.countryCode !== b.countryCode) {
    isHardNegative = true;
  }

  const compositeScore = isHardNegative ? 0.0 : 0.55 * nameScore + 0.25 * geoProx + 0.2 * addrScore;

  return {
    idA: a.id,
    idB: b.id,
    nameScore,
    addressScore: addrScore,
    geoProximity: geoProx,
    compositeScore,
    distanceMeters: distM,
    isHardNegative,
  };
}

export function blockCandidates(records: EntityRecord[]): Array<[number, number]> {
  const spatialBlocks = new Map<string, number[]>();
  const nameBlocks = new Map<string, number[]>();

  records.forEach((r, idx) => {
    const latCell = Math.round(r.latitude * 100);
    const lonCell = Math.round(r.longitude * 100);
    const geoKey = `${r.countryCode}_${latCell}_${lonCell}`;
    const geoList = spatialBlocks.get(geoKey) || [];
    geoList.push(idx);
    spatialBlocks.set(geoKey, geoList);

    if (r.normalizedName.length >= 4) {
      const nameKey = `${r.countryCode}_${r.normalizedName.substring(0, 4)}`;
      const nameList = nameBlocks.get(nameKey) || [];
      nameList.push(idx);
      nameBlocks.set(nameKey, nameList);
    }
  });

  const pairSet = new Set<string>();

  const addPair = (i: number, j: number) => {
    const a = Math.min(i, j);
    const b = Math.max(i, j);
    pairSet.add(`${a}:${b}`);
  };

  // Helper to emit pairs for a list, sub-blocking if large
  const emitPairsWithSubblocking = (
    indices: number[],
    subKeyFn: (r: EntityRecord) => string
  ) => {
    if (indices.length <= 1) return;
    if (indices.length < 100) {
      for (let i = 0; i < indices.length; i++) {
        for (let j = i + 1; j < indices.length; j++) {
          addPair(indices[i]!, indices[j]!);
        }
      }
    } else {
      // Large block: sub-block by secondary attribute instead of dropping
      const subBuckets = new Map<string, number[]>();
      for (const idx of indices) {
        const subKey = subKeyFn(records[idx]!);
        const list = subBuckets.get(subKey) || [];
        list.push(idx);
        subBuckets.set(subKey, list);
      }
      for (const subList of subBuckets.values()) {
        if (subList.length > 1) {
          for (let i = 0; i < subList.length; i++) {
            for (let j = i + 1; j < subList.length; j++) {
              addPair(subList[i]!, subList[j]!);
            }
          }
        }
      }
    }
  };

  // 1. Spatial blocking with Moore neighborhood (adjacent 3x3 cells) for boundary recall
  // Forward neighbor offsets to evaluate each cell pair exactly once:
  // (0, 1), (1, -1), (1, 0), (1, 1)
  const forwardNeighbors: Array<[number, number]> = [
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ];

  for (const [geoKey, indices] of spatialBlocks.entries()) {
    // Intra-cell pairs
    emitPairsWithSubblocking(indices, (r) =>
      r.normalizedName.length >= 2 ? r.normalizedName.substring(0, 2) : '__short'
    );

    // Cross-cell pairs with forward neighbors
    const parts = geoKey.split('_');
    const countryCode = parts[0]!;
    const latCell = Number(parts[1]!);
    const lonCell = Number(parts[2]!);

    for (const [dLat, dLon] of forwardNeighbors) {
      const neighborKey = `${countryCode}_${latCell + dLat}_${lonCell + dLon}`;
      const neighborIndices = spatialBlocks.get(neighborKey);
      if (!neighborIndices || neighborIndices.length === 0) continue;

      // If either block is large, constrain by secondary attribute
      const bothSmall = indices.length < 100 && neighborIndices.length < 100;
      if (bothSmall) {
        for (const i of indices) {
          for (const j of neighborIndices) {
            addPair(i, j);
          }
        }
      } else {
        // Sub-block match by 2-char prefix
        const neighborPrefixMap = new Map<string, number[]>();
        for (const j of neighborIndices) {
          const recB = records[j]!;
          const pfx = recB.normalizedName.length >= 2 ? recB.normalizedName.substring(0, 2) : '__';
          const list = neighborPrefixMap.get(pfx) || [];
          list.push(j);
          neighborPrefixMap.set(pfx, list);
        }
        for (const i of indices) {
          const recA = records[i]!;
          const pfx = recA.normalizedName.length >= 2 ? recA.normalizedName.substring(0, 2) : '__';
          const matching = neighborPrefixMap.get(pfx);
          if (matching) {
            for (const j of matching) {
              addPair(i, j);
            }
          }
        }
      }
    }
  }

  // 2. Name prefix blocking
  for (const indices of nameBlocks.values()) {
    emitPairsWithSubblocking(indices, (r) => {
      const latCell = Math.round(r.latitude * 100);
      const lonCell = Math.round(r.longitude * 100);
      return `${latCell}_${lonCell}`;
    });
  }

  return Array.from(pairSet).map((p) => {
    const [a, b] = p.split(':').map(Number);
    return [a!, b!];
  });
}

export function evaluatePairs(
  records: EntityRecord[],
  groundTruthMatches: Set<string>,
  _knownHardNegatives: Set<string> = new Set(),
  autoMergeThreshold = 0.85
): BenchmarkMetrics {
  const start = performance.now();
  const n = records.length;
  const totalPossiblePairs = (n * (n - 1)) / 2;

  const candidatePairs = blockCandidates(records);
  const blockedCandidates = candidatePairs.length;

  const predictedMatches = new Set<string>();

  for (const [i, j] of candidatePairs) {
    const a = records[i]!;
    const b = records[j]!;

    const scoreResult = scoreEntityPair(a, b);
    const predicted = scoreResult.compositeScore >= autoMergeThreshold && !scoreResult.isHardNegative;

    if (predicted) {
      const minId = a.id < b.id ? a.id : b.id;
      const maxId = a.id < b.id ? b.id : a.id;
      predictedMatches.add(`${minId}<->${maxId}`);
    }
  }

  // Canonicalize groundTruthMatches so ordering of idA and idB does not matter
  const canonicalTruth = new Set<string>();
  for (const pair of groundTruthMatches) {
    const [idA, idB] = pair.split('<->');
    if (idA && idB) {
      const minId = idA < idB ? idA : idB;
      const maxId = idA < idB ? idB : idA;
      canonicalTruth.add(`${minId}<->${maxId}`);
    }
  }

  let tp = 0;
  let fn = 0;
  for (const truePair of canonicalTruth) {
    if (predictedMatches.has(truePair)) {
      tp++;
    } else {
      fn++;
    }
  }

  let fp = 0;
  for (const predPair of predictedMatches) {
    if (!canonicalTruth.has(predPair)) {
      fp++;
    }
  }

  const totalNonMatches = totalPossiblePairs - canonicalTruth.size;
  const tn = Math.max(0, totalNonMatches - fp);

  const elapsedMs = performance.now() - start;

  const precision = tp + fp > 0 ? tp / (tp + fp) : 1.0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1.0;
  const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0.0;
  const falseMergeRate = totalNonMatches > 0 ? fp / totalNonMatches : 0.0;
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

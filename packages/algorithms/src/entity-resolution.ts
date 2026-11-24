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
  const addBlockPairs = (blocks: Map<string, number[]>) => {
    for (const indices of blocks.values()) {
      if (indices.length > 1 && indices.length < 100) {
        for (let i = 0; i < indices.length; i++) {
          for (let j = i + 1; j < indices.length; j++) {
            const a = Math.min(indices[i]!, indices[j]!);
            const b = Math.max(indices[i]!, indices[j]!);
            pairSet.add(`${a}:${b}`);
          }
        }
      }
    }
  };

  addBlockPairs(spatialBlocks);
  addBlockPairs(nameBlocks);

  return Array.from(pairSet).map((p) => {
    const [a, b] = p.split(':').map(Number);
    return [a!, b!];
  });
}

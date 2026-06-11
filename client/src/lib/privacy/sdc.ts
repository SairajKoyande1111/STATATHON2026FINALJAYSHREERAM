import { type DataRow, columnRange, isNumericCol, calcInfoLoss, type PrivacyResult } from "./types";

// ════════════════════════════════════════════════════════════════════════════
// FAMILY 1: Statistical Disclosure Control (SDC)
// ════════════════════════════════════════════════════════════════════════════

// ─── 1. K-ANONYMITY (Mondrian Greedy Partitioning) ───────────────────────────
// Ref: LeFevre et al., "Mondrian Multidimensional K-Anonymity", ICDE 2006
//
// Algorithm:
//  1. Start with a single partition containing all records.
//  2. Choose the QI with the widest normalised value range.
//  3. Split at the median of that attribute.
//  4. If both sub-partitions each contain ≥ k records → execute the split.
//  5. Recurse until no further valid splits are possible.
//  6. Generalise: Replace every value in a partition with "[min–max]" (numeric)
//     or the set of distinct values (categorical).
//  7. Suppress: Delete records in residual groups whose size < k.

interface Partition { indices: number[] }

function medianValue(vals: number[]): number {
  const sorted = [...vals].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function applyKAnonymity(
  data: DataRow[],
  qis: string[],
  k: number,
  suppressionLimit: number // 0–1
): PrivacyResult {
  const t0 = performance.now();
  if (data.length === 0 || qis.length === 0) return sdcEmpty("K-Anonymity (Mondrian)");
  const numCols = qis.filter((c) => isNumericCol(data, c));

  const ranges = new Map<string, number>();
  qis.forEach((c) => ranges.set(c, columnRange(data, c)));

  function split(partition: Partition): Partition[] {
    const { indices } = partition;
    if (indices.length < 2 * k) return [partition];

    let bestCol = qis[0];
    let bestRange = 0;
    for (const col of qis) {
      const vals = indices.map((i) => Number(data[i][col])).filter((v) => !isNaN(v));
      if (vals.length === 0) continue;
      const rng = Math.max(...vals) - Math.min(...vals);
      const normRange = rng / Math.max(ranges.get(col) || 1, 1);
      if (normRange > bestRange) { bestRange = normRange; bestCol = col; }
    }

    const vals = indices.map((i) => Number(data[i][bestCol])).filter((v) => !isNaN(v));
    if (vals.length === 0) return [partition];
    const mid = medianValue(vals);

    const left: number[] = [];
    const right: number[] = [];
    indices.forEach((i) => {
      const v = Number(data[i][bestCol]);
      if (isNaN(v)) left.push(i);
      else if (v <= mid) left.push(i);
      else right.push(i);
    });

    if (left.length < k || right.length < k) return [partition];
    return [...split({ indices: left }), ...split({ indices: right })];
  }

  const partitions = split({ indices: data.map((_, i) => i) });

  const suppressed: number[] = [];
  const processed: DataRow[] = [];
  const equivClasses: number[] = [];

  for (const partition of partitions) {
    const { indices } = partition;
    if (indices.length < k) {
      suppressed.push(...indices);
      continue;
    }
    equivClasses.push(indices.length);
    const generalised: DataRow = {};
    qis.forEach((col) => {
      const vals = indices.map((i) => data[i][col]);
      if (isNumericCol(data, col)) {
        const nums = vals.map((v) => Number(v)).filter((v) => !isNaN(v));
        const lo = Math.min(...nums), hi = Math.max(...nums);
        generalised[col] = lo === hi ? String(lo) : `[${lo}–${hi}]`;
      } else {
        const distinct = Array.from(new Set(vals.map(String))).sort();
        generalised[col] = distinct.length === 1 ? distinct[0] : `{${distinct.join(",")}}`;
      }
    });
    const nonQI = Object.keys(data[0]).filter((c) => !qis.includes(c));
    indices.forEach((i) => {
      const row: DataRow = { ...generalised };
      nonQI.forEach((c) => (row[c] = data[i][c]));
      processed.push(row);
    });
  }

  const avgGroup = equivClasses.length > 0 ? equivClasses.reduce((s, v) => s + v, 0) / equivClasses.length : 0;
  const minGroup = equivClasses.length > 0 ? Math.min(...equivClasses) : 0;
  const maxGroup = equivClasses.length > 0 ? Math.max(...equivClasses) : 0;

  return {
    technique: "K-Anonymity (Mondrian)", family: "SDC",
    processedData: processed, originalCount: data.length, processedCount: processed.length,
    recordsSuppressed: suppressed.length,
    informationLoss: calcInfoLoss(data, processed, numCols),
    executionMs: Math.round(performance.now() - t0),
    stats: {
      k, equivalenceClasses: equivClasses.length,
      avgGroupSize: parseFloat(avgGroup.toFixed(1)),
      minGroupSize: minGroup, maxGroupSize: maxGroup,
      suppressionRate: parseFloat(((suppressed.length / data.length) * 100).toFixed(1)) + "%",
      privacyRisk: parseFloat((1 / Math.max(k, 1)).toFixed(4)),
    },
    warnings: [
      ...(suppressed.length / data.length > 0.1 ? ["Suppression > 10% — consider lowering k."] : []),
      "k-Anonymity does not protect against attribute disclosure or differencing attacks.",
    ],
  };
}

// ─── 2. L-DIVERSITY (Entropy Variant) ────────────────────────────────────────
// Ref: Machanavajjhala et al., "l-Diversity: Privacy Beyond k-Anonymity", TKDE 2007
//
// Entropy l-diversity: for each equivalence class E,
//   H(S|E) = -Σ p(s) log p(s) ≥ log(l)
// Algorithm:
//  1. Build k-anonymous equivalence classes (Mondrian).
//  2. For each class E, compute H(S|E).
//  3. If H < log(l) → suppress the violating class.
//  4. Repeat until all classes satisfy the constraint.

export function applyLDiversity(
  data: DataRow[],
  qis: string[],
  sensitiveAttr: string,
  l: number,
  method: "entropy" | "distinct" | "recursive"
): PrivacyResult {
  const t0 = performance.now();
  if (data.length === 0 || qis.length === 0) return sdcEmpty("L-Diversity");
  const numCols = qis.filter((c) => isNumericCol(data, c));

  const kResult = applyKAnonymity(data, qis, l, 0.05);
  const classMap = new Map<string, number[]>();
  kResult.processedData.forEach((row, idx) => {
    const key = qis.map((c) => String(row[c])).join("||");
    if (!classMap.has(key)) classMap.set(key, []);
    classMap.get(key)!.push(idx);
  });

  const logL = Math.log(l);
  const satisfying: DataRow[] = [];
  let violatingClasses = 0;

  for (const [, indices] of Array.from(classMap)) {
    const rows = indices.map((i) => kResult.processedData[i]);
    const freqMap = new Map<string, number>();
    rows.forEach((r) => {
      const v = String(r[sensitiveAttr] ?? "");
      freqMap.set(v, (freqMap.get(v) || 0) + 1);
    });

    let satisfied = false;
    if (method === "entropy") {
      let entropy = 0;
      freqMap.forEach((cnt) => {
        const p = cnt / rows.length;
        entropy -= p > 0 ? p * Math.log(p) : 0;
      });
      satisfied = entropy >= logL;
    } else if (method === "distinct") {
      satisfied = freqMap.size >= l;
    } else {
      const sorted = Array.from(freqMap.values()).sort((a, b) => b - a);
      const c = 1.0 / l;
      const most = sorted[0] || 0;
      const rest = sorted.slice(1).reduce((s, v) => s + v, 0);
      satisfied = freqMap.size >= l && (rest === 0 || most <= c * rest);
    }

    if (satisfied) {
      rows.forEach((r) => satisfying.push(r));
    } else {
      violatingClasses++;
    }
  }

  return {
    technique: `L-Diversity (${method})`, family: "SDC",
    processedData: satisfying, originalCount: data.length, processedCount: satisfying.length,
    recordsSuppressed: data.length - satisfying.length,
    informationLoss: calcInfoLoss(data, satisfying, numCols),
    executionMs: Math.round(performance.now() - t0),
    stats: {
      l, method,
      satisfyingClasses: classMap.size - violatingClasses,
      violatingClasses,
      constraintFormula: method === "entropy"
        ? `H(S|E) = -Σ p(s)log p(s) ≥ log(${l}) = ${logL.toFixed(3)}`
        : method === "distinct"
        ? `|distinct(S,E)| ≥ ${l}`
        : `max_freq / sum(rest) ≤ 1/${l}`,
      privacyGuarantee: `${l}-Diversity (${method} variant)`,
    },
    warnings: [
      "L-Diversity protects against attribute disclosure but not skewness or similarity attacks.",
      ...(violatingClasses / Math.max(classMap.size, 1) > 0.3 ? ["Many violating classes — consider a larger dataset or lower l."] : []),
    ],
  };
}

// ─── 3. T-CLOSENESS (Earth Mover's Distance) ─────────────────────────────────
// Ref: Li et al., "t-Closeness: Privacy Beyond k-Anonymity and l-Diversity", ICDE 2007
//
// E satisfies t-closeness if EMD(P_E, Q_global) ≤ t
// Ordered numeric:  EMD = (1/|vals|-1) Σ |cumulative_P - cumulative_Q|
// Categorical:      EMD = (1/2) Σ |P_i - Q_i|

export function applyTCloseness(
  data: DataRow[],
  qis: string[],
  sensitiveAttr: string,
  t: number
): PrivacyResult {
  const t0 = performance.now();
  if (data.length === 0 || qis.length === 0) return sdcEmpty("T-Closeness");
  const numCols = qis.filter((c) => isNumericCol(data, c));

  const globalFreq = new Map<string, number>();
  data.forEach((r) => {
    const v = String(r[sensitiveAttr] ?? "");
    globalFreq.set(v, (globalFreq.get(v) || 0) + 1);
  });
  const N = data.length;
  const globalVals = Array.from(globalFreq.keys()).sort();
  const isNumericSA = isNumericCol(data, sensitiveAttr);

  function computeEMD(partition: DataRow[]): number {
    const localFreq = new Map<string, number>();
    partition.forEach((r) => {
      const v = String(r[sensitiveAttr] ?? "");
      localFreq.set(v, (localFreq.get(v) || 0) + 1);
    });
    const m = partition.length;
    if (isNumericSA) {
      let cumP = 0, cumQ = 0, emd = 0;
      for (const v of globalVals) {
        cumP += (localFreq.get(v) || 0) / m;
        cumQ += (globalFreq.get(v) || 0) / N;
        emd += Math.abs(cumP - cumQ);
      }
      return emd / Math.max(globalVals.length - 1, 1);
    } else {
      let emd = 0;
      globalVals.forEach((v) => {
        const p = (localFreq.get(v) || 0) / m;
        const q = (globalFreq.get(v) || 0) / N;
        emd += Math.abs(p - q);
      });
      return emd / 2;
    }
  }

  const kResult = applyKAnonymity(data, qis, Math.max(2, Math.ceil(1 / Math.max(t, 0.01))), 0.05);
  const classMap = new Map<string, DataRow[]>();
  kResult.processedData.forEach((row) => {
    const key = qis.map((c) => String(row[c])).join("||");
    if (!classMap.has(key)) classMap.set(key, []);
    classMap.get(key)!.push(row);
  });

  const satisfying: DataRow[] = [];
  let satisfyingClasses = 0, violatingClasses = 0;
  let sumEMD = 0, maxEMD = 0;

  for (const [, rows] of Array.from(classMap)) {
    const emd = computeEMD(rows);
    sumEMD += emd;
    maxEMD = Math.max(maxEMD, emd);
    if (emd <= t) {
      rows.forEach((r) => satisfying.push(r));
      satisfyingClasses++;
    } else {
      violatingClasses++;
    }
  }

  return {
    technique: "T-Closeness (EMD)", family: "SDC",
    processedData: satisfying, originalCount: data.length, processedCount: satisfying.length,
    recordsSuppressed: data.length - satisfying.length,
    informationLoss: calcInfoLoss(data, satisfying, numCols),
    executionMs: Math.round(performance.now() - t0),
    stats: {
      t, satisfyingClasses, violatingClasses,
      avgEMD: parseFloat((sumEMD / Math.max(classMap.size, 1)).toFixed(4)),
      maxEMD: parseFloat(maxEMD.toFixed(4)),
      emdType: isNumericSA ? "Ordered (cumulative histogram)" : "Categorical (½ L1 distance)",
      privacyGuarantee: `t-Closeness (t=${t}) — distribution similarity enforced`,
    },
    warnings: [
      "T-Closeness is the strongest SDC technique but significantly reduces data utility.",
      ...(t < 0.1 ? ["Very tight t threshold — try t = 0.2–0.3 for better record retention."] : []),
    ],
  };
}

// ─── 4. RANK SWAPPING ────────────────────────────────────────────────────────
// Ref: Domingo-Ferrer & Torra, 2005
//
// For each numeric column:
//  1. Sort records by that column.
//  2. For each record i, randomly select partner j where |rank_i − rank_j| ≤ p.
//  3. Swap the column values between i and j.
//  p = swapFraction × N

export function applyRankSwapping(
  data: DataRow[],
  targetCols: string[],
  swapFraction: number
): PrivacyResult {
  const t0 = performance.now();
  if (data.length === 0) return sdcEmpty("Rank Swapping");
  const numericCols = targetCols.filter((c) => isNumericCol(data, c));
  const p = Math.max(1, Math.floor(data.length * swapFraction));

  const processed: DataRow[] = data.map((r) => ({ ...r }));

  numericCols.forEach((col) => {
    const order = Array.from(processed.keys()).sort(
      (a, b) => Number(processed[a][col]) - Number(processed[b][col])
    );
    const swapped = new Set<number>();

    for (let rank = 0; rank < order.length; rank++) {
      const i = order[rank];
      if (swapped.has(i)) continue;
      const lo = Math.max(0, rank - p);
      const hi = Math.min(order.length - 1, rank + p);
      const candidates: number[] = [];
      for (let r = lo; r <= hi; r++) {
        if (r !== rank && !swapped.has(order[r])) candidates.push(order[r]);
      }
      if (candidates.length === 0) continue;
      const j = candidates[Math.floor(Math.random() * candidates.length)];
      const tmp = processed[i][col];
      processed[i][col] = processed[j][col];
      processed[j][col] = tmp;
      swapped.add(i);
      swapped.add(j);
    }
  });

  return {
    technique: "Rank Swapping", family: "SDC",
    processedData: processed, originalCount: data.length, processedCount: processed.length,
    recordsSuppressed: 0,
    informationLoss: calcInfoLoss(data, processed, numericCols),
    executionMs: Math.round(performance.now() - t0),
    stats: {
      swapFraction, maxRankDistance: p,
      columnsSwapped: numericCols.length,
      preservedProperty: "Univariate marginal distributions preserved",
      privacyGuarantee: "Breaks QI–SA linkage for records within swap range",
    },
    warnings: numericCols.length === 0
      ? ["No numeric columns selected. Rank swapping only applies to numeric attributes."]
      : [],
  };
}

// ─── 5. MICROAGGREGATION ─────────────────────────────────────────────────────
// Ref: Domingo-Ferrer & Mateo-Sanz, IEEE TKDE 2002
//
// Math: For cluster C = {x₁,…,xₖ}, replace each xᵢ with centroid x̄ = (1/k)Σxᵢ
// Algorithm: MDAV (Maximum Distance to Average Vector)

export function applyMicroaggregation(
  data: DataRow[],
  targetCols: string[],
  clusterSize: number
): PrivacyResult {
  const t0 = performance.now();
  if (data.length === 0) return sdcEmpty("Microaggregation");
  const numericCols = targetCols.filter((c) => isNumericCol(data, c));
  if (numericCols.length === 0) return sdcEmpty("Microaggregation");

  type Vec = number[];
  const getVec = (row: DataRow): Vec => numericCols.map((c) => Number(row[c]) || 0);
  const dist = (a: Vec, b: Vec): number => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
  const centroid = (rows: DataRow[]): Vec => {
    const sums = numericCols.map((_, ci) =>
      rows.reduce((s, r) => s + (Number(r[numericCols[ci]]) || 0), 0)
    );
    return sums.map((s) => s / rows.length);
  };

  const remaining: number[] = data.map((_, i) => i);
  const clusters: number[][] = [];

  while (remaining.length >= clusterSize) {
    const vecs = remaining.map((i) => getVec(data[i]));
    const gc = centroid(remaining.map((i) => data[i]));
    let r1idx = 0, r1dist = -1;
    vecs.forEach((v, i) => { const d = dist(v, gc); if (d > r1dist) { r1dist = d; r1idx = i; } });
    const r1vec = vecs[r1idx];

    let r2idx = 0, r2dist = -1;
    vecs.forEach((v, i) => { if (i === r1idx) return; const d = dist(v, r1vec); if (d > r2dist) { r2dist = d; r2idx = i; } });

    const distToR1 = vecs.map((v, i) => ({ i, d: dist(v, r1vec) })).sort((a, b) => a.d - b.d);
    const clusterA = distToR1.slice(0, clusterSize).map((x) => remaining[x.i]);
    const usedASet = new Set(clusterA);
    const rem2 = remaining.filter((idx) => !usedASet.has(idx));
    const vecs2 = rem2.map((i) => getVec(data[i]));
    const r2vec = vecs[r2idx];
    const distToR2 = vecs2.map((v, i) => ({ i, d: dist(v, r2vec) })).sort((a, b) => a.d - b.d);
    const clusterB = distToR2.slice(0, clusterSize).map((x) => rem2[x.i]);

    clusters.push(clusterA, clusterB);
    const usedAll = new Set([...clusterA, ...clusterB]);
    remaining.splice(0, remaining.length, ...remaining.filter((idx) => !usedAll.has(idx)));
  }
  if (remaining.length > 0 && clusters.length > 0) {
    clusters[clusters.length - 1].push(...remaining);
  } else if (remaining.length > 0) {
    clusters.push([...remaining]);
  }

  const processed: DataRow[] = data.map((r) => ({ ...r }));
  clusters.forEach((cluster) => {
    const rows = cluster.map((i) => data[i]);
    const c = centroid(rows);
    cluster.forEach((i) => {
      numericCols.forEach((col, ci) => {
        processed[i][col] = parseFloat(c[ci].toFixed(4));
      });
    });
  });

  return {
    technique: "Microaggregation (MDAV)", family: "SDC",
    processedData: processed, originalCount: data.length, processedCount: processed.length,
    recordsSuppressed: 0,
    informationLoss: calcInfoLoss(data, processed, numericCols),
    executionMs: Math.round(performance.now() - t0),
    stats: {
      clusterSize, totalClusters: clusters.length,
      columnsAggregated: numericCols.length,
      algorithm: "MDAV (Maximum Distance to Average Vector)",
      preservedProperty: "Group centroids (aggregate statistics preserved)",
      privacyGuarantee: `Minimum cluster size = ${clusterSize} (analogous to k-anonymity on numeric data)`,
    },
    warnings: [],
  };
}

// ─── 6. PRAM (Post Randomisation Method) ─────────────────────────────────────
// Ref: Kooiman et al., Statistics Netherlands Research Paper, 1997
//
// Transition matrix M: M[i][j] = retentionProb if i=j, else (1-retentionProb)/(|S|-1)

export function applyPRAM(
  data: DataRow[],
  targetCols: string[],
  retentionProb: number
): PrivacyResult {
  const t0 = performance.now();
  if (data.length === 0) return sdcEmpty("PRAM");
  const catCols = targetCols.filter((c) => !isNumericCol(data, c));
  const numCols = targetCols.filter((c) => isNumericCol(data, c));

  const categories = new Map<string, string[]>();
  catCols.forEach((col) => {
    const distinct = Array.from(new Set(data.map((r) => String(r[col] ?? "")))).sort();
    categories.set(col, distinct);
  });

  const processed: DataRow[] = data.map((row) => {
    const newRow = { ...row };
    catCols.forEach((col) => {
      const cats = categories.get(col)!;
      if (cats.length <= 1) return;
      const currentVal = String(row[col] ?? "");
      const currentIdx = cats.indexOf(currentVal);
      if (currentIdx === -1) return;
      const offDiag = (1 - retentionProb) / (cats.length - 1);
      let rnd = Math.random();
      rnd -= retentionProb;
      if (rnd <= 0) { newRow[col] = currentVal; return; }
      for (let j = 0; j < cats.length; j++) {
        if (j === currentIdx) continue;
        rnd -= offDiag;
        if (rnd <= 0) { newRow[col] = cats[j]; return; }
      }
      newRow[col] = cats[cats.length - 1];
    });
    numCols.forEach((col) => {
      const v = Number(row[col]);
      if (!isNaN(v)) {
        const noiseScale = columnRange(data, col) * (1 - retentionProb) * 0.1;
        const u1 = Math.random(), u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
        newRow[col] = parseFloat((v + noiseScale * z).toFixed(4));
      }
    });
    return newRow;
  });

  return {
    technique: "PRAM (Post Randomisation Method)", family: "SDC",
    processedData: processed, originalCount: data.length, processedCount: processed.length,
    recordsSuppressed: 0,
    informationLoss: catCols.length > 0 ? 1 - retentionProb : calcInfoLoss(data, processed, numCols),
    executionMs: Math.round(performance.now() - t0),
    stats: {
      retentionProbability: retentionProb,
      perturbationProbability: parseFloat((1 - retentionProb).toFixed(2)),
      categoricalColumnsPerturbed: catCols.length,
      numericColumnsPerturbed: numCols.length,
      transitionMatrix: `M[i,i]=${retentionProb}, M[i,j]=${parseFloat(((1 - retentionProb) / Math.max(2, 1)).toFixed(3))}`,
      privacyGuarantee: "Probabilistic disclosure control via known stochastic perturbation",
    },
    warnings: catCols.length === 0
      ? ["No categorical columns selected. PRAM primarily applies to categorical attributes."]
      : [],
  };
}

// ─── 7. TOP/BOTTOM CODING + NOISE ADDITION ───────────────────────────────────
// Top Coding:    values above p-th percentile → capped at that value
// Bottom Coding: values below (1-p)-th percentile → capped at that value
// Noise:         v += N(0, noiseLevel² × σ²)

export function applyTopBottomCoding(
  data: DataRow[],
  targetCols: string[],
  topPercentile: number,
  bottomPercentile: number,
  addNoise: boolean,
  noiseLevel: number
): PrivacyResult {
  const t0 = performance.now();
  if (data.length === 0) return sdcEmpty("Top/Bottom Coding");
  const numericCols = targetCols.filter((c) => isNumericCol(data, c));

  const thresholds = new Map<string, { top: number; bottom: number; std: number }>();
  numericCols.forEach((col) => {
    const sorted = data.map((r) => Number(r[col])).filter((v) => !isNaN(v)).sort((a, b) => a - b);
    const N = sorted.length;
    const topIdx = Math.min(N - 1, Math.floor((topPercentile / 100) * N));
    const botIdx = Math.max(0, Math.floor((bottomPercentile / 100) * N));
    const mean = sorted.reduce((s, v) => s + v, 0) / N;
    const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / N;
    thresholds.set(col, { top: sorted[topIdx], bottom: sorted[botIdx], std: Math.sqrt(variance) });
  });

  const processed: DataRow[] = data.map((row) => {
    const newRow = { ...row };
    numericCols.forEach((col) => {
      let v = Number(row[col]);
      if (isNaN(v)) return;
      const { top, bottom, std } = thresholds.get(col)!;
      v = Math.min(v, top);
      v = Math.max(v, bottom);
      if (addNoise && std > 0) {
        const u1 = Math.random(), u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
        v = Math.min(top, Math.max(bottom, v + noiseLevel * std * z));
      }
      newRow[col] = parseFloat(v.toFixed(4));
    });
    return newRow;
  });

  return {
    technique: "Top/Bottom Coding" + (addNoise ? " + Noise" : ""), family: "SDC",
    processedData: processed, originalCount: data.length, processedCount: processed.length,
    recordsSuppressed: 0,
    informationLoss: calcInfoLoss(data, processed, numericCols),
    executionMs: Math.round(performance.now() - t0),
    stats: {
      topPercentile, bottomPercentile,
      noiseAdded: addNoise ? `Yes (σ_noise = ${noiseLevel} × col_std)` : "No",
      columnsProtected: numericCols.length,
      thresholdSummary: numericCols.length > 0
        ? `${numericCols[0]}: bottom=${thresholds.get(numericCols[0])?.bottom}, top=${thresholds.get(numericCols[0])?.top}`
        : "N/A",
      privacyGuarantee: "Outlier suppression — eliminates extreme unique values",
    },
    warnings: numericCols.length === 0
      ? ["No numeric columns selected. Top/Bottom Coding applies to numeric attributes only."]
      : ["Does not protect against membership inference or model inversion."],
  };
}

function sdcEmpty(technique: string): PrivacyResult {
  return {
    technique, family: "SDC",
    processedData: [], originalCount: 0, processedCount: 0,
    recordsSuppressed: 0, informationLoss: 0, executionMs: 0,
    stats: {}, warnings: ["No data or no columns provided."],
  };
}

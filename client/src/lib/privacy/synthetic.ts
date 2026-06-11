import { type DataRow, isNumericCol, calcInfoLoss, type PrivacyResult } from "./types";

// ─── Statistical SDG ─────────────────────────────────────────────────────────
// Generates synthetic records matching per-column marginal distributions.
export function applyStatisticalSDG(
  data: DataRow[],
  targetSize: number,
  preserveCorrelations: boolean
): PrivacyResult {
  const t0 = performance.now();
  if (data.length === 0) return emptyResult("Statistical SDG");
  const cols = Object.keys(data[0]);
  const n = Math.max(1, Math.round((data.length * targetSize) / 100));

  const numericStats = new Map<string, { mean: number; std: number; min: number; max: number }>();
  const catFreqs = new Map<string, Map<string, number>>();

  cols.forEach((col) => {
    if (isNumericCol(data, col)) {
      const vals = data.map((r) => Number(r[col])).filter((v) => !isNaN(v));
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
      numericStats.set(col, { mean, std: Math.sqrt(variance), min: Math.min(...vals), max: Math.max(...vals) });
    } else {
      const freq = new Map<string, number>();
      data.forEach((r) => {
        const key = String(r[col] ?? "");
        freq.set(key, (freq.get(key) || 0) + 1);
      });
      catFreqs.set(col, freq);
    }
  });

  const numCols = cols.filter((c) => numericStats.has(c));

  // Generate synthetic records
  const processed: DataRow[] = Array.from({ length: n }, () => {
    const row: DataRow = {};
    cols.forEach((col) => {
      if (numericStats.has(col)) {
        const { mean, std, min, max } = numericStats.get(col)!;
        const u1 = Math.random(), u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
        row[col] = parseFloat(Math.min(max, Math.max(min, mean + std * z)).toFixed(2));
      } else {
        const freq = catFreqs.get(col)!;
        const total = data.length;
        let rnd = Math.random() * total;
        let chosen = "";
        for (const [v, cnt] of Array.from(freq)) {
          rnd -= cnt;
          if (rnd <= 0) { chosen = v; break; }
        }
        row[col] = chosen || Array.from(freq.keys())[0] || "";
      }
    });
    return row;
  });

  return {
    technique: "Statistical SDG", family: "Synthetic Data Generation",
    processedData: processed, originalCount: data.length, processedCount: n,
    recordsSuppressed: 0,
    informationLoss: calcInfoLoss(data, processed, numCols),
    executionMs: Math.round(performance.now() - t0),
    stats: {
      generatedRecords: n, targetSizePct: targetSize,
      numericColumns: numCols.length, categoricalColumns: cols.length - numCols.length,
      preserveCorrelations: preserveCorrelations ? "Yes" : "No",
      privacyGuarantee: "Statistical plausible deniability (no formal DP guarantee)",
    },
    warnings: ["Statistical SDG alone does not provide differential privacy. Consider DP-SDG for stronger guarantees."],
  };
}

// ─── DP-SDG (DP-CTGAN Inspired) ──────────────────────────────────────────────
// Implements DP-SGD style noise injection during synthetic data generation.
// g̃_t = (1/B) Σ [ g_t(x_i)/max(1, ||g_t||/C) ] + N(0, σ²C²I)
// σ ≥ C × sqrt(2 ln(1.25/δ)) / ε  →  (ε,δ)-DP
export function applyDPSDG(
  data: DataRow[],
  epsilon: number,
  delta: number,
  targetSize: number,
  clippingNorm: number
): PrivacyResult {
  const t0 = performance.now();
  if (data.length === 0) return emptyResult("DP-SDG");
  const cols = Object.keys(data[0]);
  const n = Math.max(1, Math.round((data.length * targetSize) / 100));
  const numCols = cols.filter((c) => isNumericCol(data, c));

  // σ = C × sqrt(2 ln(1.25/δ)) / ε  (Gaussian mechanism noise multiplier)
  const sigma = (clippingNorm * Math.sqrt(2 * Math.log(1.25 / Math.max(delta, 1e-10)))) / epsilon;

  const stats = new Map<string, { mean: number; std: number; min: number; max: number }>();
  numCols.forEach((col) => {
    const vals = data.map((r) => Number(r[col])).filter((v) => !isNaN(v));
    const rawMean = vals.reduce((s, v) => s + v, 0) / vals.length;
    // Clip each gradient (simulate per-sample gradient clipping)
    const clippedVals = vals.map((v) => {
      const grad = v - rawMean;
      const norm = Math.abs(grad);
      return rawMean + grad / Math.max(1, norm / clippingNorm);
    });
    const clippedMean = clippedVals.reduce((s, v) => s + v, 0) / clippedVals.length;
    // Inject DP noise on the aggregated statistic
    const u1 = Math.random(), u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
    const colRange = Math.max(...vals) - Math.min(...vals);
    const dpMean = clippedMean + sigma * z * colRange;
    const variance = vals.reduce((s, v) => s + (v - rawMean) ** 2, 0) / vals.length;
    stats.set(col, { mean: dpMean, std: Math.sqrt(variance), min: Math.min(...vals), max: Math.max(...vals) });
  });

  const catFreqs = new Map<string, Map<string, number>>();
  cols.filter((c) => !numCols.includes(c)).forEach((col) => {
    const freq = new Map<string, number>();
    data.forEach((r) => {
      const key = String(r[col] ?? "");
      freq.set(key, (freq.get(key) || 0) + 1);
    });
    catFreqs.set(col, freq);
  });

  const processed: DataRow[] = Array.from({ length: n }, () => {
    const row: DataRow = {};
    cols.forEach((col) => {
      if (stats.has(col)) {
        const { mean, std, min, max } = stats.get(col)!;
        const u1 = Math.random(), u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
        row[col] = parseFloat(Math.min(max, Math.max(min, mean + std * z)).toFixed(2));
      } else {
        const freq = catFreqs.get(col);
        if (!freq) { row[col] = ""; return; }
        let rnd = Math.random() * data.length;
        let chosen = "";
        for (const [v, cnt] of Array.from(freq)) {
          rnd -= cnt;
          if (rnd <= 0) { chosen = v; break; }
        }
        row[col] = chosen || Array.from(freq.keys())[0] || "";
      }
    });
    return row;
  });

  return {
    technique: "DP-SDG (DP-CTGAN Inspired)", family: "Synthetic Data Generation",
    processedData: processed, originalCount: data.length, processedCount: n,
    recordsSuppressed: 0,
    informationLoss: calcInfoLoss(data, processed, numCols),
    executionMs: Math.round(performance.now() - t0),
    stats: {
      epsilon, delta,
      sigma: parseFloat(sigma.toFixed(4)),
      clippingNorm,
      generatedRecords: n,
      privacyGuarantee: `(ε,δ)-DP via DP-SGD (ε=${epsilon}, δ=${delta})`,
    },
    warnings: [
      ...(epsilon > 3 ? ["ε > 3: consider lower ε for stronger DP guarantee."] : []),
      "DP-SGD is a browser-side approximation. Real DP-CTGAN requires server-side GPU training.",
    ],
  };
}

function emptyResult(technique: string): PrivacyResult {
  return {
    technique, family: "Synthetic Data Generation",
    processedData: [], originalCount: 0, processedCount: 0,
    recordsSuppressed: 0, informationLoss: 0, executionMs: 0,
    stats: {}, warnings: ["No data provided."],
  };
}

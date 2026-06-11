import { type DataRow, columnRange, isNumericCol, calcInfoLoss, type PrivacyResult } from "./types";

// ─── Laplace Mechanism ──────────────────────────────────────────────────────
// M(D) = f(D) + Lap(0, Δf/ε)
// Global sensitivity Δf = max range of numeric column
function laplaceSample(scale: number): number {
  const u = Math.random() - 0.5;
  return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
}

export function applyLaplace(
  data: DataRow[],
  epsilon: number,
  targetCols: string[]
): PrivacyResult {
  const t0 = performance.now();
  const numericCols = targetCols.filter((c) => isNumericCol(data, c));
  const processed: DataRow[] = data.map((row) => {
    const newRow = { ...row };
    for (const col of numericCols) {
      const v = Number(row[col]);
      if (!isNaN(v)) {
        const sensitivity = columnRange(data, col);
        const scale = sensitivity / epsilon;
        newRow[col] = parseFloat((v + laplaceSample(scale)).toFixed(4));
      }
    }
    return newRow;
  });
  return {
    technique: "Laplace Mechanism", family: "Differential Privacy",
    processedData: processed, originalCount: data.length, processedCount: processed.length,
    recordsSuppressed: 0,
    informationLoss: calcInfoLoss(data, processed, numericCols),
    executionMs: Math.round(performance.now() - t0),
    stats: {
      epsilon: epsilon,
      columnsPerturbed: numericCols.length,
      avgNoiseScale: numericCols.reduce((s, c) => s + columnRange(data, c) / epsilon, 0) / Math.max(numericCols.length, 1),
      privacyGuarantee: `ε-DP (ε = ${epsilon})`,
    },
    warnings: epsilon > 5 ? ["High ε value — weaker privacy guarantee. Consider ε ≤ 1.0 for strong protection."] : [],
  };
}

// ─── Gaussian Mechanism ─────────────────────────────────────────────────────
// σ ≥ Δf × sqrt(2 ln(1.25/δ)) / ε   →  (ε,δ)-DP
export function applyGaussian(
  data: DataRow[],
  epsilon: number,
  delta: number,
  targetCols: string[]
): PrivacyResult {
  const t0 = performance.now();
  const numericCols = targetCols.filter((c) => isNumericCol(data, c));
  const processed: DataRow[] = data.map((row) => {
    const newRow = { ...row };
    for (const col of numericCols) {
      const v = Number(row[col]);
      if (!isNaN(v)) {
        const sensitivity = columnRange(data, col);
        const sigma = (sensitivity * Math.sqrt(2 * Math.log(1.25 / delta))) / epsilon;
        // Box-Muller transform
        const u1 = Math.random(), u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        newRow[col] = parseFloat((v + sigma * z).toFixed(4));
      }
    }
    return newRow;
  });
  return {
    technique: "Gaussian Mechanism", family: "Differential Privacy",
    processedData: processed, originalCount: data.length, processedCount: processed.length,
    recordsSuppressed: 0,
    informationLoss: calcInfoLoss(data, processed, numericCols),
    executionMs: Math.round(performance.now() - t0),
    stats: {
      epsilon, delta,
      sigma: numericCols.length > 0
        ? parseFloat(((columnRange(data, numericCols[0]) * Math.sqrt(2 * Math.log(1.25 / delta))) / epsilon).toFixed(4))
        : 0,
      columnsPerturbed: numericCols.length,
      privacyGuarantee: `(ε,δ)-DP (ε=${epsilon}, δ=${delta})`,
    },
    warnings: [
      ...(delta > 1e-3 ? ["δ is large — use δ ≤ 1/N² for meaningful privacy guarantee."] : []),
      ...(epsilon > 5 ? ["High ε value — weaker privacy guarantee."] : []),
    ],
  };
}

// ─── Exponential Mechanism ──────────────────────────────────────────────────
// For categorical columns: sample r with probability ∝ exp(ε × u(D,r) / 2Δu)
// Utility function u(D,r) = frequency of value r in column (normalised)
export function applyExponential(
  data: DataRow[],
  epsilon: number,
  targetCols: string[]
): PrivacyResult {
  const t0 = performance.now();
  const catCols = targetCols.filter((c) => !isNumericCol(data, c));
  const processed: DataRow[] = data.map((row) => {
    const newRow = { ...row };
    for (const col of catCols) {
      // Build frequency distribution
      const freq = new Map<string, number>();
      data.forEach((r) => freq.set(String(r[col]), (freq.get(String(r[col])) || 0) + 1));
      const vals = Array.from(freq.keys());
      const N = data.length;
      // Utility = frequency/N (more frequent = higher utility)
      const deltaU = 1 / N; // sensitivity of frequency utility
      const scores = vals.map((v) => Math.exp((epsilon * (freq.get(v)! / N)) / (2 * deltaU)));
      const total = scores.reduce((s, v) => s + v, 0);
      const probs = scores.map((s) => s / total);
      // Sample from exponential distribution
      let rnd = Math.random();
      let chosen = vals[vals.length - 1];
      for (let i = 0; i < vals.length; i++) {
        rnd -= probs[i];
        if (rnd <= 0) { chosen = vals[i]; break; }
      }
      newRow[col] = chosen;
    }
    return newRow;
  });
  return {
    technique: "Exponential Mechanism", family: "Differential Privacy",
    processedData: processed, originalCount: data.length, processedCount: processed.length,
    recordsSuppressed: 0,
    informationLoss: catCols.length > 0 ? epsilon > 1 ? 0.05 : 0.2 : 0,
    executionMs: Math.round(performance.now() - t0),
    stats: {
      epsilon,
      categoricalColumnsPerturbed: catCols.length,
      privacyGuarantee: `ε-DP via Exponential Mechanism (ε=${epsilon})`,
    },
    warnings: catCols.length === 0 ? ["No categorical columns found — Exponential Mechanism applies to categorical data."] : [],
  };
}

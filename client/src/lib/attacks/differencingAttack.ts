import { getRiskLevel, isNumeric, type DataRow, type RiskLevel } from "./utils";

export interface DifferencingResult {
  riskScore: number;
  riskLevel: RiskLevel;
  totalPairs: number;
  leakyPairs: number;
  leakyPct: number;
  maxLeakage: number;
  avgLeakage: number;
  maxLeakageColumn: string;
  perColumnRisks: {
    column: string;
    statistic: string;
    globalValue: number;
    maxLeakage: number;
    avgLeakage: number;
    leakyRecords: number;
    leakyPct: number;
    riskLevel: RiskLevel;
  }[];
  leakageHistogram: { bucket: string; count: number }[];
  topLeakyRecords: { index: number; column: string; leakage: number; globalVal: number; withoutVal: number }[];
  recommendations: string[];
}

/**
 * Differencing Attack
 *
 * Objective: Detect whether aggregate statistics (avg, sum, count) computed over a
 * dataset reveal information about a single individual when two queries are compared.
 *
 * Mathematical Model:
 *
 *   Q1 = aggregate statistic on full dataset D
 *   Q2 = aggregate statistic on D \ {r}  (dataset with record r removed)
 *
 *   Leakage(r, col) = |Q1 - Q2| / max(|Q1|, 1)   (normalised)
 *
 *   A query pair is "leaky" if Leakage > threshold (default 0.05 = 5%)
 *
 *   Dataset-level risk:
 *     Risk = leaky_pairs / total_pairs
 *
 * Statistics evaluated per numeric column:
 *   - Mean (most sensitive to outliers)
 *   - Sum  (reveals exact contribution)
 *
 * Reference: Dwork et al., "The Algorithmic Foundations of Differential Privacy",
 *            Foundations and Trends in Theoretical CS, 2014.
 */
export function runDifferencingAttack(
  data: DataRow[],
  quasiIdentifiers: string[]
): DifferencingResult {
  if (data.length === 0) return emptyResult();

  // Determine numeric columns to analyse (all columns, not just QIs)
  const allCols = Object.keys(data[0] || {});
  const numericCols = allCols.filter((col) => isNumeric(data, col));

  if (numericCols.length === 0) return emptyResult();

  const THRESHOLD = 0.05;
  // Sample up to 500 records for performance (leave-one-out is O(N²))
  const sample = data.length > 500 ? data.slice(0, 500) : data;
  const N = sample.length;

  let totalPairs = 0;
  let leakyPairs = 0;
  let globalMaxLeakage = 0;
  let globalMaxCol = "";
  const allLeakages: number[] = [];

  const perColumnRisks: DifferencingResult["perColumnRisks"] = [];
  const topLeakyRecords: DifferencingResult["topLeakyRecords"] = [];

  for (const col of numericCols) {
    const vals = sample.map((r) => Number(r[col])).filter((v) => !isNaN(v));
    if (vals.length < 2) continue;

    // Global statistics
    const globalSum = vals.reduce((s, v) => s + v, 0);
    const globalMean = globalSum / vals.length;

    let colLeaky = 0;
    let colMaxLeakage = 0;
    let colSumLeakage = 0;
    let colPairs = 0;

    for (let i = 0; i < N; i++) {
      const v = Number(sample[i][col]);
      if (isNaN(v)) continue;

      // Leave-one-out mean
      const looMean = (globalSum - v) / (vals.length - 1);
      const leakageMean = Math.abs(globalMean - looMean) / Math.max(Math.abs(globalMean), 1);

      // Leave-one-out sum (absolute normalized by global sum)
      const looSum = globalSum - v;
      const leakageSum = Math.abs(v) / Math.max(Math.abs(globalSum), 1);

      const maxLeakage = Math.max(leakageMean, leakageSum);
      allLeakages.push(maxLeakage);
      colSumLeakage += maxLeakage;
      colPairs++;
      totalPairs++;

      if (maxLeakage > THRESHOLD) {
        leakyPairs++;
        colLeaky++;
      }
      if (maxLeakage > colMaxLeakage) {
        colMaxLeakage = maxLeakage;
      }
      if (maxLeakage > globalMaxLeakage) {
        globalMaxLeakage = maxLeakage;
        globalMaxCol = col;
        topLeakyRecords.push({
          index: i,
          column: col,
          leakage: parseFloat((maxLeakage * 100).toFixed(2)),
          globalVal: parseFloat(globalMean.toFixed(2)),
          withoutVal: parseFloat(looMean.toFixed(2)),
        });
      }
    }

    if (colPairs > 0) {
      const colAvgLeakage = colSumLeakage / colPairs;
      perColumnRisks.push({
        column: col,
        statistic: "mean+sum",
        globalValue: parseFloat(globalMean.toFixed(3)),
        maxLeakage: parseFloat((colMaxLeakage * 100).toFixed(2)),
        avgLeakage: parseFloat((colAvgLeakage * 100).toFixed(2)),
        leakyRecords: colLeaky,
        leakyPct: parseFloat(((colLeaky / colPairs) * 100).toFixed(1)),
        riskLevel: getRiskLevel(colMaxLeakage >= 0.6 ? 0.75 : colMaxLeakage >= 0.4 ? 0.6 : colMaxLeakage >= 0.2 ? 0.4 : 0.1),
      });
    }
  }

  const avgLeakage = allLeakages.length > 0 ? allLeakages.reduce((s, v) => s + v, 0) / allLeakages.length : 0;
  const riskScore = totalPairs > 0 ? leakyPairs / totalPairs : 0;

  // Leakage histogram (normalized %)
  const buckets = [
    { label: "0-5% (Safe)", min: 0, max: 0.05 },
    { label: "5-20%", min: 0.05, max: 0.2 },
    { label: "20-40%", min: 0.2, max: 0.4 },
    { label: "40-60%", min: 0.4, max: 0.6 },
    { label: ">60% (Critical)", min: 0.6, max: Infinity },
  ];
  const leakageHistogram = buckets.map(({ label, min, max }) => ({
    bucket: label,
    count: allLeakages.filter((v) => v >= min && v < max).length,
  }));

  // Top 10 leaky records (sorted by leakage desc)
  const top10 = [...topLeakyRecords].sort((a, b) => b.leakage - a.leakage).slice(0, 10);

  return {
    riskScore,
    riskLevel: getRiskLevel(riskScore),
    totalPairs,
    leakyPairs,
    leakyPct: parseFloat(((leakyPairs / Math.max(totalPairs, 1)) * 100).toFixed(1)),
    maxLeakage: parseFloat((globalMaxLeakage * 100).toFixed(2)),
    avgLeakage: parseFloat((avgLeakage * 100).toFixed(2)),
    maxLeakageColumn: globalMaxCol,
    perColumnRisks: perColumnRisks.sort((a, b) => b.maxLeakage - a.maxLeakage),
    leakageHistogram,
    topLeakyRecords: top10,
    recommendations: buildRecommendations(riskScore, globalMaxLeakage, leakyPairs, totalPairs, perColumnRisks),
  };
}

function buildRecommendations(
  risk: number,
  maxLeakage: number,
  leaky: number,
  total: number,
  perCol: DifferencingResult["perColumnRisks"]
): string[] {
  const recs: string[] = [];
  const leakyPct = total > 0 ? (leaky / total) * 100 : 0;

  if (maxLeakage > 0.4) {
    recs.push(`Maximum leakage is ${(maxLeakage * 100).toFixed(0)}% — a single record disproportionately affects aggregate statistics. Apply Laplace noise (Differential Privacy, ε ≤ 1.0) to protect this column.`);
  }
  if (leakyPct > 40) {
    recs.push(`${leakyPct.toFixed(0)}% of query pairs are leaky. This indicates the dataset has outliers or small groups. Consider data suppression for extreme values.`);
  }
  const topRiskCol = perCol[0];
  if (topRiskCol && topRiskCol.leakyPct > 30) {
    recs.push(`Column "${topRiskCol.column}" has the highest differencing risk (${topRiskCol.leakyPct}% leaky queries). This column should use Laplace noise with sensitivity Δf = range / N.`);
  }
  recs.push("Implement differential privacy (ε-DP): add calibrated Laplace noise Lap(Δf/ε) to all published aggregate statistics to prevent differencing attacks.");
  if (risk < 0.2) {
    recs.push("Differencing risk is LOW. Aggregate statistics are not significantly influenced by individual records — data distribution is well-balanced.");
  }
  return recs;
}

function emptyResult(): DifferencingResult {
  return {
    riskScore: 0, riskLevel: "LOW", totalPairs: 0, leakyPairs: 0, leakyPct: 0,
    maxLeakage: 0, avgLeakage: 0, maxLeakageColumn: "",
    perColumnRisks: [], leakageHistogram: [], topLeakyRecords: [],
    recommendations: ["No numeric columns found. Differencing attack requires at least one numeric column."],
  };
}

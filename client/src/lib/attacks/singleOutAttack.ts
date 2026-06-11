import { DataRow, getRiskLevel, RiskLevel } from "./utils";

export interface SingleOutResult {
  riskScore: number;
  riskLevel: RiskLevel;
  singlingOutRate: number;
  avgFootprint: number;
  gdprStatus: "FAIL" | "PASS";
  footprintHistogram: { label: string; count: number }[];
  effortCurve: { k: number; pct: number }[];
  attrSingulability: { attr: string; score: number }[];
  recommendations: string[];
  totalRecords: number;
  singulableCount: number;
}

export function runSingleOutAttack(
  data: DataRow[],
  allColumns: string[],
  kThreshold: number
): SingleOutResult {
  const n = data.length;
  if (n === 0 || allColumns.length === 0) return emptyResult();

  // Limit to manageable size for performance
  const sample = n > 300 ? data.slice(0, 300) : data;
  const sn = sample.length;
  const cols = allColumns.slice(0, Math.min(allColumns.length, 10));
  const maxCombo = Math.min(5, cols.length);

  const singulableMap = new Map<number, number>(); // recordIdx → minComboSize
  const footprints: number[] = [];

  for (let i = 0; i < sn; i++) {
    let singled = false;
    let minCombo = Infinity;

    for (let k = 1; k <= maxCombo && !singled; k++) {
      const combos = getCombinations(cols, k);
      for (const combo of combos) {
        const count = sample.filter((other) =>
          combo.every((col) => String(other[col] ?? "") === String(sample[i][col] ?? ""))
        ).length;
        if (count === 1) {
          singled = true;
          minCombo = k;
          break;
        }
      }
    }

    if (singled) {
      singulableMap.set(i, minCombo);
      footprints.push(minCombo);
    }
  }

  const singulableCount = singulableMap.size;
  const singlingOutRate = singulableCount / sn;
  const avgFootprint = footprints.length > 0 ? footprints.reduce((a, b) => a + b, 0) / footprints.length : 0;

  // Footprint histogram
  const footprintHistogram = [1, 2, 3, 4, 5].map((k) => ({
    label: `${k} attr${k > 1 ? "s" : ""}`,
    count: footprints.filter((f) => f === k).length,
  }));

  // Effort curve: for each k, what % of records are singulable with ≤ k attrs
  const effortCurve = [1, 2, 3, 4, 5].map((k) => ({
    k,
    pct: parseFloat(((footprints.filter((f) => f <= k).length / sn) * 100).toFixed(1)),
  }));

  // Per-attribute singulability score
  const attrSingulability = cols.map((col) => {
    const unique = sample.filter((row) =>
      sample.filter((r) => String(r[col] ?? "") === String(row[col] ?? "")).length === 1
    ).length;
    return { attr: col, score: parseFloat((unique / sn).toFixed(3)) };
  }).sort((a, b) => b.score - a.score);

  const gdprStatus: "FAIL" | "PASS" = singlingOutRate > 0.05 ? "FAIL" : "PASS";

  const recommendations: string[] = [];
  if (singlingOutRate > 0.5) recommendations.push("CRITICAL: More than 50% of records can be singled out — serious GDPR/DPDP violation.");
  if (avgFootprint <= 2) recommendations.push("Records can be singled out with very few attributes — attacker needs minimal background knowledge.");
  const topAttr = attrSingulability[0];
  if (topAttr && topAttr.score > 0.1) recommendations.push(`Attribute '${topAttr.attr}' alone can single out ${(topAttr.score * 100).toFixed(1)}% of records — consider suppression or generalization.`);
  if (gdprStatus === "FAIL") recommendations.push("Dataset fails GDPR Article 4(1) singling-out standard — anonymization required before publication.");
  if (recommendations.length === 0) recommendations.push("Singling-out risk is within GDPR/DPDP acceptable bounds.");

  return {
    riskScore: singlingOutRate,
    riskLevel: getRiskLevel(singlingOutRate),
    singlingOutRate,
    avgFootprint: parseFloat(avgFootprint.toFixed(2)),
    gdprStatus,
    footprintHistogram,
    effortCurve,
    attrSingulability,
    recommendations,
    totalRecords: sn,
    singulableCount,
  };
}

function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 1) return arr.map((v) => [v]);
  const result: T[][] = [];
  for (let i = 0; i <= arr.length - k; i++) {
    const rest = getCombinations(arr.slice(i + 1), k - 1);
    rest.forEach((combo) => result.push([arr[i], ...combo]));
  }
  return result;
}

function emptyResult(): SingleOutResult {
  return {
    riskScore: 0, riskLevel: "LOW", singlingOutRate: 0, avgFootprint: 0,
    gdprStatus: "PASS", footprintHistogram: [], effortCurve: [], attrSingulability: [],
    recommendations: ["No data or columns selected."], totalRecords: 0, singulableCount: 0,
  };
}

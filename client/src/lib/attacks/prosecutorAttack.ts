import { buildEquivalenceClasses, DataRow, EquivalenceClass, getRiskLevel, RiskLevel } from "./utils";

export interface ProsecutorResult {
  riskScore: number;
  riskLevel: RiskLevel;
  uniquenessRate: number;
  highRiskRate: number;
  avgEcSize: number;
  minK: number;
  uniqueRecordsCount: number;
  histogram: { label: string; count: number; risk: number }[];
  linkScoreDistribution: { bucket: string; count: number }[];
  topVulnerable: { qiCombo: string; linkScore: number; ecSize: number }[];
  recommendations: string[];
  equivalenceClasses: EquivalenceClass[];
  totalRecords: number;
}

export function runProsecutorAttack(
  data: DataRow[],
  quasiIdentifiers: string[],
  kThreshold: number
): ProsecutorResult {
  const n = data.length;
  if (n === 0 || quasiIdentifiers.length === 0) {
    return emptyResult();
  }

  const ecs = buildEquivalenceClasses(data, quasiIdentifiers);

  // Generate auxiliary dataset (3x size, same QI distribution)
  const auxData = generateAuxDataset(data, quasiIdentifiers);

  // Per-record link scores
  const linkScores: number[] = [];
  let totalLinkScore = 0;

  data.forEach((row) => {
    const ecKey = quasiIdentifiers.map((qi) => String(row[qi] ?? "")).join("|");
    const matchesInAux = auxData.filter((auxRow) =>
      quasiIdentifiers.every((qi) => String(auxRow[qi] ?? "") === String(row[qi] ?? ""))
    ).length;

    let score: number;
    if (matchesInAux === 0) score = 0;
    else if (matchesInAux === 1) score = 1.0;
    else score = 1 / matchesInAux;

    linkScores.push(score);
    totalLinkScore += score;
  });

  const prosecutorRisk = totalLinkScore / n;

  // Metrics
  const uniqueEcs = ecs.filter((ec) => ec.size === 1);
  const uniquenessRate = uniqueEcs.length / n;
  const highRiskCount = ecs.filter((ec) => ec.size < kThreshold).reduce((s, ec) => s + ec.size, 0);
  const highRiskRate = highRiskCount / n;
  const avgEcSize = n / ecs.length;
  const minK = Math.min(...ecs.map((ec) => ec.size));

  // Histogram: EC size buckets
  const buckets = [
    { label: "1 (Unique)", min: 1, max: 1 },
    { label: "2–4", min: 2, max: 4 },
    { label: "5–10", min: 5, max: 10 },
    { label: "11–20", min: 11, max: 20 },
    { label: ">20", min: 21, max: Infinity },
  ];
  const histogram = buckets.map((b) => {
    const inBucket = ecs.filter((ec) => ec.size >= b.min && ec.size <= b.max);
    const count = inBucket.reduce((s, ec) => s + ec.size, 0);
    const avgRisk = inBucket.length > 0
      ? inBucket.reduce((s, ec) => s + 1 / ec.size, 0) / inBucket.length
      : 0;
    return { label: b.label, count, risk: parseFloat((avgRisk * 100).toFixed(1)) };
  });

  // Link score distribution
  const scoreBuckets = ["0", "0.01–0.25", "0.26–0.50", "0.51–0.75", "0.76–0.99", "1.0"];
  const linkScoreDistribution = scoreBuckets.map((b) => {
    let count = 0;
    if (b === "0") count = linkScores.filter((s) => s === 0).length;
    else if (b === "0.01–0.25") count = linkScores.filter((s) => s > 0 && s <= 0.25).length;
    else if (b === "0.26–0.50") count = linkScores.filter((s) => s > 0.25 && s <= 0.5).length;
    else if (b === "0.51–0.75") count = linkScores.filter((s) => s > 0.5 && s <= 0.75).length;
    else if (b === "0.76–0.99") count = linkScores.filter((s) => s > 0.75 && s < 1.0).length;
    else count = linkScores.filter((s) => s === 1.0).length;
    return { bucket: b, count };
  });

  // Top 10 most vulnerable (unique ECs or high link score)
  const topVulnerable = ecs
    .filter((ec) => ec.size <= 3)
    .sort((a, b) => a.size - b.size)
    .slice(0, 10)
    .map((ec) => ({
      qiCombo: ec.key.split("|").map((v, i) => `${quasiIdentifiers[i] || i}=${v}`).join(", "),
      linkScore: parseFloat((1 / ec.size).toFixed(3)),
      ecSize: ec.size,
    }));

  // Recommendations
  const recommendations: string[] = [];
  if (minK === 1) recommendations.push("CRITICAL: Unique records present — apply suppression for all singleton equivalence classes.");
  if (prosecutorRisk > 0.4) recommendations.push("Prosecutor risk is very high. Increase k-threshold or apply generalization.");
  if (uniquenessRate > 0.3) recommendations.push(`${(uniquenessRate * 100).toFixed(0)}% of records are unique — consider generalization of high-cardinality quasi-identifiers.`);
  if (highRiskRate > 0.5) recommendations.push("More than 50% of records fall below the k-threshold — apply stricter anonymization.");
  if (recommendations.length === 0) recommendations.push("Prosecutor attack risk is within acceptable bounds.");

  return {
    riskScore: prosecutorRisk,
    riskLevel: getRiskLevel(prosecutorRisk),
    uniquenessRate,
    highRiskRate,
    avgEcSize,
    minK,
    uniqueRecordsCount: uniqueEcs.length,
    histogram,
    linkScoreDistribution,
    topVulnerable,
    recommendations,
    equivalenceClasses: ecs,
    totalRecords: n,
  };
}

function generateAuxDataset(data: DataRow[], qis: string[]): DataRow[] {
  const n = data.length;
  const auxSize = n * 3;

  // Build value pools per QI
  const valuePools: Record<string, (string | number)[]> = {};
  qis.forEach((qi) => {
    valuePools[qi] = data.map((r) => r[qi] ?? "");
  });

  const aux: DataRow[] = [];
  for (let i = 0; i < auxSize; i++) {
    const row: DataRow = {};
    qis.forEach((qi) => {
      const pool = valuePools[qi];
      row[qi] = pool[Math.floor(Math.random() * pool.length)];
    });
    aux.push(row);
  }
  return aux;
}

function emptyResult(): ProsecutorResult {
  return {
    riskScore: 0, riskLevel: "LOW", uniquenessRate: 0, highRiskRate: 0,
    avgEcSize: 0, minK: 0, uniqueRecordsCount: 0,
    histogram: [], linkScoreDistribution: [], topVulnerable: [],
    recommendations: ["No data or quasi-identifiers selected."],
    equivalenceClasses: [], totalRecords: 0,
  };
}

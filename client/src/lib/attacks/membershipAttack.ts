import { DataRow, getRiskLevel, RiskLevel } from "./utils";

export interface MembershipResult {
  riskScore: number;
  riskLevel: RiskLevel;
  aucScore: number;
  membershipRiskPct: number;
  isolationRate: number;
  memorization: number;
  rocCurve: { fpr: number; tpr: number }[];
  similarityDistribution: { bucket: string; members: number; nonMembers: number }[];
  thresholdTable: { threshold: number; tpr: number; fpr: number; precision: number }[];
  recommendations: string[];
  totalRecords: number;
}

export function runMembershipAttack(
  data: DataRow[],
  quasiIdentifiers: string[]
): MembershipResult {
  const n = data.length;
  if (n === 0 || quasiIdentifiers.length === 0) return emptyResult();

  // Compute column ranges for numeric similarity
  const ranges = new Map<string, number>();
  quasiIdentifiers.forEach((qi) => {
    const nums = data.map((r) => Number(r[qi])).filter((v) => !isNaN(v));
    ranges.set(qi, nums.length > 0 ? Math.max(1, Math.max(...nums) - Math.min(...nums)) : 1);
  });

  const isNum = new Map<string, boolean>();
  quasiIdentifiers.forEach((qi) => {
    isNum.set(qi, data.slice(0, 20).every((r) => r[qi] === undefined || !isNaN(Number(r[qi]))));
  });

  function similarity(a: DataRow, b: DataRow): number {
    let s = 0;
    quasiIdentifiers.forEach((qi) => {
      if (isNum.get(qi)) {
        const range = ranges.get(qi) || 1;
        s += 1 - Math.abs(Number(a[qi] ?? 0) - Number(b[qi] ?? 0)) / range;
      } else {
        s += String(a[qi] ?? "") === String(b[qi] ?? "") ? 1 : 0;
      }
    });
    return s / quasiIdentifiers.length;
  }

  // Shadow dataset: 30% members + synthetic non-members
  const memberIdx = shuffle(Array.from(Array(n).keys())).slice(0, Math.max(1, Math.floor(n * 0.3)));
  const members = memberIdx.map((i) => data[i]);

  // Generate non-members (same distribution, independent sample)
  const nonMembers: DataRow[] = [];
  const poolSize = Math.min(n, members.length);
  for (let i = 0; i < poolSize; i++) {
    const row: DataRow = {};
    quasiIdentifiers.forEach((qi) => {
      const pool = data.map((r) => r[qi]);
      row[qi] = pool[Math.floor(Math.random() * pool.length)];
    });
    nonMembers.push(row);
  }

  // Compute NN similarity for each probe
  function nnSim(probe: DataRow): number {
    return Math.max(...data.map((r) => similarity(probe, r)));
  }

  const memberScores = members.map((m) => nnSim(m));
  const nonMemberScores = nonMembers.map((nm) => nnSim(nm));

  // Build ROC curve
  const thresholds = Array.from({ length: 20 }, (_, i) => 0.5 + i * 0.025);
  const rocCurve: { fpr: number; tpr: number }[] = [{ fpr: 0, tpr: 0 }];
  const thresholdTable: { threshold: number; tpr: number; fpr: number; precision: number }[] = [];

  thresholds.forEach((t) => {
    const tp = memberScores.filter((s) => s >= t).length;
    const fp = nonMemberScores.filter((s) => s >= t).length;
    const fn = memberScores.filter((s) => s < t).length;
    const tn = nonMemberScores.filter((s) => s < t).length;
    const tpr = members.length > 0 ? tp / members.length : 0;
    const fpr = nonMembers.length > 0 ? fp / nonMembers.length : 0;
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    rocCurve.push({ fpr: parseFloat(fpr.toFixed(3)), tpr: parseFloat(tpr.toFixed(3)) });
    if ([0.6, 0.7, 0.8, 0.85, 0.9].includes(t)) {
      thresholdTable.push({ threshold: t, tpr: parseFloat((tpr * 100).toFixed(1)), fpr: parseFloat((fpr * 100).toFixed(1)), precision: parseFloat((precision * 100).toFixed(1)) });
    }
  });
  rocCurve.push({ fpr: 1, tpr: 1 });

  // AUC via trapezoid
  let auc = 0;
  for (let i = 1; i < rocCurve.length; i++) {
    auc += (rocCurve[i].fpr - rocCurve[i - 1].fpr) * (rocCurve[i].tpr + rocCurve[i - 1].tpr) / 2;
  }
  auc = Math.max(0.5, Math.min(1.0, auc));
  const membershipRisk = Math.max(0, (auc - 0.5) * 2);

  // Isolation rate: records with low NN similarity within dataset
  let isolatedCount = 0;
  const internalSims: number[] = [];
  for (let i = 0; i < Math.min(n, 100); i++) {
    let maxSim = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      maxSim = Math.max(maxSim, similarity(data[i], data[j]));
    }
    internalSims.push(maxSim);
    if (maxSim < 0.7) isolatedCount++;
  }
  const isolationRate = Math.min(n, 100) > 0 ? isolatedCount / Math.min(n, 100) : 0;
  const memorization = internalSims.length > 0 ? internalSims.reduce((a, b) => a + b, 0) / internalSims.length : 0;

  // Similarity distribution histogram
  const buckets = ["0–0.2", "0.2–0.4", "0.4–0.6", "0.6–0.8", "0.8–1.0"];
  const ranges2 = [[0, 0.2], [0.2, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 1.01]];
  const similarityDistribution = buckets.map((bucket, i) => ({
    bucket,
    members: memberScores.filter((s) => s >= ranges2[i][0] && s < ranges2[i][1]).length,
    nonMembers: nonMemberScores.filter((s) => s >= ranges2[i][0] && s < ranges2[i][1]).length,
  }));

  const recommendations: string[] = [];
  if (membershipRisk > 0.5) recommendations.push("CRITICAL: High membership inference risk — dataset records are easily distinguishable from non-members.");
  if (isolationRate > 0.3) recommendations.push(`${(isolationRate * 100).toFixed(0)}% of records are isolated (low NN similarity) — vulnerable to outlier-based membership detection. Apply differential privacy or add synthetic padding records.`);
  if (auc > 0.8) recommendations.push("AUC > 0.8 indicates strong membership leakage — consider adding noise (differential privacy) to reduce distinguishability.");
  if (recommendations.length === 0) recommendations.push("Membership inference risk is within acceptable bounds.");

  return {
    riskScore: membershipRisk,
    riskLevel: getRiskLevel(membershipRisk),
    aucScore: parseFloat(auc.toFixed(3)),
    membershipRiskPct: parseFloat((membershipRisk * 100).toFixed(1)),
    isolationRate: parseFloat(isolationRate.toFixed(3)),
    memorization: parseFloat(memorization.toFixed(3)),
    rocCurve,
    similarityDistribution,
    thresholdTable,
    recommendations,
    totalRecords: n,
  };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function emptyResult(): MembershipResult {
  return {
    riskScore: 0, riskLevel: "LOW", aucScore: 0.5, membershipRiskPct: 0,
    isolationRate: 0, memorization: 0, rocCurve: [], similarityDistribution: [],
    thresholdTable: [], recommendations: ["No data or quasi-identifiers selected."], totalRecords: 0,
  };
}

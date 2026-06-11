import { buildEquivalenceClasses, DataRow, getRiskLevel, RiskLevel } from "./utils";

export interface JournalistResult {
  riskScore: number;
  riskLevel: RiskLevel;
  violations: number;
  violationRate: number;
  hNorm: number;
  riskLift: number;
  histogram: { label: string; count: number; avgRisk: number }[];
  infoGain: { qi: string; gain: number }[];
  recommendations: string[];
  totalRecords: number;
}

export function runJournalistAttack(
  data: DataRow[],
  quasiIdentifiers: string[],
  kThreshold: number
): JournalistResult {
  const n = data.length;
  if (n === 0 || quasiIdentifiers.length === 0) return emptyResult();

  const ecs = buildEquivalenceClasses(data, quasiIdentifiers);

  // Journalist risk = (1/n) * Σ (1/k(r))
  let sumInvK = 0;
  ecs.forEach((ec) => { sumInvK += (1 / ec.size) * ec.size; });
  const journalistRisk = sumInvK / n;

  // Violations: records in ECs below threshold
  const violations = ecs.filter((ec) => ec.size < kThreshold).reduce((s, ec) => s + ec.size, 0);
  const violationRate = violations / n;

  // Shannon entropy of EC size distribution
  const sizeFreq = new Map<number, number>();
  ecs.forEach((ec) => sizeFreq.set(ec.size, (sizeFreq.get(ec.size) || 0) + ec.size));
  let H = 0;
  sizeFreq.forEach((cnt) => {
    const p = cnt / n;
    if (p > 0) H -= p * Math.log2(p);
  });
  const hNorm = n > 1 ? H / Math.log2(n) : 0;

  // Risk lift: how much worse than random guessing
  const randomGuess = 1 / n;
  const riskLift = randomGuess > 0 ? journalistRisk / randomGuess : 1;

  // Histogram
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
      ? (inBucket.reduce((s, ec) => s + 1 / ec.size, 0) / inBucket.length) * 100
      : 0;
    return { label: b.label, count, avgRisk: parseFloat(avgRisk.toFixed(1)) };
  });

  // Information gain: compute EC entropy with each QI removed vs full
  const fullEcs = buildEquivalenceClasses(data, quasiIdentifiers);
  const fullRisk = computeJournalistRisk(fullEcs, n);

  const infoGain = quasiIdentifiers.map((qi) => {
    const reduced = quasiIdentifiers.filter((q) => q !== qi);
    if (reduced.length === 0) return { qi, gain: 0 };
    const reducedEcs = buildEquivalenceClasses(data, reduced);
    const reducedRisk = computeJournalistRisk(reducedEcs, n);
    return { qi, gain: Math.max(0, fullRisk - reducedRisk) };
  }).sort((a, b) => b.gain - a.gain);

  const recommendations: string[] = [];
  if (journalistRisk > 0.4) recommendations.push("Journalist risk is critical — too many unique records relative to dataset size.");
  if (violations > n * 0.3) recommendations.push(`${violations} records violate k-threshold — apply k-anonymity enforcement.`);
  if (hNorm < 0.3) recommendations.push("Low entropy in equivalence class distribution — QI values are too uniform, creating large high-risk groups.");
  const topQI = infoGain[0];
  if (topQI && topQI.gain > 0.01) recommendations.push(`Attribute '${topQI.qi}' contributes most to re-identification risk — consider generalizing it first.`);
  if (recommendations.length === 0) recommendations.push("Journalist attack risk is within acceptable bounds.");

  return {
    riskScore: journalistRisk,
    riskLevel: getRiskLevel(journalistRisk),
    violations,
    violationRate,
    hNorm: parseFloat(hNorm.toFixed(3)),
    riskLift: parseFloat(riskLift.toFixed(1)),
    histogram,
    infoGain,
    recommendations,
    totalRecords: n,
  };
}

function computeJournalistRisk(ecs: ReturnType<typeof buildEquivalenceClasses>, n: number): number {
  let sum = 0;
  ecs.forEach((ec) => { sum += (1 / ec.size) * ec.size; });
  return n > 0 ? sum / n : 0;
}

function emptyResult(): JournalistResult {
  return {
    riskScore: 0, riskLevel: "LOW", violations: 0, violationRate: 0,
    hNorm: 0, riskLift: 1, histogram: [], infoGain: [],
    recommendations: ["No data or quasi-identifiers selected."], totalRecords: 0,
  };
}

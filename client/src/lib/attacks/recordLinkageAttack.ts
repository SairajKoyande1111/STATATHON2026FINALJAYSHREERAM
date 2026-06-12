/**
 * Record Linkage Attack — per SafeData Pipeline spec v1.0
 *
 * Models an adversary who possesses an external dataset and attempts to JOIN
 * it against the anonymised target dataset using shared quasi-identifiers.
 * A record with EC size = 1 can be re-identified with 100% certainty.
 *
 * Core formula:   link_score(r) = 1 / |EC(r)|
 * ECLR            = distinct_ECs / N   (Expected Correct Linkage Rate)
 * WCLR            = 1 / min_EC_size    (Worst-Case Linkage Risk)
 * Amplification   = distinct_ECs       (× better than random guessing)
 */

import { buildEquivalenceClasses, freqDist, totalVariationDistance, getRiskLevel, type DataRow, type RiskLevel } from "./utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LinkageOutcome = "Certain" | "Probable" | "Possible" | "Protected";

export interface RecordLinkageRecordRow {
  rowIdx: number;
  qiValues: Record<string, string>;
  ecSize: number;
  linkScore: number;
  linkageOutcome: LinkageOutcome;
  atRisk: boolean;
}

export interface RecordLinkageLDivResult {
  sa: string;
  minL: number;
  violatingEcs: number;
  totalEcs: number;
  recordsInViolatingEcs: number;
  status: "PASS" | "FAIL";
}

export interface RecordLinkageTCloseResult {
  sa: string;
  maxDistance: number;
  violatingEcs: number;
  totalEcs: number;
  globalDist: { value: string; pct: number }[];
  status: "PASS" | "FAIL";
}

export interface QIContribution {
  qi: string;
  eclrFull: number;
  eclrWithout: number;
  delta: number;
  recommendation: string;
}

export interface RecordLinkageResult {
  riskScore: number;
  riskLevel: RiskLevel;
  N: number;
  totalRecords: number;
  sampleN: number;
  quasiIdentifiers: string[];

  distinctEcs: number;
  eclr: number;
  wclr: number;
  minK: number;
  avgEcSize: number;
  amplificationFactor: number;

  numUniqueRecords: number;
  numProbable: number;
  numPossible: number;
  numProtected: number;

  recordTable: RecordLinkageRecordRow[];
  topVulnerableRecord: RecordLinkageRecordRow | null;
  topVulnerable: { rank: number; qiCombo: string; ecSize: number; linkScore: number; outcome: LinkageOutcome }[];

  ecSizeTable: { label: string; numECs: number; numRecords: number; pct: string; risk: string }[];
  linkScoreDistribution: { bucket: string; count: number }[];

  lDiversityResults: RecordLinkageLDivResult[];
  tClosenessResults: RecordLinkageTCloseResult[];

  qiContribution: QIContribution[];

  recommendations: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function classifyOutcome(ecSize: number, k: number): LinkageOutcome {
  if (ecSize === 1) return "Certain";
  if (ecSize <= 3) return "Probable";
  if (ecSize < k) return "Possible";
  return "Protected";
}

function computeEclr(data: DataRow[], qis: string[]): number {
  if (data.length === 0 || qis.length === 0) return 0;
  const ecMap = new Map<string, number>();
  data.forEach((row) => {
    const key = qis.map((qi) => String(row[qi] ?? "")).join("|");
    ecMap.set(key, (ecMap.get(key) ?? 0) + 1);
  });
  return ecMap.size / data.length;
}

// ─── Main function ────────────────────────────────────────────────────────────

export function runRecordLinkageAttack(
  data: DataRow[],
  quasiIdentifiers: string[],
  kThreshold = 5,
  sensitiveAttributes: string[] = [],
  lThreshold = 3,
  tThreshold = 0.2,
): RecordLinkageResult {
  const N = data.length;
  if (N === 0 || quasiIdentifiers.length === 0) return emptyResult(quasiIdentifiers);

  // ── Step 1: Build EC map ───────────────────────────────────────────────────
  const ecMap = new Map<string, number[]>();
  data.forEach((row, idx) => {
    const key = quasiIdentifiers.map((qi) => String(row[qi] ?? "")).join("|");
    const existing = ecMap.get(key);
    if (existing) existing.push(idx);
    else ecMap.set(key, [idx]);
  });

  const ecSizeArr: number[] = new Array(N);
  ecMap.forEach((indices) => {
    const sz = indices.length;
    indices.forEach((i) => { ecSizeArr[i] = sz; });
  });

  // ── Step 2: Core metrics ───────────────────────────────────────────────────
  const distinctEcs = ecMap.size;
  const eclr = distinctEcs / N;
  const minK = Math.min(...Array.from(ecMap.values()).map((v) => v.length));
  const wclr = 1 / minK;
  const avgEcSize = N / distinctEcs;
  const amplificationFactor = distinctEcs;

  // ── Step 3: Per-record table ───────────────────────────────────────────────
  const recordTable: RecordLinkageRecordRow[] = data.map((row, idx) => {
    const sz = ecSizeArr[idx];
    const linkScore = parseFloat((1 / sz).toFixed(4));
    const outcome = classifyOutcome(sz, kThreshold);
    const qiValues: Record<string, string> = {};
    quasiIdentifiers.forEach((qi) => { qiValues[qi] = String(row[qi] ?? ""); });
    return {
      rowIdx: idx + 1,
      qiValues,
      ecSize: sz,
      linkScore,
      linkageOutcome: outcome,
      atRisk: sz < kThreshold,
    };
  });

  // ── Step 4: Outcome counts ─────────────────────────────────────────────────
  const numUniqueRecords = recordTable.filter((r) => r.ecSize === 1).length;
  const numProbable      = recordTable.filter((r) => r.ecSize >= 2 && r.ecSize <= 3).length;
  const numPossible      = recordTable.filter((r) => r.ecSize >= 4 && r.ecSize < kThreshold).length;
  const numProtected     = recordTable.filter((r) => r.ecSize >= kThreshold).length;

  // ── Step 5: EC Size Distribution Table ────────────────────────────────────
  const ecValues = Array.from(ecMap.values());
  const ecBuckets = [
    { label: "1 (Unique)", test: (s: number) => s === 1,                     risk: "Certain" },
    { label: "2–3",        test: (s: number) => s >= 2 && s <= 3,            risk: "Probable" },
    { label: `4–${Math.max(4, kThreshold - 1)}`, test: (s: number) => s >= 4 && s < kThreshold, risk: "Possible" },
    { label: `${kThreshold}–10`, test: (s: number) => s >= kThreshold && s <= 10, risk: "Protected" },
    { label: ">10",        test: (s: number) => s > 10,                      risk: "Safe" },
  ];

  const ecSizeTable = ecBuckets.map(({ label, test, risk }) => {
    const matching = ecValues.filter((v) => test(v.length));
    const numECs = matching.length;
    const numRecords = matching.reduce((s, v) => s + v.length, 0);
    return { label, numECs, numRecords, pct: N > 0 ? ((numRecords / N) * 100).toFixed(1) + "%" : "0%", risk };
  });

  // ── Step 6: Link Score Distribution ───────────────────────────────────────
  const linkScoreDistribution = [
    { bucket: "1.00 (Certain)",   test: (s: number) => s === 1.0 },
    { bucket: "0.34–0.99 (Prob)", test: (s: number) => s >= 0.34 && s < 1.0 },
    { bucket: "0.20–0.33 (Poss)", test: (s: number) => s >= 0.20 && s < 0.34 },
    { bucket: "0.10–0.19 (Low)",  test: (s: number) => s >= 0.10 && s < 0.20 },
    { bucket: "0.00–0.09 (Safe)", test: (s: number) => s < 0.10 },
  ].map(({ bucket, test }) => ({
    bucket,
    count: recordTable.filter((r) => test(r.linkScore)).length,
  }));

  // ── Step 7: Top 10 vulnerable records ─────────────────────────────────────
  const topVulnerable = [...recordTable]
    .sort((a, b) => b.linkScore - a.linkScore)
    .slice(0, 10)
    .map((r, i) => ({
      rank: i + 1,
      qiCombo: quasiIdentifiers.map((qi) => `${qi}=${r.qiValues[qi]}`).join(", "),
      ecSize: r.ecSize,
      linkScore: r.linkScore,
      outcome: r.linkageOutcome,
    }));

  const topVulnerableRecord = recordTable
    .slice()
    .sort((a, b) => b.linkScore - a.linkScore)[0] ?? null;

  // ── Step 8: L-Diversity ────────────────────────────────────────────────────
  const lDiversityResults: RecordLinkageLDivResult[] = sensitiveAttributes.map((sa) => {
    let minL = Infinity;
    let violatingEcs = 0;
    let recordsInViolatingEcs = 0;
    ecMap.forEach((indices) => {
      const vals = new Set(indices.map((i) => String(data[i][sa] ?? "")));
      const l = vals.size;
      if (l < minL) minL = l;
      if (l < lThreshold) {
        violatingEcs++;
        recordsInViolatingEcs += indices.length;
      }
    });
    return {
      sa,
      minL: minL === Infinity ? 0 : minL,
      violatingEcs,
      totalEcs: distinctEcs,
      recordsInViolatingEcs,
      status: violatingEcs === 0 ? "PASS" : "FAIL",
    };
  });

  // ── Step 9: T-Closeness ────────────────────────────────────────────────────
  const tClosenessResults: RecordLinkageTCloseResult[] = sensitiveAttributes.map((sa) => {
    const globalVals = data.map((r) => String(r[sa] ?? ""));
    const globalDist = freqDist(globalVals);

    // Build global dist for display
    const globalDistDisplay = Array.from(globalDist.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([value, frac]) => ({ value, pct: parseFloat((frac * 100).toFixed(1)) }));

    let maxDistance = 0;
    let violatingEcs = 0;
    ecMap.forEach((indices) => {
      const localVals = indices.map((i) => String(data[i][sa] ?? ""));
      const localDist = freqDist(localVals);
      const tvd = totalVariationDistance(localDist, globalDist);
      if (tvd > maxDistance) maxDistance = tvd;
      if (tvd > tThreshold) violatingEcs++;
    });

    return {
      sa,
      maxDistance: parseFloat(maxDistance.toFixed(4)),
      violatingEcs,
      totalEcs: distinctEcs,
      globalDist: globalDistDisplay,
      status: violatingEcs === 0 ? "PASS" : "FAIL",
    };
  });

  // ── Step 10: QI Contribution Analysis ─────────────────────────────────────
  // For each QI, compute ECLR without that QI and delta = eclr_full - eclr_without
  const qiContribution: QIContribution[] = quasiIdentifiers.map((qi) => {
    const remaining = quasiIdentifiers.filter((q) => q !== qi);
    const eclrWithout = remaining.length > 0 ? computeEclr(data, remaining) : 1 / N;
    const delta = eclr - eclrWithout;
    let recommendation: string;
    if (delta > 0.3) recommendation = "🔴 Primary driver — generalise first";
    else if (delta > 0.1) recommendation = "🟠 High impact — consider generalisation";
    else if (delta > 0) recommendation = "🟡 Low marginal impact";
    else recommendation = "🟢 Minimal risk contribution";
    return { qi, eclrFull: eclr, eclrWithout, delta, recommendation };
  }).sort((a, b) => b.delta - a.delta);

  // ── Step 11: Recommendations ───────────────────────────────────────────────
  const topQI = qiContribution[0]?.qi ?? quasiIdentifiers[0] ?? "selected QIs";
  const recommendations: string[] = [];

  if (numUniqueRecords > 0) {
    recommendations.push(
      `🔴 CRITICAL — ${numUniqueRecords} record${numUniqueRecords !== 1 ? "s are" : " is"} uniquely linkable (EC size = 1). ` +
      `These have a unique QI fingerprint and can be re-identified with 100% certainty from any external dataset. ` +
      `Action: Suppress these ${numUniqueRecords} rows before release, or generalise "${topQI}" by replacing specific values with broader categories.`
    );
  }

  if (eclr > 0.05) {
    recommendations.push(
      `🔴 HIGH — Expected Linkage Rate is ${(eclr * 100).toFixed(1)}% (safe threshold: <5%). ` +
      `Action: Apply k-anonymisation. Increase generalisation of "${topQI}" to raise the minimum EC size to at least ${kThreshold}. Target: ECLR < 5%.`
    );
  }

  if (numProbable > 0) {
    recommendations.push(
      `🟠 MEDIUM — ${numProbable} record${numProbable !== 1 ? "s" : ""} have Probable linkage risk (EC size 2–3). ` +
      `An attacker has a 33–50% chance of correct linkage. Increase generalisation to push all EC sizes to at least ${kThreshold}.`
    );
  }

  if (numPossible > 0) {
    recommendations.push(
      `🟡 LOW — ${numPossible} record${numPossible !== 1 ? "s fall" : " falls"} below your k=${kThreshold} threshold (EC size 4–${kThreshold - 1}). ` +
      `Fine-tune generalisation of lower-impact QIs to bring these groups up to the k threshold.`
    );
  }

  const failingLDiv = lDiversityResults.filter((r) => r.status === "FAIL");
  if (failingLDiv.length > 0) {
    recommendations.push(
      `🟡 L-DIVERSITY — ${failingLDiv.map((r) => r.sa).join(", ")} violate l-diversity (l=${lThreshold}). ` +
      `Even records that survive linkage filtering can leak sensitive attributes if ECs are not l-diverse.`
    );
  }

  const failingTClose = tClosenessResults.filter((r) => r.status === "FAIL");
  if (failingTClose.length > 0) {
    recommendations.push(
      `🟡 T-CLOSENESS — ${failingTClose.map((r) => r.sa).join(", ")} violate t-closeness (t=${tThreshold}). ` +
      `Attribute distributions inside some ECs deviate significantly from the global dataset. Restrict release or apply noise.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      `✅ LOW RISK — ECLR is ${(eclr * 100).toFixed(1)}% and Min-K is ${minK}. ` +
      `Dataset is well-protected against record linkage attacks under the current quasi-identifier selection.`
    );
  }

  recommendations.push(
    `ℹ️ NEXT STEP — Go to "Privacy Enhancement" to apply generalisation and suppression automatically. ` +
    `After enhancement, re-run this assessment to verify improvement.`
  );

  return {
    riskScore: parseFloat(eclr.toFixed(4)),
    riskLevel: eclr > 0.2 ? "HIGH" : eclr > 0.05 ? "MEDIUM" : "LOW",
    N,
    totalRecords: N,
    sampleN: N,
    quasiIdentifiers,
    distinctEcs,
    eclr,
    wclr,
    minK,
    avgEcSize,
    amplificationFactor,
    numUniqueRecords,
    numProbable,
    numPossible,
    numProtected,
    recordTable,
    topVulnerableRecord,
    topVulnerable,
    ecSizeTable,
    linkScoreDistribution,
    lDiversityResults,
    tClosenessResults,
    qiContribution,
    recommendations,
  };
}

// ─── Empty result ─────────────────────────────────────────────────────────────

function emptyResult(qis: string[]): RecordLinkageResult {
  return {
    riskScore: 0, riskLevel: "LOW", N: 0, totalRecords: 0, sampleN: 0,
    quasiIdentifiers: qis,
    distinctEcs: 0, eclr: 0, wclr: 0, minK: 0, avgEcSize: 0, amplificationFactor: 0,
    numUniqueRecords: 0, numProbable: 0, numPossible: 0, numProtected: 0,
    recordTable: [], topVulnerableRecord: null, topVulnerable: [],
    ecSizeTable: [], linkScoreDistribution: [],
    lDiversityResults: [], tClosenessResults: [],
    qiContribution: [],
    recommendations: ["Select quasi-identifiers to run the Record Linkage Attack."],
  };
}

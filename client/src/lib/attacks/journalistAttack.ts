/**
 * Journalist Attack — per NISTIR 8053 / SafeData Pipeline spec v1.0
 *
 * The journalist DOES NOT know the target is in the dataset.
 * Risk is based on estimated POPULATION equivalence class size, not just sample.
 * Population size is derived from Multiplier_comb (survey expansion factor) or
 * a fallback sampling fraction.
 *
 * Journalist_Risk(r) = 1 / population_ec_size(r)
 * Re_ID_Risk         = mean(Journalist_Risk across all records)
 * Journalist Risk ≤ Prosecutor Risk — always.
 */

import {
  DataRow,
  getRiskLevel,
  RiskLevel,
} from "./utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JournalistRecordRow {
  rowIdx: number;
  qiValues: Record<string, string>;
  ecSizeSample: number;
  ecSizePopulation: number;
  prosecutorLinkScore: number;
  journalistLinkScore: number;
  atRisk: boolean;         // population EC < k
  atRiskProsecutor: boolean; // sample EC < k
}

export interface JournalistLDivResult {
  sa: string;
  minL: number;
  violatingEcs: number;
  totalEcs: number;
  violatingRecordPct: number;
  status: "PASS" | "FAIL";
}

export interface JournalistTCloseResult {
  sa: string;
  maxDistance: number;
  violatingEcs: number;
  totalEcs: number;
  status: "PASS" | "FAIL";
}

export interface JournalistResult {
  // Backward-compat (used by comparison dashboard / composite score)
  riskScore: number;
  riskLevel: RiskLevel;
  totalRecords: number;

  // Spec §6 fields
  sampleN: number;
  reIdRisk: number;                  // journalist re-id risk
  prosecutorReIdRisk: number;        // for §6.2 reference card
  populationUniqueCount: number;     // pop EC ≤ 1
  avgPopulationEcSize: number;
  minPopulationEcSize: number;
  atRiskCount: number;               // based on pop EC < k
  protectedCount: number;
  quasiIdentifiers: string[];
  multiplierUsed: boolean;
  samplingFraction: number;

  // Tables & charts
  recordTable: JournalistRecordRow[];
  sampleHistogram: { label: string; numECs: number; numRecords: number; pct: string }[];
  populationHistogram: { label: string; numECs: number; numRecords: number; pct: string }[];
  comparisonChart: {
    bucket: string;
    prosecutorCount: number;
    journalistCount: number;
    delta: number;
  }[];
  topVulnerable: {
    qiCombo: string;
    qiValues: Record<string, string>;
    journalistLinkScore: number;
    prosecutorLinkScore: number;
    ecSizeSample: number;
    ecSizePopulation: number;
  }[];
  topVulnerableRecord: JournalistRecordRow | null;

  // L-Diversity & T-Closeness (sample-based, identical to Prosecutor)
  lDiversityResults: JournalistLDivResult[];
  tClosenessResults: JournalistTCloseResult[];

  recommendations: string[];
}

// ─── Main function ────────────────────────────────────────────────────────────

export function runJournalistAttack(
  data: DataRow[],
  quasiIdentifiers: string[],
  kThreshold: number,
  sensitiveAttributes: string[] = [],
  lThreshold = 3,
  tThreshold = 0.2,
  samplePct = 100,
): JournalistResult {
  const n = data.length;
  if (n === 0 || quasiIdentifiers.length === 0) return emptyResult(quasiIdentifiers, samplePct);

  const samplingFraction = Math.max(0.001, Math.min(1, samplePct / 100));

  // Detect Multiplier_comb column (case-insensitive, not selected as QI or SA)
  const allCols = Object.keys(data[0]);
  const multiplierColName = allCols.find(
    (c) =>
      c.toLowerCase().replace(/[^a-z0-9]/g, "").includes("multipliercomb") ||
      c.toLowerCase() === "multiplier_comb" ||
      c.toLowerCase() === "multipliercomb"
  );
  const multiplierConflict =
    multiplierColName &&
    (quasiIdentifiers.includes(multiplierColName) ||
      sensitiveAttributes.includes(multiplierColName));
  const multiplierUsed = !!multiplierColName && !multiplierConflict;

  // ── Step 1: Build sample-level EC map ──────────────────────────────────────
  const ecMap = new Map<string, number[]>(); // key → row indices
  data.forEach((row, idx) => {
    const key = quasiIdentifiers.map((qi) => String(row[qi] ?? "")).join("|");
    const existing = ecMap.get(key);
    if (existing) existing.push(idx);
    else ecMap.set(key, [idx]);
  });

  // ── Step 2: Estimate population EC size per EC key ─────────────────────────
  const popEcMap = new Map<string, number>(); // key → estimated pop EC size
  ecMap.forEach((indices, key) => {
    const sampleEc = indices.length;
    let popEc: number;
    if (multiplierUsed && multiplierColName) {
      // Sum expansion factors within EC
      const weightSum = indices.reduce(
        (s, i) => s + Math.max(1, Number(data[i][multiplierColName!]) || 1),
        0
      );
      popEc = weightSum;
    } else {
      // Fallback: inflate by inverse sampling fraction
      popEc = sampleEc / samplingFraction;
    }
    // Population EC ≥ sample EC always (sanity check §7 item 4)
    popEcMap.set(key, Math.max(sampleEc, popEc));
  });

  // ── Step 3: Per-record metrics ─────────────────────────────────────────────
  const ecKeyArr: string[] = data.map((row) =>
    quasiIdentifiers.map((qi) => String(row[qi] ?? "")).join("|")
  );

  let totalJournalistLS = 0;
  let totalProsecutorLS = 0;

  const recordTable: JournalistRecordRow[] = data.map((row, idx) => {
    const key = ecKeyArr[idx];
    const ecSizeSample = ecMap.get(key)!.length;
    const ecSizePopulation = popEcMap.get(key)!;
    const prosecutorLS = 1 / ecSizeSample;
    const journalistLS = 1 / ecSizePopulation;
    totalJournalistLS += journalistLS;
    totalProsecutorLS += prosecutorLS;
    const qiValues: Record<string, string> = {};
    quasiIdentifiers.forEach((qi) => { qiValues[qi] = String(row[qi] ?? ""); });
    return {
      rowIdx: idx + 1,
      qiValues,
      ecSizeSample,
      ecSizePopulation: parseFloat(ecSizePopulation.toFixed(2)),
      prosecutorLinkScore: parseFloat(prosecutorLS.toFixed(4)),
      journalistLinkScore: parseFloat(journalistLS.toFixed(4)),
      atRisk: ecSizePopulation < kThreshold,
      atRiskProsecutor: ecSizeSample < kThreshold,
    };
  });

  // ── Step 4: Dataset-level metrics ─────────────────────────────────────────
  const reIdRisk = totalJournalistLS / n;
  const prosecutorReIdRisk = totalProsecutorLS / n;

  // Sanity check §7 item 1: journalist ≤ prosecutor
  const safeJournalistRisk = Math.min(reIdRisk, prosecutorReIdRisk);

  const atRiskCount = recordTable.filter((r) => r.atRisk).length;
  const protectedCount = n - atRiskCount;

  const populationSizes = Array.from(popEcMap.values());
  const populationUniqueCount = recordTable.filter((r) => r.ecSizePopulation <= 1).length;
  const avgPopulationEcSize = populationSizes.reduce((s, v) => s + v, 0) / populationSizes.length;
  const minPopulationEcSize = Math.min(...populationSizes);

  // ── Step 5: Histograms ─────────────────────────────────────────────────────
  const ecBuckets = [
    { label: "1 (Unique)",   min: 1,  max: 1 },
    { label: "2–4",          min: 2,  max: 4 },
    { label: "5–10",         min: 5,  max: 10 },
    { label: "11–20",        min: 11, max: 20 },
    { label: ">20",          min: 21, max: Infinity },
  ];

  // Sample histogram (by sample EC size)
  const sampleHistogram = ecBuckets.map((b) => {
    const matchingKeys: string[] = [];
    ecMap.forEach((indices, key) => {
      if (indices.length >= b.min && indices.length <= b.max) matchingKeys.push(key);
    });
    const numRecords = matchingKeys.reduce((s, k) => s + ecMap.get(k)!.length, 0);
    return {
      label: b.label,
      numECs: matchingKeys.length,
      numRecords,
      pct: n > 0 ? ((numRecords / n) * 100).toFixed(1) + "%" : "0%",
    };
  });

  // Population histogram (by estimated pop EC size)
  const populationHistogram = ecBuckets.map((b) => {
    const matchingKeys: string[] = [];
    popEcMap.forEach((popSize, key) => {
      if (popSize >= b.min && popSize <= b.max) matchingKeys.push(key);
    });
    const numRecords = matchingKeys.reduce((s, k) => s + (ecMap.get(k)?.length ?? 0), 0);
    return {
      label: b.label,
      numECs: matchingKeys.length,
      numRecords,
      pct: n > 0 ? ((numRecords / n) * 100).toFixed(1) + "%" : "0%",
    };
  });

  // ── Step 6: Prosecutor vs Journalist comparison chart ─────────────────────
  const scoreBuckets = [
    { bucket: "1.00 (certain)",   pMin: 1.0,  pMax: 1.0  },
    { bucket: "0.51–0.99 (high)", pMin: 0.51, pMax: 0.999 },
    { bucket: "0.26–0.50 (med)",  pMin: 0.26, pMax: 0.50  },
    { bucket: "0.01–0.25 (low)",  pMin: 0.01, pMax: 0.25  },
    { bucket: "0.00 (safe)",      pMin: 0.0,  pMax: 0.0   },
  ];
  const comparisonChart = scoreBuckets.map(({ bucket, pMin, pMax }) => {
    const inBucket = (score: number) => {
      if (pMin === pMax) return Math.abs(score - pMin) < 0.0001;
      return score >= pMin && score <= pMax;
    };
    const prosecutorCount = recordTable.filter((r) => inBucket(r.prosecutorLinkScore)).length;
    const journalistCount = recordTable.filter((r) => inBucket(r.journalistLinkScore)).length;
    return { bucket, prosecutorCount, journalistCount, delta: prosecutorCount - journalistCount };
  });

  // ── Step 7: Top 10 vulnerable by journalist score ─────────────────────────
  const sortedByJournalist = [...recordTable].sort(
    (a, b) => b.journalistLinkScore - a.journalistLinkScore
  );
  const top10 = sortedByJournalist.slice(0, 10);
  const topVulnerable = top10.map((r) => ({
    qiCombo: quasiIdentifiers.map((qi) => `${qi}=${r.qiValues[qi]}`).join(", "),
    qiValues: r.qiValues,
    journalistLinkScore: r.journalistLinkScore,
    prosecutorLinkScore: r.prosecutorLinkScore,
    ecSizeSample: r.ecSizeSample,
    ecSizePopulation: r.ecSizePopulation,
  }));
  const topVulnerableRecord = recordTable
    .filter((r) => r.journalistLinkScore >= 0.5)
    .sort((a, b) => b.journalistLinkScore - a.journalistLinkScore)[0] ?? null;

  // ── Step 8: L-Diversity (sample-based, same as Prosecutor) ────────────────
  const lDiversityResults: JournalistLDivResult[] = sensitiveAttributes.map((sa) => {
    let minL = Infinity;
    let violatingEcs = 0;
    let violatingRecords = 0;
    ecMap.forEach((indices) => {
      const vals = new Set<string>();
      indices.forEach((i) => vals.add(String(data[i][sa] ?? "")));
      const distinct = vals.size;
      if (distinct < minL) minL = distinct;
      if (distinct < lThreshold) {
        violatingEcs++;
        violatingRecords += indices.length;
      }
    });
    if (!isFinite(minL)) minL = 0;
    return {
      sa,
      minL,
      violatingEcs,
      totalEcs: ecMap.size,
      violatingRecordPct: parseFloat(((violatingRecords / n) * 100).toFixed(1)),
      status: violatingEcs === 0 ? "PASS" : "FAIL",
    };
  });

  // ── Step 9: T-Closeness (sample-based, TVD, same as Prosecutor) ───────────
  const tClosenessResults: JournalistTCloseResult[] = sensitiveAttributes.map((sa) => {
    const globalCounts = new Map<string, number>();
    data.forEach((row) => {
      const v = String(row[sa] ?? "");
      globalCounts.set(v, (globalCounts.get(v) ?? 0) + 1);
    });
    const globalDist: Record<string, number> = {};
    globalCounts.forEach((count, v) => { globalDist[v] = count / n; });
    const allValues = Array.from(globalCounts.keys());

    let maxDistance = 0;
    let violatingEcs = 0;
    ecMap.forEach((indices) => {
      const localCounts = new Map<string, number>();
      indices.forEach((i) => {
        const v = String(data[i][sa] ?? "");
        localCounts.set(v, (localCounts.get(v) ?? 0) + 1);
      });
      const sz = indices.length;
      let tvd = 0;
      allValues.forEach((v) => {
        const lp = (localCounts.get(v) ?? 0) / sz;
        const gp = globalDist[v] ?? 0;
        tvd += Math.abs(lp - gp);
      });
      tvd /= 2;
      if (tvd > maxDistance) maxDistance = tvd;
      if (tvd > tThreshold) violatingEcs++;
    });
    return {
      sa,
      maxDistance: parseFloat(maxDistance.toFixed(4)),
      violatingEcs,
      totalEcs: ecMap.size,
      status: violatingEcs === 0 ? "PASS" : "FAIL",
    };
  });

  // ── Step 10: Journalist-specific recommendations ───────────────────────────
  const recommendations: string[] = [];
  if (populationUniqueCount > 0) {
    recommendations.push(
      `🔴 CRITICAL — ${populationUniqueCount} record${populationUniqueCount > 1 ? "s" : ""} remain unique even at population level. These cannot be protected by sampling alone — apply direct suppression or generalisation.`
    );
  }
  const riskReduction = ((prosecutorReIdRisk - safeJournalistRisk) * 100).toFixed(1);
  if (safeJournalistRisk > 0.2) {
    recommendations.push(
      `🔴 HIGH — Journalist Re-ID Risk is ${(safeJournalistRisk * 100).toFixed(1)}% (threshold: <5%). Even accounting for sampling uncertainty, risk remains too high. Apply k-anonymity / suppression.`
    );
  } else if (safeJournalistRisk > 0.05) {
    recommendations.push(
      `🟡 MEDIUM — Journalist Re-ID Risk ${(safeJournalistRisk * 100).toFixed(1)}% vs Prosecutor ${(prosecutorReIdRisk * 100).toFixed(1)}%. Sampling provides ${riskReduction}pp risk reduction, but risk is still above the 5% safe threshold.`
    );
  }
  recommendations.push(
    `ℹ️ NOTE — Sampling provides a ${riskReduction} percentage-point risk reduction. If a larger sample is later published, this protection may not hold.`
  );
  if (multiplierUsed) {
    recommendations.push(
      `ℹ️ NOTE — Population estimates use the Multiplier_comb column (survey expansion factors). If this column is dropped before release, re-run with a manually specified sampling fraction.`
    );
  } else {
    recommendations.push(
      `ℹ️ NOTE — Multiplier_comb not available${multiplierConflict ? " (conflicts with QI/SA selection)" : ""}. Population estimated from ${samplePct}% sampling fraction. Results are indicative only.`
    );
  }
  lDiversityResults.filter((r) => r.status === "FAIL").forEach((r) => {
    recommendations.push(
      `🟡 MEDIUM — L-Diversity violated for "${r.sa}" (${r.violatingEcs}/${r.totalEcs} ECs). Ensure ≥${lThreshold} distinct values per group.`
    );
  });
  tClosenessResults.filter((r) => r.status === "FAIL").forEach((r) => {
    recommendations.push(
      `🟡 MEDIUM — T-Closeness violated for "${r.sa}" (max TVD: ${r.maxDistance} > ${tThreshold}).`
    );
  });
  recommendations.push(
    `ℹ️ NEXT STEP — Go to "Privacy Enhancement" to apply fixes. Suppression/generalisation targeting Prosecutor risk will also reduce Journalist risk, but not vice versa.`
  );

  return {
    riskScore: safeJournalistRisk,
    riskLevel: getRiskLevel(safeJournalistRisk),
    totalRecords: n,
    sampleN: n,
    reIdRisk: safeJournalistRisk,
    prosecutorReIdRisk,
    populationUniqueCount,
    avgPopulationEcSize: parseFloat(avgPopulationEcSize.toFixed(2)),
    minPopulationEcSize: parseFloat(minPopulationEcSize.toFixed(2)),
    atRiskCount,
    protectedCount,
    quasiIdentifiers,
    multiplierUsed,
    samplingFraction,
    recordTable,
    sampleHistogram,
    populationHistogram,
    comparisonChart,
    topVulnerable,
    topVulnerableRecord,
    lDiversityResults,
    tClosenessResults,
    recommendations,
  };
}

// ─── Empty / error result ─────────────────────────────────────────────────────

function emptyResult(qis: string[], samplePct: number): JournalistResult {
  return {
    riskScore: 0, riskLevel: "LOW", totalRecords: 0,
    sampleN: 0, reIdRisk: 0, prosecutorReIdRisk: 0,
    populationUniqueCount: 0, avgPopulationEcSize: 0, minPopulationEcSize: 0,
    atRiskCount: 0, protectedCount: 0, quasiIdentifiers: qis,
    multiplierUsed: false, samplingFraction: samplePct / 100,
    recordTable: [], sampleHistogram: [], populationHistogram: [],
    comparisonChart: [], topVulnerable: [], topVulnerableRecord: null,
    lDiversityResults: [], tClosenessResults: [],
    recommendations: ["No data or quasi-identifiers selected."],
  };
}

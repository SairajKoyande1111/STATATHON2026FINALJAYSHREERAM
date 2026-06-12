/**
 * Attribute Disclosure Attack — per SafeData Pipeline spec v1.0
 *
 * An attacker who does NOT need to re-identify anyone can still learn a
 * sensitive attribute value by knowing which equivalence class a target
 * belongs to.  If all records in an EC share the same SA value, the
 * attacker learns that value with 100% certainty — regardless of k-anonymity.
 *
 * Core formula:  disc_risk(r, SA) = dominant_freq(EC(r), SA)
 *                ADR(SA)          = mean(disc_risk(r, SA)) over all records
 *                overall_ADR      = max(ADR(SA)) across all SAs
 */

import {
  freqDist,
  totalVariationDistance,
  getRiskLevel,
  type DataRow,
  type RiskLevel,
} from "./utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DisclosureLabel = "Guaranteed" | "High" | "Moderate" | "Safe";

export interface ADRecordRow {
  rowIdx: number;
  qiValues: Record<string, string>;
  ecSize: number;
  saValues: Record<string, string>;
  dominantValues: Record<string, string>;
  dominantFreqs: Record<string, number>;
  disclosureLabels: Record<string, DisclosureLabel>;
  maxDisclosureRisk: number;
  maxRiskSa: string;
  atRisk: boolean;
}

export interface ADPerSAResult {
  sa: string;
  adr: number;
  guaranteedRecords: number;
  highRiskRecords: number;
  moderateRiskRecords: number;
  safeRecords: number;
  homogeneousEcs: number;
  lViolatingEcs: number;
  totalEcs: number;
  minL: number;
  recordsInLViolatingEcs: number;
  maxTvd: number;
  tViolatingEcs: number;
  lStatus: "PASS" | "FAIL";
  tStatus: "PASS" | "FAIL";
  globalDist: { value: string; pct: number }[];
  homogeneousEcsByValue: { value: string; count: number }[];
  topEcs: {
    ecId: string;
    qiCombo: string;
    ecSize: number;
    distinctSaValues: number;
    dominantValue: string;
    dominantFreq: number;
    disclosureLabel: DisclosureLabel;
  }[];
  riskLevel: RiskLevel;
}

export interface AttributeDisclosureResult {
  riskScore: number;
  riskLevel: RiskLevel;
  N: number;
  totalRecords: number;
  quasiIdentifiers: string[];
  sensitiveAttributes: string[];
  overallAdr: number;
  perSAResults: ADPerSAResult[];
  recordTable: ADRecordRow[];
  topVulnerable: {
    rank: number;
    qiCombo: string;
    ecSize: number;
    saName: string;
    saValue: string;
    dominantFreq: number;
    disclosureLabel: DisclosureLabel;
    whyVulnerable: string;
  }[];
  saSensitivityRanking: {
    rank: number;
    sa: string;
    adr: number;
    guaranteedRecords: number;
    homogeneousEcs: number;
    totalEcs: number;
    riskLevel: RiskLevel;
  }[];
  mostVulnerableEc: {
    qiCombo: string;
    ecSize: number;
    saName: string;
    dominantValue: string;
    dominantFreq: number;
    saDistribution: { value: string; count: number; pct: number }[];
  } | null;
  recommendations: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function classifyDisclosure(freq: number): DisclosureLabel {
  if (freq >= 1.0) return "Guaranteed";
  if (freq >= 0.75) return "High";
  if (freq >= 0.50) return "Moderate";
  return "Safe";
}

function disclosureLabelColor(label: DisclosureLabel): string {
  return label === "Guaranteed" ? "#DC2626"
    : label === "High" ? "#EA580C"
    : label === "Moderate" ? "#D97706"
    : "#16A34A";
}

// ─── Main function ────────────────────────────────────────────────────────────

export function runAttributeDisclosureAttack(
  data: DataRow[],
  quasiIdentifiers: string[],
  sensitiveAttributes: string[],
  lThreshold = 3,
  tThreshold = 0.2,
): AttributeDisclosureResult {
  const N = data.length;
  if (N === 0 || quasiIdentifiers.length === 0 || sensitiveAttributes.length === 0) {
    return emptyResult(quasiIdentifiers, sensitiveAttributes);
  }

  // ── Step 1: Build EC map (key → row indices) ───────────────────────────────
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

  const totalEcs = ecMap.size;
  const ecKeys = Array.from(ecMap.keys());

  // ── Step 2: Per-SA analysis ────────────────────────────────────────────────
  const perSAResults: ADPerSAResult[] = sensitiveAttributes.map((sa) => {
    // Per-record dominant freq for this SA
    const recordDomFreq: number[] = new Array(N);
    const recordDomVal: string[] = new Array(N);

    // Per-EC stats
    let homogeneousEcs = 0;
    let lViolatingEcs = 0;
    let recordsInLViolatingEcs = 0;
    let minL = Infinity;
    const homValueCounts = new Map<string, number>();

    const topEcsList: ADPerSAResult["topEcs"] = [];

    let ecIdx = 0;
    ecMap.forEach((indices, key) => {
      const ecSaVals = indices.map((i) => String(data[i][sa] ?? ""));
      const valCounts = new Map<string, number>();
      ecSaVals.forEach((v) => valCounts.set(v, (valCounts.get(v) ?? 0) + 1));

      // Dominant value
      let maxCnt = 0;
      let dominantVal = "";
      valCounts.forEach((cnt, v) => { if (cnt > maxCnt) { maxCnt = cnt; dominantVal = v; } });
      const domFreq = maxCnt / indices.length;
      const distinctCount = valCounts.size;

      if (distinctCount < minL) minL = distinctCount;
      if (distinctCount === 1) {
        homogeneousEcs++;
        homValueCounts.set(dominantVal, (homValueCounts.get(dominantVal) ?? 0) + 1);
      }
      if (distinctCount < lThreshold) {
        lViolatingEcs++;
        recordsInLViolatingEcs += indices.length;
      }

      // Write per-record
      indices.forEach((i) => { recordDomFreq[i] = domFreq; recordDomVal[i] = dominantVal; });

      topEcsList.push({
        ecId: `EC-${ecIdx + 1}`,
        qiCombo: key.slice(0, 80),
        ecSize: indices.length,
        distinctSaValues: distinctCount,
        dominantValue: dominantVal,
        dominantFreq: parseFloat(domFreq.toFixed(4)),
        disclosureLabel: classifyDisclosure(domFreq),
      });
      ecIdx++;
    });

    // Sort top ECs by dominant freq descending
    topEcsList.sort((a, b) => b.dominantFreq - a.dominantFreq);

    // ADR = mean disc_risk across all records
    const totalDiscRisk = recordDomFreq.reduce((s, v) => s + v, 0);
    const adr = totalDiscRisk / N;

    // Outcome counts
    const guaranteedRecords = recordDomFreq.filter((v) => v >= 1.0).length;
    const highRiskRecords   = recordDomFreq.filter((v) => v >= 0.75 && v < 1.0).length;
    const moderateRiskRecords = recordDomFreq.filter((v) => v >= 0.50 && v < 0.75).length;
    const safeRecords       = recordDomFreq.filter((v) => v < 0.50).length;

    // Global distribution of SA
    const globalVals = data.map((r) => String(r[sa] ?? ""));
    const globalDist = freqDist(globalVals);
    const globalDistDisplay = Array.from(globalDist.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([value, frac]) => ({ value, pct: parseFloat((frac * 100).toFixed(1)) }));

    // T-Closeness per EC
    let maxTvd = 0;
    let tViolatingEcs = 0;
    ecMap.forEach((indices) => {
      const localVals = indices.map((i) => String(data[i][sa] ?? ""));
      const localDist = freqDist(localVals);
      const tvd = totalVariationDistance(localDist, globalDist);
      if (tvd > maxTvd) maxTvd = tvd;
      if (tvd > tThreshold) tViolatingEcs++;
    });

    // Homogeneous ECs by value
    const homEcsByValue = Array.from(homValueCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));

    // Risk level for this SA
    const riskLevel: RiskLevel = adr > 0.6 ? "HIGH" : adr > 0.2 ? "MEDIUM" : "LOW";

    return {
      sa,
      adr: parseFloat(adr.toFixed(4)),
      guaranteedRecords,
      highRiskRecords,
      moderateRiskRecords,
      safeRecords,
      homogeneousEcs,
      lViolatingEcs,
      totalEcs,
      minL: minL === Infinity ? 0 : minL,
      recordsInLViolatingEcs,
      maxTvd: parseFloat(maxTvd.toFixed(4)),
      tViolatingEcs,
      lStatus: lViolatingEcs === 0 ? "PASS" : "FAIL",
      tStatus: tViolatingEcs === 0 ? "PASS" : "FAIL",
      globalDist: globalDistDisplay,
      homogeneousEcsByValue: homEcsByValue,
      topEcs: topEcsList.slice(0, 20),
      riskLevel,
    };
  });

  // Build per-record dominant freq table for each SA (re-compute efficiently)
  // We already stored per-SA data; now build per-record values
  const saRecordDomFreq: Map<string, { domFreq: number; domVal: string }[]> = new Map();
  sensitiveAttributes.forEach((sa) => {
    const domFreqs: { domFreq: number; domVal: string }[] = new Array(N);
    ecMap.forEach((indices) => {
      const valCounts = new Map<string, number>();
      indices.forEach((i) => {
        const v = String(data[i][sa] ?? "");
        valCounts.set(v, (valCounts.get(v) ?? 0) + 1);
      });
      let maxCnt = 0; let dominantVal = "";
      valCounts.forEach((cnt, v) => { if (cnt > maxCnt) { maxCnt = cnt; dominantVal = v; } });
      const freq = maxCnt / indices.length;
      indices.forEach((i) => { domFreqs[i] = { domFreq: freq, domVal: dominantVal }; });
    });
    saRecordDomFreq.set(sa, domFreqs);
  });

  // ── Step 3: Record-level trace table ──────────────────────────────────────
  const recordTable: ADRecordRow[] = data.map((row, idx) => {
    const qiValues: Record<string, string> = {};
    quasiIdentifiers.forEach((qi) => { qiValues[qi] = String(row[qi] ?? ""); });
    const saValues: Record<string, string> = {};
    const dominantValues: Record<string, string> = {};
    const dominantFreqs: Record<string, number> = {};
    const disclosureLabels: Record<string, DisclosureLabel> = {};

    let maxRisk = 0;
    let maxSa = sensitiveAttributes[0] ?? "";

    sensitiveAttributes.forEach((sa) => {
      saValues[sa] = String(row[sa] ?? "");
      const rec = saRecordDomFreq.get(sa)![idx];
      dominantValues[sa] = rec.domVal;
      dominantFreqs[sa] = parseFloat(rec.domFreq.toFixed(4));
      disclosureLabels[sa] = classifyDisclosure(rec.domFreq);
      if (rec.domFreq > maxRisk) { maxRisk = rec.domFreq; maxSa = sa; }
    });

    return {
      rowIdx: idx + 1,
      qiValues,
      ecSize: ecSizeArr[idx],
      saValues,
      dominantValues,
      dominantFreqs,
      disclosureLabels,
      maxDisclosureRisk: parseFloat(maxRisk.toFixed(4)),
      maxRiskSa: maxSa,
      atRisk: maxRisk >= 0.5,
    };
  });

  // ── Step 4: Overall ADR ────────────────────────────────────────────────────
  const overallAdr = perSAResults.reduce((m, r) => Math.max(m, r.adr), 0);

  // ── Step 5: Top 10 vulnerable records ─────────────────────────────────────
  const topVulnerable = [...recordTable]
    .sort((a, b) => b.maxDisclosureRisk - a.maxDisclosureRisk)
    .slice(0, 10)
    .map((row, i) => {
      const sa = row.maxRiskSa;
      const freq = row.dominantFreqs[sa] ?? row.maxDisclosureRisk;
      const ecSz = row.ecSize;
      const domVal = row.dominantValues[sa] ?? "—";
      const label = row.disclosureLabels[sa] ?? classifyDisclosure(freq);
      const approxDomCount = Math.round(freq * ecSz);
      const why = freq >= 1.0
        ? `All ${ecSz} records in this group have ${sa} = ${domVal}`
        : `${approxDomCount} of ${ecSz} records in this group have ${sa} = ${domVal}`;
      return {
        rank: i + 1,
        qiCombo: quasiIdentifiers.map((qi) => `${qi}=${row.qiValues[qi]}`).join(", "),
        ecSize: ecSz,
        saName: sa,
        saValue: row.saValues[sa] ?? "—",
        dominantFreq: freq,
        disclosureLabel: label,
        whyVulnerable: why,
      };
    });

  // ── Step 6: SA Sensitivity Ranking ────────────────────────────────────────
  const saSensitivityRanking = [...perSAResults]
    .sort((a, b) => b.adr - a.adr)
    .map((r, i) => ({
      rank: i + 1,
      sa: r.sa,
      adr: r.adr,
      guaranteedRecords: r.guaranteedRecords,
      homogeneousEcs: r.homogeneousEcs,
      totalEcs: r.totalEcs,
      riskLevel: r.riskLevel,
    }));

  // ── Step 7: Most vulnerable EC (for narrative §5.5) ───────────────────────
  let mostVulnerableEc: AttributeDisclosureResult["mostVulnerableEc"] = null;
  let bestFreq = 0;
  let bestSaName = "";
  perSAResults.forEach((psa) => {
    if (psa.topEcs.length > 0 && psa.topEcs[0].dominantFreq > bestFreq) {
      bestFreq = psa.topEcs[0].dominantFreq;
      bestSaName = psa.sa;
    }
  });
  if (bestSaName) {
    const bestPsa = perSAResults.find((p) => p.sa === bestSaName)!;
    const ec = bestPsa.topEcs[0];
    // Rebuild distribution for this EC
    const ecIndices = ecMap.get(ec.qiCombo) ?? ecMap.get(ecKeys.find((k) => k.slice(0, 80) === ec.qiCombo) ?? "") ?? [];
    const valCounts = new Map<string, number>();
    ecIndices.forEach((i) => {
      const v = String(data[i][bestSaName] ?? "");
      valCounts.set(v, (valCounts.get(v) ?? 0) + 1);
    });
    const total = ec.ecSize || 1;
    mostVulnerableEc = {
      qiCombo: ec.qiCombo,
      ecSize: ec.ecSize,
      saName: bestSaName,
      dominantValue: ec.dominantValue,
      dominantFreq: ec.dominantFreq,
      saDistribution: Array.from(valCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ value, count, pct: parseFloat(((count / total) * 100).toFixed(1)) })),
    };
  }

  // ── Step 8: Recommendations ────────────────────────────────────────────────
  const recommendations = buildRecommendations(overallAdr, perSAResults, lThreshold, tThreshold, N);

  return {
    riskScore: parseFloat(overallAdr.toFixed(4)),
    riskLevel: overallAdr > 0.6 ? "HIGH" : overallAdr > 0.2 ? "MEDIUM" : "LOW",
    N,
    totalRecords: N,
    quasiIdentifiers,
    sensitiveAttributes,
    overallAdr,
    perSAResults,
    recordTable,
    topVulnerable,
    saSensitivityRanking,
    mostVulnerableEc,
    recommendations,
  };
}

// ─── Recommendations ──────────────────────────────────────────────────────────

function buildRecommendations(
  overallAdr: number,
  perSAResults: ADPerSAResult[],
  lThreshold: number,
  tThreshold: number,
  N: number,
): string[] {
  const recs: string[] = [];

  const maxGuaranteed = Math.max(...perSAResults.map((r) => r.guaranteedRecords));
  const worstSA = perSAResults.sort((a, b) => b.adr - a.adr)[0];

  if (maxGuaranteed > 0) {
    recs.push(
      `🔴 CRITICAL — ${maxGuaranteed} records sit in completely homogeneous ECs for ${worstSA?.sa ?? "a sensitive attribute"}. ` +
      `Their sensitive value is disclosed with 100% certainty to anyone who knows the person's quasi-identifier combination. ` +
      `Action: Apply l-diversity enforcement (l≥${lThreshold}). Use data suppression or value-swapping to break up homogeneous groups.`
    );
  }

  if (overallAdr > 0.2) {
    recs.push(
      `🔴 HIGH — Attribute Disclosure Risk is ${(overallAdr * 100).toFixed(1)}% (safe threshold: <20%). ` +
      `An attacker who knows a person's QI combination can correctly guess their sensitive attribute value ` +
      `${(overallAdr * 100).toFixed(1)}% of the time on average. ` +
      `Action: Increase l parameter and apply l-diversity transformation in Privacy Enhancement. Target: ADR < 20%.`
    );
  }

  const failingLDiv = perSAResults.filter((r) => r.lStatus === "FAIL");
  if (failingLDiv.length > 0) {
    recs.push(
      `🟠 MEDIUM — ${failingLDiv.map((r) => r.sa).join(", ")} fail l-diversity (l=${lThreshold}): ` +
      `${failingLDiv.map((r) => `${r.lViolatingEcs}/${r.totalEcs} ECs violating`).join(", ")}. ` +
      `Each EC must have at least ${lThreshold} distinct sensitive-attribute values. ` +
      `Suppress records from over-represented groups or merge small ECs through QI generalisation.`
    );
  }

  const failingTClose = perSAResults.filter((r) => r.tStatus === "FAIL");
  if (failingTClose.length > 0) {
    recs.push(
      `🟡 T-CLOSENESS VIOLATED — ${failingTClose.map((r) => r.sa).join(", ")} exceed TVD threshold (t=${tThreshold}). ` +
      `SA distributions inside some ECs diverge strongly from the global distribution. ` +
      `Apply t-closeness transformation or restrict release of these attributes.`
    );
  }

  const highRiskTotal = perSAResults.reduce((s, r) => s + r.highRiskRecords, 0);
  if (highRiskTotal > 0) {
    recs.push(
      `🟡 MEDIUM — ${highRiskTotal} records have High disclosure risk (dominant freq ≥75%). ` +
      `These are not fully homogeneous but the dominant SA value appears ≥75% of the time — attacker's guess is nearly certain. ` +
      `Break up these ECs by generalising the top quasi-identifier or adding suppression.`
    );
  }

  recs.push(
    `ℹ️ KEY DISTINCTION — Attribute Disclosure can occur even when k-anonymity is satisfied. ` +
    `If your dataset passes the Prosecutor Attack but fails here, you need l-diversity — not just larger ECs.`
  );

  recs.push(
    `ℹ️ NEXT STEP — Go to "Privacy Enhancement" to apply l-diversity transformations. ` +
    `After enhancement, re-run this assessment to verify ADR drops below 20%.`
  );

  return recs;
}

// ─── Empty result ─────────────────────────────────────────────────────────────

function emptyResult(qis: string[], sas: string[]): AttributeDisclosureResult {
  return {
    riskScore: 0, riskLevel: "LOW", N: 0, totalRecords: 0,
    quasiIdentifiers: qis, sensitiveAttributes: sas,
    overallAdr: 0, perSAResults: [], recordTable: [],
    topVulnerable: [], saSensitivityRanking: [], mostVulnerableEc: null,
    recommendations: ["Select quasi-identifiers and at least one sensitive attribute to run the Attribute Disclosure Attack."],
  };
}

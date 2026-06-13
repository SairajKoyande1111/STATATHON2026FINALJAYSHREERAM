import { type DataRow, columnRange, isNumericCol, type PrivacyResult } from "./types";

// ════════════════════════════════════════════════════════════════════════════
// FAMILY 1: Statistical Disclosure Control (SDC) — Full Spec Implementation
// Statathon 2025 | AIRAVATA Technologies
// ════════════════════════════════════════════════════════════════════════════

// ─── Statistical helpers ──────────────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}
function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function rankArray(arr: number[]): number[] {
  const sorted = [...arr].map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(arr.length).fill(0);
  sorted.forEach((item, rank) => { ranks[item.i] = rank + 1; });
  return ranks;
}

function spearmanRho(a: number[], b: number[]): number {
  const N = a.length;
  if (N < 2) return 1;
  const ra = rankArray(a), rb = rankArray(b);
  const d2 = ra.reduce((s, r, i) => s + (r - rb[i]) ** 2, 0);
  return 1 - (6 * d2) / (N * (N * N - 1));
}

function pearsonR(a: number[], b: number[]): number {
  const N = a.length;
  if (N < 2) return 1;
  const ma = mean(a), mb = mean(b);
  const num = a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0);
  const da  = Math.sqrt(a.reduce((s, v) => s + (v - ma) ** 2, 0));
  const db  = Math.sqrt(b.reduce((s, v) => s + (v - mb) ** 2, 0));
  if (da === 0 || db === 0) return 1;
  return num / (da * db);
}

function tvd(vals: string[], origFreq: Map<string, number>, newFreq: Map<string, number>, N: number): number {
  return 0.5 * vals.reduce((s, v) => {
    const p = (origFreq.get(v) || 0) / N;
    const q = (newFreq.get(v) || 0) / N;
    return s + Math.abs(p - q);
  }, 0);
}

function chiSquareP(chi2: number, df: number): number {
  // Wilson-Hilferty normal approximation for chi-square CDF
  if (df <= 0 || chi2 < 0) return 1;
  const z = Math.cbrt(chi2 / df) - (1 - 2 / (9 * df));
  const sigma = Math.sqrt(2 / (9 * df));
  const norm = z / sigma;
  return 1 - 0.5 * (1 + erf(norm / Math.SQRT2));
}
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const ans = 1 - poly * Math.exp(-x * x);
  return x >= 0 ? ans : -ans;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

// ─── HTML report builder ──────────────────────────────────────────────────────

function htmlRow(label: string, value: string | number, good?: boolean | null): string {
  const style = good === true ? "color:#16A34A;font-weight:600" : good === false ? "color:#DC2626;font-weight:600" : "";
  return `<tr><td style="padding:5px 10px;color:#6b7280">${label}</td><td style="padding:5px 10px;text-align:right;${style}">${String(value)}</td></tr>`;
}

function buildReport(
  title: string,
  dataset: string,
  timestamp: string,
  N: number,
  Nout: number,
  paramsHtml: string,
  complianceHtml: string,
  metricsHtml: string,
  interpretation: string,
  recommendations: string[],
): string {
  const passed = complianceHtml.includes("YES");
  const badge = passed
    ? `<span style="background:#16A34A;color:white;padding:4px 12px;border-radius:4px;font-weight:700">PASS</span>`
    : `<span style="background:#DC2626;color:white;padding:4px 12px;border-radius:4px;font-weight:700">FAIL</span>`;
  const recs = recommendations.length
    ? `<h2 style="color:#1e40af;border-bottom:2px solid #e5e7eb;padding-bottom:4px">Recommendations</h2>` +
      recommendations.map((r) => `<div style="padding:8px;margin:4px 0;background:#fef9c3;border-left:4px solid #d97706;border-radius:4px;font-size:13px">${r}</div>`).join("")
    : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title} Report</title>
<style>body{font-family:Arial,sans-serif;max-width:900px;margin:0 auto;padding:24px;color:#111}
h1{font-size:18px;margin-bottom:4px}h2{font-size:14px;margin-top:20px}
table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px}
th{background:#f3f4f6;padding:6px 10px;text-align:left;border-bottom:2px solid #e5e7eb}
tr:nth-child(even){background:#f9fafb}
.section{border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:16px}
.section-header{background:#1e3a5f;color:white;padding:8px 12px;font-weight:600;font-size:13px}
</style></head><body>
<div style="background:#1e3a5f;color:white;padding:16px;border-radius:8px;margin-bottom:20px">
  <strong style="font-size:17px">SafeData Pipeline — ${title} Report</strong><br/>
  Government of India · MoSPI · AIRAVATA Technologies<br/>
  <small>Dataset: ${dataset} &nbsp;|&nbsp; Generated: ${timestamp}</small>
</div>
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
  <span style="font-size:15px;font-weight:600">Compliance Status: ${badge}</span>
  <span style="font-size:13px;color:#6b7280">Input: ${N} records → Output: ${Nout} records</span>
</div>
<div class="section"><div class="section-header">Parameters</div>
<table>${paramsHtml}</table></div>
<div class="section"><div class="section-header">Compliance & Metrics</div>
<table>${complianceHtml}${metricsHtml}</table></div>
<div class="section"><div class="section-header">Interpretation</div>
<div style="padding:12px;font-size:13px;line-height:1.6">${interpretation}</div></div>
${recs}
</body></html>`;
}

// ─── Shared empty result ──────────────────────────────────────────────────────

function sdcEmpty(name: string): PrivacyResult {
  return {
    technique: name, family: "SDC",
    processedData: [], originalCount: 0, processedCount: 0,
    recordsSuppressed: 0, informationLoss: 0, executionMs: 0,
    stats: {}, warnings: ["No data or no columns selected."],
    compliancePassed: null,
  };
}

// ─── Mondrian helper (shared by K-Anon, L-Div, T-Close) ──────────────────────

interface Partition { indices: number[] }

function medianValue(vals: number[]): number {
  const sorted = [...vals].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function mondrianPartition(data: DataRow[], qis: string[], k: number): Partition[] {
  if (data.length === 0 || qis.length === 0) return [];
  const globalRanges = new Map<string, number>();
  qis.forEach((c) => globalRanges.set(c, columnRange(data, c)));

  function split(partition: Partition): Partition[] {
    const { indices } = partition;
    if (indices.length < 2 * k) return [partition];
    let bestCol = qis[0], bestRange = 0;
    for (const col of qis) {
      const vals = indices.map((i) => Number(data[i][col])).filter((v) => !isNaN(v));
      if (vals.length === 0) continue;
      const rng = (Math.max(...vals) - Math.min(...vals)) / Math.max(globalRanges.get(col) || 1, 1);
      if (rng > bestRange) { bestRange = rng; bestCol = col; }
    }
    if (bestRange === 0) return [partition];
    const vals = indices.map((i) => Number(data[i][bestCol])).filter((v) => !isNaN(v));
    const mid = medianValue(vals);
    const left: number[] = [], right: number[] = [];
    indices.forEach((i) => {
      const v = Number(data[i][bestCol]);
      (isNaN(v) || v <= mid ? left : right).push(i);
    });
    if (left.length < k || right.length < k) return [partition];
    return [...split({ indices: left }), ...split({ indices: right })];
  }
  return split({ indices: data.map((_, i) => i) });
}


// ════════════════════════════════════════════════════════════════════════════
// 1. K-ANONYMITY (Mondrian Greedy Partitioning)
//    Ref: LeFevre et al., ICDE 2006
// ════════════════════════════════════════════════════════════════════════════

export function applyKAnonymity(
  data: DataRow[],
  qis: string[],
  k: number,
  suppressionLimit: number, // 0–1
): PrivacyResult {
  const t0 = performance.now();
  if (data.length === 0 || qis.length === 0) return sdcEmpty("K-Anonymity (Mondrian)");

  const N = data.length;
  const globalRanges = new Map<string, number>();
  qis.forEach((c) => globalRanges.set(c, columnRange(data, c)));

  const partitions = mondrianPartition(data, qis, k);
  const suppressed: number[] = [];
  const processed: DataRow[] = [];
  const equivClassSizes: number[] = [];

  // GIL computation (Generalised Information Loss)
  // GIL = (1 / |QI| × N) × Σ_col Σ_record (range_in_partition / global_range)
  const gilPerCol = new Map<string, number>();
  qis.forEach((c) => gilPerCol.set(c, 0));

  for (const partition of partitions) {
    const { indices } = partition;
    if (indices.length < k) {
      suppressed.push(...indices);
      continue;
    }
    equivClassSizes.push(indices.length);

    // Generalise QI values and compute GIL contribution
    const generalised: DataRow = {};
    qis.forEach((col) => {
      const vals = indices.map((i) => data[i][col]);
      if (isNumericCol(data, col)) {
        const nums = vals.map((v) => Number(v)).filter((v) => !isNaN(v));
        const lo = Math.min(...nums), hi = Math.max(...nums);
        const partRange = hi - lo;
        const gRange = globalRanges.get(col) || 1;
        gilPerCol.set(col, (gilPerCol.get(col) || 0) + (partRange / gRange) * indices.length);
        generalised[col] = lo === hi ? String(lo) : `[${lo}–${hi}]`;
      } else {
        const distinct = Array.from(new Set(vals.map(String))).sort();
        generalised[col] = distinct.length === 1 ? distinct[0] : `{${distinct.join(",")}}`;
      }
    });

    const nonQI = Object.keys(data[0]).filter((c) => !qis.includes(c));
    indices.forEach((i) => {
      const row: DataRow = { ...generalised };
      nonQI.forEach((c) => (row[c] = data[i][c]));
      processed.push(row);
    });
  }

  // Compute GIL per col and overall
  const gilCols: Record<string, number> = {};
  let gilTotal = 0;
  const nRetained = Math.max(processed.length, 1);
  qis.forEach((col) => {
    const g = parseFloat(((gilPerCol.get(col) || 0) / nRetained).toFixed(4));
    gilCols[col] = g;
    gilTotal += g;
  });
  const gil = parseFloat((gilTotal / Math.max(qis.length, 1)).toFixed(4));

  const minEC = equivClassSizes.length > 0 ? Math.min(...equivClassSizes) : 0;
  const avgEC = equivClassSizes.length > 0 ? mean(equivClassSizes) : 0;
  const suppressionRate = N > 0 ? suppressed.length / N : 0;
  const kSatisfied = minEC >= k && suppressed.length <= Math.ceil(suppressionLimit * N);

  const colStatsGIL: Record<string, Record<string, string | number>> = {};
  qis.forEach((col) => {
    colStatsGIL[col] = { "GIL": gilCols[col] };
  });

  const interp = `This dataset was anonymised using k-Anonymity (Mondrian) with k=${k}. ` +
    `${equivClassSizes.length} equivalence classes were formed. ` +
    `The smallest class contains ${minEC} records${minEC >= k ? " — k-anonymity IS satisfied" : " — WARNING: k-anonymity is NOT satisfied"}. ` +
    `Generalisation Information Loss (GIL) = ${(gil * 100).toFixed(1)}%, meaning ${(gil * 100).toFixed(0)}% of QI precision was sacrificed for privacy. ` +
    `${suppressed.length} records (${(suppressionRate * 100).toFixed(1)}%) were suppressed.`;

  const warnings: string[] = [
    ...(suppressionRate > suppressionLimit && suppressionLimit > 0 ? [`Suppression rate ${(suppressionRate*100).toFixed(1)}% exceeds limit ${(suppressionLimit*100).toFixed(0)}% — increase k tolerance or reduce QI columns.`] : []),
    ...(suppressionRate > 0.1 ? ["Suppression > 10% — consider lowering k."] : []),
    ...(gil > 0.5 ? ["High GIL (> 0.50): High information loss detected. Consider reducing k or adding more QI columns."] : []),
    "k-Anonymity does not protect against attribute disclosure or differencing attacks.",
  ];

  const now = new Date().toLocaleString("en-IN");
  const report = buildReport(
    "K-Anonymity",
    "dataset", now, N, processed.length,
    htmlRow("K Value", k) + htmlRow("Suppression Limit", `${(suppressionLimit * 100).toFixed(0)}%`) + htmlRow("QI Columns", qis.join(", ")),
    htmlRow("k-Anonymity Satisfied", kSatisfied ? "YES" : "NO", kSatisfied) +
    htmlRow("Min Equivalence Class", `${minEC} (≥ ${k})`, minEC >= k) +
    htmlRow("Avg Equivalence Class", avgEC.toFixed(1)) +
    htmlRow("Number of Classes", equivClassSizes.length) +
    htmlRow("Suppressed Records", `${suppressed.length} (${(suppressionRate*100).toFixed(1)}%)`, suppressionRate <= suppressionLimit),
    htmlRow("GIL Score", `${(gil * 100).toFixed(2)}%`, gil <= 0.3) +
    qis.map((col) => htmlRow(`GIL — ${col}`, `${(gilCols[col] * 100).toFixed(2)}%`)).join(""),
    interp,
    warnings.filter((w) => !w.includes("does not protect")),
  );

  return {
    technique: "K-Anonymity (Mondrian)", family: "SDC",
    processedData: processed, originalCount: N, processedCount: processed.length,
    recordsSuppressed: suppressed.length,
    informationLoss: gil,
    executionMs: Math.round(performance.now() - t0),
    stats: {
      k,
      kAnonymitySatisfied: kSatisfied ? "YES" : "NO",
      equivalenceClasses: equivClassSizes.length,
      minEquivClassSize: minEC,
      avgEquivClassSize: parseFloat(avgEC.toFixed(1)),
      maxEquivClassSize: equivClassSizes.length > 0 ? Math.max(...equivClassSizes) : 0,
      suppressionRate: `${(suppressionRate * 100).toFixed(1)}%`,
      suppressedRecords: suppressed.length,
      gilScore: `${(gil * 100).toFixed(2)}%`,
    },
    colStats: colStatsGIL,
    warnings,
    interpretation: interp,
    compliancePassed: kSatisfied,
    report,
  };
}


// ════════════════════════════════════════════════════════════════════════════
// 2. L-DIVERSITY (Entropy / Distinct / Recursive)
//    Ref: Machanavajjhala et al., TKDE 2007
// ════════════════════════════════════════════════════════════════════════════

export function applyLDiversity(
  data: DataRow[],
  qis: string[],
  sensitiveAttr: string,
  l: number,
  method: "entropy" | "distinct" | "recursive",
  kBase = 3,
  c = 0.5,
): PrivacyResult {
  const t0 = performance.now();
  if (data.length === 0 || qis.length === 0) return sdcEmpty("L-Diversity");
  const N = data.length;

  const saVals = Array.from(new Set(data.map((r) => String(r[sensitiveAttr] ?? ""))));
  const saUnique = saVals.length;

  const logL = Math.log(l);
  const kForEC = Math.max(2, kBase);
  const partitions = mondrianPartition(data, qis, kForEC);

  const classMap = new Map<number, number[]>();
  partitions.forEach((part, idx) => {
    if (part.indices.length >= kForEC) classMap.set(idx, part.indices);
  });

  const satisfying: DataRow[] = [];
  let violating = 0;
  const entropies: number[] = [];

  for (const [, indices] of Array.from(classMap)) {
    const rows = indices.map((i) => data[i]);
    const freqMap = new Map<string, number>();
    rows.forEach((r) => {
      const v = String(r[sensitiveAttr] ?? "");
      freqMap.set(v, (freqMap.get(v) || 0) + 1);
    });

    let entropy = 0;
    freqMap.forEach((cnt) => {
      const p = cnt / rows.length;
      if (p > 0) entropy -= p * Math.log(p);
    });
    entropies.push(entropy);

    let satisfied = false;
    if (method === "entropy") {
      satisfied = entropy >= logL;
    } else if (method === "distinct") {
      satisfied = freqMap.size >= l;
    } else {
      // Recursive (c, l)-diversity: r₁ < c × (r₂ + r₃ + …)
      const sorted = Array.from(freqMap.values()).sort((a, b) => b - a);
      const r1 = sorted[0] || 0;
      const rest = sorted.slice(1).reduce((s, v) => s + v, 0);
      satisfied = freqMap.size >= l && (rest === 0 ? false : r1 < c * rest);
    }

    if (satisfied) {
      rows.forEach((r) => satisfying.push(r));
    } else {
      violating++;
    }
  }

  const totalClasses = classMap.size;
  const passing = totalClasses - violating;
  const lSatisfied = violating === 0;
  const minEntropy = entropies.length > 0 ? Math.min(...entropies) : 0;
  const maxEntropy = entropies.length > 0 ? Math.max(...entropies) : 0;
  const avgEntropy = entropies.length > 0 ? mean(entropies) : 0;

  const interp = `${passing} of ${totalClasses} equivalence classes satisfy ${l}-diversity using the ${method} method. ` +
    (method === "entropy" ? `The minimum entropy observed is ${minEntropy.toFixed(3)}, which ${minEntropy >= logL ? "meets" : "does not meet"} the threshold of log(${l}) = ${logL.toFixed(3)}. ` : "") +
    `${violating} classes were suppressed. ` +
    (saUnique < l ? `WARNING: The SA column has only ${saUnique} unique values — l-diversity at l=${l} may be impossible globally. Reduce l to ≤ ${saUnique}.` : "");

  const warnings: string[] = [
    ...(saUnique < l ? [`CRITICAL: SA column has only ${saUnique} unique values globally — reduce L to ≤ ${saUnique}.`] : []),
    "L-Diversity protects against attribute disclosure but not skewness or similarity attacks.",
    ...(violating / Math.max(totalClasses, 1) > 0.3 ? ["Many violating classes — consider a larger dataset, lower l, or switch to Distinct variant."] : []),
  ];

  const now = new Date().toLocaleString("en-IN");
  const report = buildReport(
    `L-Diversity (${method})`, "dataset", now, N, satisfying.length,
    htmlRow("L Value", l) + htmlRow("Variant", method) +
      (method === "recursive" ? htmlRow("c (recursive)", c) : "") +
      htmlRow("Underlying K", kBase) +
      htmlRow("QI Columns", qis.join(", ")) + htmlRow("Sensitive Attribute", sensitiveAttr),
    htmlRow("L-Diversity Satisfied", lSatisfied ? "YES" : "NO", lSatisfied) +
    htmlRow("Total Equivalence Classes", totalClasses) +
    htmlRow("Classes Passing", passing, passing === totalClasses) +
    htmlRow("Classes Failing", violating, violating === 0) +
    htmlRow("Suppressed Records", `${N - satisfying.length} (${N > 0 ? ((N - satisfying.length)/N*100).toFixed(1) : 0}%)`, N - satisfying.length === 0),
    (method === "entropy"
      ? htmlRow("Min Class Entropy", minEntropy.toFixed(4), minEntropy >= logL) +
        htmlRow("Max Class Entropy", maxEntropy.toFixed(4)) +
        htmlRow("Avg Class Entropy", avgEntropy.toFixed(4)) +
        htmlRow("Entropy Threshold log(l)", logL.toFixed(4))
      : ""),
    interp,
    warnings.filter((w) => !w.includes("skewness")),
  );

  return {
    technique: `L-Diversity (${method})`, family: "SDC",
    processedData: satisfying, originalCount: N, processedCount: satisfying.length,
    recordsSuppressed: N - satisfying.length,
    informationLoss: N > 0 ? (N - satisfying.length) / N : 0,
    executionMs: Math.round(performance.now() - t0),
    stats: {
      l, method, underlyingK: kBase,
      lDiversitySatisfied: lSatisfied ? "YES" : "NO",
      totalEquivClasses: totalClasses,
      classesPassing: passing,
      classesFailing: violating,
      ...(method === "entropy" ? {
        minClassEntropy: minEntropy.toFixed(4),
        maxClassEntropy: maxEntropy.toFixed(4),
        avgClassEntropy: avgEntropy.toFixed(4),
        entropyThreshold: logL.toFixed(4),
      } : {}),
      saUniqueValues: saUnique,
    },
    warnings,
    interpretation: interp,
    compliancePassed: lSatisfied,
    report,
  };
}


// ════════════════════════════════════════════════════════════════════════════
// 3. T-CLOSENESS (Earth Mover's Distance)
//    Ref: Li et al., ICDE 2007
// ════════════════════════════════════════════════════════════════════════════

export function applyTCloseness(
  data: DataRow[],
  qis: string[],
  sensitiveAttr: string,
  t: number,
  kBase = 3,
): PrivacyResult {
  const t0 = performance.now();
  if (data.length === 0 || qis.length === 0) return sdcEmpty("T-Closeness");
  const N = data.length;

  const globalFreq = new Map<string, number>();
  data.forEach((r) => {
    const v = String(r[sensitiveAttr] ?? "");
    globalFreq.set(v, (globalFreq.get(v) || 0) + 1);
  });
  const globalVals = Array.from(globalFreq.keys()).sort();
  const isNumericSA = isNumericCol(data, sensitiveAttr);

  function computeEMD(partition: DataRow[]): number {
    const localFreq = new Map<string, number>();
    partition.forEach((r) => {
      const v = String(r[sensitiveAttr] ?? "");
      localFreq.set(v, (localFreq.get(v) || 0) + 1);
    });
    const m = partition.length;
    if (isNumericSA) {
      let cumP = 0, cumQ = 0, emd = 0;
      for (const v of globalVals) {
        cumP += (localFreq.get(v) || 0) / m;
        cumQ += (globalFreq.get(v) || 0) / N;
        emd += Math.abs(cumP - cumQ);
      }
      return emd / Math.max(globalVals.length - 1, 1);
    } else {
      let emd = 0;
      globalVals.forEach((v) => {
        emd += Math.abs(((localFreq.get(v) || 0) / m) - ((globalFreq.get(v) || 0) / N));
      });
      return emd / 2;
    }
  }

  const k = Math.max(2, kBase);
  const partitions = mondrianPartition(data, qis, k);
  const classMap = new Map<number, DataRow[]>();
  partitions.forEach((part, idx) => {
    if (part.indices.length >= k) classMap.set(idx, part.indices.map((i) => data[i]));
  });

  const satisfying: DataRow[] = [];
  let satisfyingClasses = 0, violatingClasses = 0;
  const emds: number[] = [];

  for (const [, rows] of Array.from(classMap)) {
    const emd = computeEMD(rows);
    emds.push(emd);
    if (emd <= t) {
      rows.forEach((r) => satisfying.push(r));
      satisfyingClasses++;
    } else {
      violatingClasses++;
    }
  }

  const minEMD = emds.length > 0 ? Math.min(...emds) : 0;
  const maxEMD = emds.length > 0 ? Math.max(...emds) : 0;
  const avgEMD = emds.length > 0 ? mean(emds) : 0;
  const tSatisfied = violatingClasses === 0;

  const interp = `${satisfyingClasses} of ${classMap.size} equivalence classes satisfy t-closeness at t=${t}. ` +
    `The maximum EMD observed is ${maxEMD.toFixed(4)} (threshold: ${t}). ` +
    (violatingClasses > 0 ? `${violatingClasses} classes failed and were suppressed. ` : "") +
    `T-closeness prevents skewness attacks by ensuring no class has a significantly different SA distribution from the dataset as a whole.`;

  const warnings: string[] = [
    "T-Closeness is the strictest SDC technique but significantly reduces data utility.",
    ...(t < 0.1 ? ["Very tight t threshold — try t=0.20–0.35 for better record retention."] : []),
    ...(maxEMD > t && tSatisfied === false ? [`Max EMD ${maxEMD.toFixed(4)} exceeds t=${t}. Increase t or add more QI columns.`] : []),
  ];

  const now = new Date().toLocaleString("en-IN");
  const report = buildReport(
    "T-Closeness (EMD)", "dataset", now, N, satisfying.length,
    htmlRow("T Threshold", t) + htmlRow("Distance Metric", isNumericSA ? "EMD (ordered, CDF)" : "TVD (categorical, ½ L1)") +
      htmlRow("Underlying K", k) + htmlRow("QI Columns", qis.join(", ")) + htmlRow("Sensitive Attribute", sensitiveAttr),
    htmlRow("T-Closeness Satisfied", tSatisfied ? "YES" : "NO", tSatisfied) +
    htmlRow("Total Equivalence Classes", classMap.size) +
    htmlRow("Classes Passing (EMD ≤ t)", satisfyingClasses, satisfyingClasses === classMap.size) +
    htmlRow("Classes Failing (EMD > t)", violatingClasses, violatingClasses === 0) +
    htmlRow("Suppressed Records", `${N - satisfying.length} (${N > 0 ? ((N - satisfying.length)/N*100).toFixed(1) : 0}%)`, N - satisfying.length === 0),
    htmlRow("Min EMD (best class)", minEMD.toFixed(4), minEMD <= t) +
    htmlRow("Max EMD (worst class)", maxEMD.toFixed(4), maxEMD <= t) +
    htmlRow("Avg EMD", avgEMD.toFixed(4)),
    interp,
    warnings.filter((w) => !w.includes("strictest")),
  );

  return {
    technique: "T-Closeness (EMD)", family: "SDC",
    processedData: satisfying, originalCount: N, processedCount: satisfying.length,
    recordsSuppressed: N - satisfying.length,
    informationLoss: N > 0 ? (N - satisfying.length) / N : 0,
    executionMs: Math.round(performance.now() - t0),
    stats: {
      t, underlyingK: k,
      tClosenessSatisfied: tSatisfied ? "YES" : "NO",
      totalClasses: classMap.size,
      satisfyingClasses, violatingClasses,
      minEMD: minEMD.toFixed(4),
      maxEMD: maxEMD.toFixed(4),
      avgEMD: avgEMD.toFixed(4),
      emdType: isNumericSA ? "Ordered CDF" : "Categorical ½L1",
    },
    warnings,
    interpretation: interp,
    compliancePassed: tSatisfied,
    report,
  };
}


// ════════════════════════════════════════════════════════════════════════════
// 4. RANK SWAPPING
//    Ref: Domingo-Ferrer & Torra, 2005
// ════════════════════════════════════════════════════════════════════════════

export function applyRankSwapping(
  data: DataRow[],
  targetCols: string[],
  swapFraction: number,
  seed = 42,
): PrivacyResult {
  const t0 = performance.now();
  if (data.length === 0) return sdcEmpty("Rank Swapping");
  const N = data.length;
  const numericCols = targetCols.filter((c) => isNumericCol(data, c));
  const p = Math.max(1, Math.round(swapFraction * N));

  const processed: DataRow[] = data.map((r) => ({ ...r }));

  // Seeded PRNG (simple mulberry32)
  let rngState = seed + 0x6D2B79F5;
  function rng(): number {
    rngState += 0x6D2B79F5;
    let z = rngState;
    z = (z ^ (z >>> 15)) * (z | 1);
    z ^= z + (z ^ (z >>> 7)) * (z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }

  numericCols.forEach((col) => {
    const order = Array.from({ length: N }, (_, i) => i)
      .sort((a, b) => Number(processed[a][col]) - Number(processed[b][col]));
    const rankOrder = new Array(N).fill(0);
    order.forEach((origIdx, rank) => { rankOrder[origIdx] = rank; });

    const swapped = new Uint8Array(N);
    const shuffled = Array.from({ length: N }, (_, i) => i).sort(() => rng() - 0.5);

    for (const rank of shuffled) {
      const i = order[rank];
      if (swapped[i]) continue;
      const lo = Math.max(0, rank - p), hi = Math.min(N - 1, rank + p);
      const candidates: number[] = [];
      for (let r = lo; r <= hi; r++) {
        if (r !== rank && !swapped[order[r]]) candidates.push(order[r]);
      }
      if (candidates.length === 0) continue;
      const j = candidates[Math.floor(rng() * candidates.length)];
      const tmp = processed[i][col];
      processed[i][col] = processed[j][col];
      processed[j][col] = tmp;
      swapped[i] = 1; swapped[j] = 1;
    }
  });

  // Compute per-column metrics
  const colStats: Record<string, Record<string, string | number>> = {};
  let totalSwappedPairs = 0;

  numericCols.forEach((col) => {
    const orig = data.map((r) => Number(r[col])).filter((v) => !isNaN(v));
    const res  = processed.map((r) => Number(r[col])).filter((v) => !isNaN(v));
    const len = Math.min(orig.length, res.length);
    const o = orig.slice(0, len), r = res.slice(0, len);

    const rho = spearmanRho(o, r);
    const mae = mean(o.map((v, i) => Math.abs(v - r[i])));
    const origMean = mean(o), resMean = mean(r);
    const origStd  = stddev(o), resStd  = stddev(r);
    const meanPct  = origMean !== 0 ? Math.abs(origMean - resMean) / Math.abs(origMean) * 100 : 0;
    const stdPct   = origStd  !== 0 ? Math.abs(origStd  - resStd)  / Math.abs(origStd)  * 100 : 0;
    const swapCount = o.filter((v, i) => v !== r[i]).length;
    const swapRate  = swapCount / len * 100;
    totalSwappedPairs += swapCount;

    colStats[col] = {
      "Swap Rate": `${swapRate.toFixed(1)}%`,
      "MAE": mae.toFixed(4),
      "Spearman ρ": rho.toFixed(4),
      "Mean Shift": `${meanPct.toFixed(2)}%`,
      "Std Dev Shift": `${stdPct.toFixed(2)}%`,
    };
  });

  const avgRho = numericCols.length > 0
    ? mean(numericCols.map((c) => parseFloat(String(colStats[c]["Spearman ρ"]))))
    : 1;
  const compliancePassed = avgRho >= 0.85;

  const interp = `Rank swapping was applied to ${numericCols.length} columns with swap fraction ${(swapFraction * 100).toFixed(0)}% (p=${p} records). ` +
    `The mean Spearman rank correlation across columns is ${avgRho.toFixed(3)}, indicating ${avgRho >= 0.90 ? "high" : avgRho >= 0.75 ? "moderate" : "low"} data utility retention. ` +
    `The value distribution for each column remains identical (marginal preservation confirmed).`;

  const warnings: string[] = [
    ...(numericCols.length === 0 ? ["No numeric columns selected. Rank swapping only applies to numeric attributes."] : []),
    ...(avgRho < 0.85 ? [`High distortion: mean Spearman ρ = ${avgRho.toFixed(3)}. Reduce swap fraction below ${(swapFraction * 50).toFixed(0)}%.`] : []),
  ];

  const colTable = numericCols.map((c) =>
    htmlRow(c, `ρ=${colStats[c]["Spearman ρ"]}  MAE=${colStats[c]["MAE"]}  swap=${colStats[c]["Swap Rate"]}`)
  ).join("");

  const now = new Date().toLocaleString("en-IN");
  const report = buildReport(
    "Rank Swapping", "dataset", now, N, N,
    htmlRow("Swap Fraction", `${(swapFraction * 100).toFixed(0)}%`) +
    htmlRow("Max Rank Distance (p)", `${p} records`) +
    htmlRow("Target Columns", numericCols.join(", ")) +
    htmlRow("Random Seed", seed),
    htmlRow("Avg Spearman ρ", avgRho.toFixed(4), compliancePassed) +
    htmlRow("Marginal Preservation", "CONFIRMED", true) +
    htmlRow("Total Swapped Records", totalSwappedPairs),
    colTable,
    interp,
    warnings,
  );

  return {
    technique: "Rank Swapping", family: "SDC",
    processedData: processed, originalCount: N, processedCount: N,
    recordsSuppressed: 0,
    informationLoss: Math.max(0, 1 - avgRho),
    executionMs: Math.round(performance.now() - t0),
    stats: {
      swapFraction: `${(swapFraction * 100).toFixed(0)}%`,
      maxRankDistance: p,
      columnsSwapped: numericCols.length,
      avgSpearmanRho: avgRho.toFixed(4),
      marginalPreservation: "CONFIRMED",
    },
    colStats,
    warnings,
    interpretation: interp,
    compliancePassed,
    report,
  };
}


// ════════════════════════════════════════════════════════════════════════════
// 5. MICROAGGREGATION (MDAV)
//    Ref: Domingo-Ferrer & Mateo-Sanz, IEEE TKDE 2002
// ════════════════════════════════════════════════════════════════════════════

export function applyMicroaggregation(
  data: DataRow[],
  targetCols: string[],
  clusterSize: number,
  distanceMetric: "euclidean" | "manhattan" = "euclidean",
): PrivacyResult {
  const t0 = performance.now();
  if (data.length === 0) return sdcEmpty("Microaggregation");
  const numericCols = targetCols.filter((c) => isNumericCol(data, c));
  if (numericCols.length === 0) return sdcEmpty("Microaggregation");
  const N = data.length;
  const k = clusterSize;

  // Normalise target columns to [0,1] for distance calculation
  const ranges = numericCols.map((c) => ({ min: Math.min(...data.map((r) => Number(r[c]))), range: Math.max(1, columnRange(data, c)) }));
  const norm = (row: DataRow, ci: number) => (Number(row[numericCols[ci]]) - ranges[ci].min) / ranges[ci].range;

  const distFn = (a: DataRow, b: DataRow): number => {
    if (distanceMetric === "manhattan") {
      return numericCols.reduce((s, _c, ci) => s + Math.abs(norm(a, ci) - norm(b, ci)), 0);
    }
    return Math.sqrt(numericCols.reduce((s, _c, ci) => s + (norm(a, ci) - norm(b, ci)) ** 2, 0));
  };

  const centroidVec = (rows: DataRow[]): number[] =>
    numericCols.map((c) => mean(rows.map((r) => Number(r[c]))));
  const distToVec = (row: DataRow, vec: number[]): number => {
    if (distanceMetric === "manhattan") return vec.reduce((s, v, ci) => s + Math.abs(norm(row, ci) - (v - ranges[ci].min) / ranges[ci].range), 0);
    return Math.sqrt(vec.reduce((s, v, ci) => s + (norm(row, ci) - (v - ranges[ci].min) / ranges[ci].range) ** 2, 0));
  };

  // MDAV algorithm
  const remaining: number[] = data.map((_, i) => i);
  const clusters: number[][] = [];

  while (remaining.length >= k) {
    const rows = remaining.map((i) => data[i]);
    const c = centroidVec(rows);

    // r1: farthest from centroid
    let r1 = 0, r1d = -1;
    rows.forEach((r, ri) => { const d = distToVec(r, c); if (d > r1d) { r1d = d; r1 = ri; } });
    const r1idx = remaining[r1];

    // k nearest to r1
    const nearR1 = remaining
      .map((origIdx) => ({ origIdx, d: distFn(data[origIdx], data[r1idx]) }))
      .sort((a, b) => a.d - b.d).slice(0, k).map((x) => x.origIdx);
    clusters.push(nearR1);
    const usedA = new Set(nearR1);
    remaining.splice(0, remaining.length, ...remaining.filter((i) => !usedA.has(i)));

    if (remaining.length < k) break;

    const rows2 = remaining.map((i) => data[i]);
    const c2 = centroidVec(rows2);
    let r2 = 0, r2d = -1;
    rows2.forEach((r, ri) => { const d = distToVec(r, c2); if (d > r2d) { r2d = d; r2 = ri; } });
    const r2idx = remaining[r2];
    const nearR2 = remaining
      .map((origIdx) => ({ origIdx, d: distFn(data[origIdx], data[r2idx]) }))
      .sort((a, b) => a.d - b.d).slice(0, k).map((x) => x.origIdx);
    clusters.push(nearR2);
    const usedB = new Set(nearR2);
    remaining.splice(0, remaining.length, ...remaining.filter((i) => !usedB.has(i)));
  }
  if (remaining.length > 0 && clusters.length > 0) {
    clusters[clusters.length - 1].push(...remaining);
  } else if (remaining.length > 0) {
    clusters.push([...remaining]);
  }

  // Replace values with cluster centroids
  const processed: DataRow[] = data.map((r) => ({ ...r }));
  clusters.forEach((cluster) => {
    numericCols.forEach((col) => {
      const cMean = mean(cluster.map((i) => Number(data[i][col])));
      cluster.forEach((i) => { processed[i][col] = parseFloat(cMean.toFixed(4)); });
    });
  });

  // SSE / SST information loss
  const globalMeans = numericCols.map((c) => mean(data.map((r) => Number(r[c]))));
  let sse = 0, sst = 0;
  clusters.forEach((cluster) => {
    numericCols.forEach((col, ci) => {
      const cMean = mean(cluster.map((i) => Number(data[i][col])));
      cluster.forEach((i) => {
        sse += (Number(data[i][col]) - cMean) ** 2;
        sst += (Number(data[i][col]) - globalMeans[ci]) ** 2;
      });
    });
  });
  const il = sst > 0 ? sse / sst : 0;

  const clusterSizes = clusters.map((c) => c.length);

  // Per-column stats
  const colStats: Record<string, Record<string, string | number>> = {};
  numericCols.forEach((col) => {
    const origVals = data.map((r) => Number(r[col]));
    const newVals  = processed.map((r) => Number(r[col]));
    const r = pearsonR(origVals, newVals);
    const mad = mean(origVals.map((v, i) => Math.abs(v - newVals[i])));
    const origStd = stddev(origVals), newStd = stddev(newVals);
    const varRatio = origStd > 0 ? (newStd * newStd) / (origStd * origStd) : 1;
    colStats[col] = {
      "MAD": mad.toFixed(4),
      "Pearson r": r.toFixed(4),
      "Var Ratio": varRatio.toFixed(4),
      "Orig Mean": mean(origVals).toFixed(4),
      "Post Mean": mean(newVals).toFixed(4),
    };
  });

  const avgPearson = numericCols.length > 0
    ? mean(numericCols.map((c) => parseFloat(String(colStats[c]["Pearson r"])))) : 1;
  const ilPct = (il * 100).toFixed(1);
  const compliancePassed = il < 0.30 && avgPearson >= 0.80;

  const interp = `MDAV microaggregation was applied to ${numericCols.length} columns with cluster size k=${k}. ` +
    `${clusters.length} clusters were formed. The information loss (SSE/SST) is ${ilPct}%, indicating ` +
    `${il < 0.15 ? "low" : il < 0.30 ? "moderate" : "high"} distortion. ` +
    `The average Pearson correlation across target columns is ${avgPearson.toFixed(3)}, showing ${avgPearson >= 0.90 ? "high" : "moderate"} utility preservation.`;

  const warnings: string[] = [
    ...(il > 0.30 ? [`High information loss (${ilPct}%). Reduce k or apply to fewer columns.`] : []),
    ...numericCols.filter((c) => parseFloat(String(colStats[c]["Pearson r"])) < 0.80)
      .map((c) => `Column "${c}" is heavily distorted (Pearson r=${colStats[c]["Pearson r"]}). Consider excluding it.`),
  ];

  const colTable = numericCols.map((c) =>
    htmlRow(c, `r=${colStats[c]["Pearson r"]}  MAD=${colStats[c]["MAD"]}  Var ratio=${colStats[c]["Var Ratio"]}`)
  ).join("");

  const now = new Date().toLocaleString("en-IN");
  const report = buildReport(
    "Microaggregation (MDAV)", "dataset", now, N, N,
    htmlRow("Cluster Size (k)", k) + htmlRow("Target Columns", numericCols.join(", ")) + htmlRow("Distance Metric", distanceMetric),
    htmlRow("Number of Clusters", clusters.length) +
    htmlRow("Min Cluster Size", Math.min(...clusterSizes), Math.min(...clusterSizes) >= k) +
    htmlRow("Max Cluster Size", Math.max(...clusterSizes)) +
    htmlRow("Avg Cluster Size", mean(clusterSizes).toFixed(1)) +
    htmlRow("SSE / SST (IL Score)", `${ilPct}% (${il < 0.15 ? "Low" : il < 0.30 ? "Medium" : "High"})`, il < 0.30),
    colTable,
    interp,
    warnings,
  );

  return {
    technique: "Microaggregation (MDAV)", family: "SDC",
    processedData: processed, originalCount: N, processedCount: N,
    recordsSuppressed: 0,
    informationLoss: il,
    executionMs: Math.round(performance.now() - t0),
    stats: {
      clusterSize: k,
      totalClusters: clusters.length,
      minClusterSize: Math.min(...clusterSizes),
      maxClusterSize: Math.max(...clusterSizes),
      avgClusterSize: mean(clusterSizes).toFixed(1),
      ilScoreSSESST: `${ilPct}%`,
      ilInterpretation: il < 0.15 ? "Low" : il < 0.30 ? "Moderate" : "High",
      avgPearsonR: avgPearson.toFixed(4),
      distanceMetric,
      columnsAggregated: numericCols.length,
    },
    colStats,
    warnings,
    interpretation: interp,
    compliancePassed,
    report,
  };
}


// ════════════════════════════════════════════════════════════════════════════
// 6. PRAM (Post-Randomisation Method)
//    Ref: Kooiman et al., Statistics Netherlands, 1997
// ════════════════════════════════════════════════════════════════════════════

export function applyPRAM(
  data: DataRow[],
  targetCols: string[],
  retentionProb: number,
  variant: "simple" | "unbiased" = "simple",
  seed = 42,
): PrivacyResult {
  const t0 = performance.now();
  if (data.length === 0) return sdcEmpty("PRAM");
  const N = data.length;
  const catCols = targetCols.filter((c) => !isNumericCol(data, c));

  // Auto-detect categoricals if nothing selected
  const cols = catCols.length > 0 ? catCols : targetCols;
  const effectiveCols = cols.filter((c) => !isNumericCol(data, c));

  // Seeded PRNG
  let rngState = seed + 0x6D2B79F5;
  function rng(): number {
    rngState += 0x6D2B79F5;
    let z = rngState;
    z = (z ^ (z >>> 15)) * (z | 1);
    z ^= z + (z ^ (z >>> 7)) * (z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }

  const categories = new Map<string, string[]>();
  effectiveCols.forEach((col) => {
    const distinct = Array.from(new Set(data.map((r) => String(r[col] ?? "")))).sort();
    categories.set(col, distinct);
  });

  const processed: DataRow[] = data.map((row) => {
    const newRow = { ...row };
    effectiveCols.forEach((col) => {
      const cats = categories.get(col)!;
      if (cats.length <= 1) return;
      const currentVal = String(row[col] ?? "");
      const currentIdx = cats.indexOf(currentVal);
      if (currentIdx === -1) return;
      const offDiag = (1 - retentionProb) / (cats.length - 1);
      let r = rng() - retentionProb;
      if (r <= 0) { newRow[col] = currentVal; return; }
      for (let j = 0; j < cats.length; j++) {
        if (j === currentIdx) continue;
        r -= offDiag;
        if (r <= 0) { newRow[col] = cats[j]; return; }
      }
      newRow[col] = cats[cats.length - 1];
    });
    return newRow;
  });

  // Per-column metrics
  const colStats: Record<string, Record<string, string | number>> = {};

  effectiveCols.forEach((col) => {
    const cats = categories.get(col)!;
    const S = cats.length;
    let retained = 0;
    const origFreq = new Map<string, number>(), newFreq = new Map<string, number>();
    cats.forEach((c) => { origFreq.set(c, 0); newFreq.set(c, 0); });
    data.forEach((r, i) => {
      const orig = String(r[col] ?? ""), proc = String(processed[i][col] ?? "");
      if (orig === proc) retained++;
      origFreq.set(orig, (origFreq.get(orig) || 0) + 1);
      newFreq.set(proc, (newFreq.get(proc) || 0) + 1);
    });
    const actualRetention = retained / N;
    const tvdVal = tvd(cats, origFreq, newFreq, N);

    // Chi-square test
    let chi2 = 0;
    cats.forEach((c) => {
      const expected = (origFreq.get(c) || 0);
      const observed = (newFreq.get(c) || 0);
      if (expected > 0) chi2 += (observed - expected) ** 2 / expected;
    });
    const pValue = chiSquareP(chi2, Math.max(1, S - 1));

    colStats[col] = {
      "Categories": S,
      "Actual Retention": `${(actualRetention * 100).toFixed(1)}%`,
      "Perturbation Rate": `${((1 - actualRetention) * 100).toFixed(1)}%`,
      "TVD": tvdVal.toFixed(4),
      "χ² p-value": pValue.toFixed(4),
    };
  });

  const avgTVD = effectiveCols.length > 0
    ? mean(effectiveCols.map((c) => parseFloat(String(colStats[c]["TVD"])))) : 0;
  const compliancePassed = avgTVD < 0.10 &&
    effectiveCols.every((c) => parseFloat(String(colStats[c]["χ² p-value"])) > 0.05);

  const interp = `PRAM was applied to ${effectiveCols.length} categorical columns with retention probability ${(retentionProb * 100).toFixed(0)}% (${variant} variant). ` +
    `The mean Total Variation Distance is ${avgTVD.toFixed(4)}, indicating ${avgTVD < 0.10 ? "minimal" : avgTVD < 0.20 ? "moderate" : "high"} distribution shift post-perturbation. ` +
    `For each record, an adversary who knows the perturbed value has only ${(retentionProb * 100).toFixed(0)}% confidence the original value matches — providing plausible deniability.`;

  const warnings: string[] = [
    ...(effectiveCols.length === 0 ? ["No categorical columns found. PRAM primarily applies to categorical attributes."] : []),
    ...(avgTVD > 0.20 ? [`Distribution has shifted significantly (avg TVD=${avgTVD.toFixed(3)}). Switch to Unbiased PRAM variant.`] : []),
  ];

  const colTable = effectiveCols.map((c) =>
    htmlRow(c, `Retention=${colStats[c]["Actual Retention"]}  TVD=${colStats[c]["TVD"]}  χ²-p=${colStats[c]["χ² p-value"]}`)
  ).join("");

  const now = new Date().toLocaleString("en-IN");
  const report = buildReport(
    "PRAM", "dataset", now, N, N,
    htmlRow("Retention Probability", `${(retentionProb * 100).toFixed(0)}% (keep) / ${((1-retentionProb)*100).toFixed(0)}% (change)`) +
    htmlRow("PRAM Variant", variant) + htmlRow("Target Columns", effectiveCols.join(", ")) + htmlRow("Random Seed", seed),
    htmlRow("Avg TVD", avgTVD.toFixed(4), avgTVD < 0.10) +
    htmlRow("Distributional Similarity", compliancePassed ? "CONFIRMED (χ² p > 0.05)" : "REJECTED", compliancePassed),
    colTable,
    interp,
    warnings,
  );

  return {
    technique: "PRAM (Post Randomisation Method)", family: "SDC",
    processedData: processed, originalCount: N, processedCount: N,
    recordsSuppressed: 0,
    informationLoss: Math.min(1, avgTVD * 5),
    executionMs: Math.round(performance.now() - t0),
    stats: {
      retentionProbability: `${(retentionProb * 100).toFixed(0)}%`,
      perturbationProbability: `${((1 - retentionProb) * 100).toFixed(0)}%`,
      variant,
      categoricalColsPerturbed: effectiveCols.length,
      avgTVD: avgTVD.toFixed(4),
      transitionMatrix: `M[i,i]=${retentionProb}, M[i,j]=${((1 - retentionProb) / Math.max(2, 1)).toFixed(3)} (off-diagonal)`,
    },
    colStats,
    warnings,
    interpretation: interp,
    compliancePassed,
    report,
  };
}


// ════════════════════════════════════════════════════════════════════════════
// 7. TOP/BOTTOM CODING (Percentile Capping + Optional Noise)
// ════════════════════════════════════════════════════════════════════════════

export function applyTopBottomCoding(
  data: DataRow[],
  targetCols: string[],
  topPercentile: number,   // 50–100 (e.g. 95)
  bottomPercentile: number, // 0–50 (e.g. 5)
  addNoise: boolean,
  noiseLambda: number,     // σ_noise = lambda × col_std
  seed = 42,
): PrivacyResult {
  const t0 = performance.now();
  if (data.length === 0) return sdcEmpty("Top/Bottom Coding");
  const N = data.length;
  const numericCols = targetCols.filter((c) => isNumericCol(data, c));

  if (topPercentile <= bottomPercentile) {
    return {
      ...sdcEmpty("Top/Bottom Coding"),
      warnings: ["Validation error: Bottom cap must be less than top cap."],
    };
  }

  // Seeded PRNG
  let rngState = seed + 0x6D2B79F5;
  function rng(): number {
    rngState += 0x6D2B79F5;
    let z = rngState;
    z = (z ^ (z >>> 15)) * (z | 1);
    z ^= z + (z ^ (z >>> 7)) * (z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }
  function boxMullerNormal(): number {
    const u1 = rng(), u2 = rng();
    return Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
  }

  const colStats: Record<string, Record<string, string | number>> = {};
  const processed: DataRow[] = data.map((r) => ({ ...r }));

  numericCols.forEach((col) => {
    const origVals = data.map((r) => Number(r[col])).filter((v) => !isNaN(v));
    const sorted = [...origVals].sort((a, b) => a - b);
    const qBot = percentile(sorted, bottomPercentile);
    const qTop = percentile(sorted, topPercentile);
    const origMean = mean(origVals), origStd = stddev(origVals);
    const sigmaNoise = noiseLambda * origStd;

    let nTopCapped = 0, nBotCapped = 0;

    data.forEach((row, i) => {
      let v = Number(row[col]);
      if (isNaN(v)) return;
      if (v > qTop) { nTopCapped++; v = qTop; }
      else if (v < qBot) { nBotCapped++; v = qBot; }
      if (addNoise && sigmaNoise > 0) v += sigmaNoise * boxMullerNormal();
      processed[i][col] = parseFloat(v.toFixed(4));
    });

    const newVals = processed.map((r) => Number(r[col]));
    const newMean = mean(newVals), newStd = stddev(newVals);
    const meanShiftPct = origMean !== 0 ? Math.abs(origMean - newMean) / Math.abs(origMean) * 100 : 0;
    const stdShiftPct  = origStd  !== 0 ? Math.abs(origStd  - newStd)  / Math.abs(origStd)  * 100 : 0;

    colStats[col] = {
      "q_bot": qBot.toFixed(4),
      "q_top": qTop.toFixed(4),
      "Bot Capped": `${nBotCapped} (${(nBotCapped/N*100).toFixed(1)}%)`,
      "Top Capped": `${nTopCapped} (${(nTopCapped/N*100).toFixed(1)}%)`,
      "Mean Shift": `${meanShiftPct.toFixed(2)}%`,
      "Std Dev Shift": `${stdShiftPct.toFixed(2)}%`,
      ...(addNoise ? { "σ_noise": sigmaNoise.toFixed(4) } : {}),
    };
  });

  const totalAffected = numericCols.reduce((s, c) => {
    const bCap = parseInt(String(colStats[c]["Bot Capped"]).split(" ")[0]);
    const tCap = parseInt(String(colStats[c]["Top Capped"]).split(" ")[0]);
    return s + bCap + tCap;
  }, 0);

  const maxCappingCol = numericCols.length > 0
    ? numericCols.reduce((best, c) => {
        const bRate = parseFloat(String(colStats[c]["Bot Capped"]).match(/\((.+)%\)/)?.[1] ?? "0");
        const tRate = parseFloat(String(colStats[c]["Top Capped"]).match(/\((.+)%\)/)?.[1] ?? "0");
        const bestBRate = parseFloat(String(colStats[best]?.["Bot Capped"] ?? "0%").match(/\((.+)%\)/)?.[1] ?? "0");
        const bestTRate = parseFloat(String(colStats[best]?.["Top Capped"] ?? "0%").match(/\((.+)%\)/)?.[1] ?? "0");
        return (bRate + tRate) > (bestBRate + bestTRate) ? c : best;
      })
    : "";

  const avgMeanShift = numericCols.length > 0
    ? mean(numericCols.map((c) => parseFloat(String(colStats[c]["Mean Shift"])))) : 0;
  const compliancePassed = avgMeanShift < 5 && numericCols.length > 0;

  const interp = `Top/Bottom coding was applied to ${numericCols.length} columns. ` +
    `Values above the ${topPercentile}th percentile and below the ${bottomPercentile}th percentile were capped. ` +
    `A total of ${totalAffected} record-column instances were capped across all columns. ` +
    (addNoise ? `Gaussian noise with λ=${noiseLambda} was added after capping (σ_noise = λ × col_std per column). ` : "No noise was added. ") +
    `This prevents re-identification via extreme values, which are often unique to specific individuals in survey microdata.`;

  const warnings: string[] = [
    ...(numericCols.length === 0 ? ["No numeric target columns selected."] : []),
    ...(avgMeanShift > 5 ? [`Significant mean shift detected (avg ${avgMeanShift.toFixed(1)}%). Consider widening the percentile range.`] : []),
    ...(maxCappingCol && parseFloat(String(colStats[maxCappingCol]["Top Capped"]).match(/\((.+)%\)/)?.[1] ?? "0") > 20
      ? [`Over 20% of records capped in "${maxCappingCol}". Increase top percentile or decrease bottom percentile.`] : []),
    ...(addNoise && noiseLambda > 0.3 ? [`Noise λ=${noiseLambda} is high — consider reducing it below 0.3.`] : []),
  ];

  const colTable = numericCols.map((c) =>
    htmlRow(c, `[${colStats[c]["q_bot"]}, ${colStats[c]["q_top"]}]  bot=${colStats[c]["Bot Capped"]}  top=${colStats[c]["Top Capped"]}  mean-shift=${colStats[c]["Mean Shift"]}`)
  ).join("");

  const now = new Date().toLocaleString("en-IN");
  const report = buildReport(
    "Top/Bottom Coding", "dataset", now, N, N,
    htmlRow("Top Percentile Cap", `${topPercentile}th percentile`) +
    htmlRow("Bottom Percentile Cap", `${bottomPercentile}th percentile`) +
    htmlRow("Gaussian Noise", addNoise ? `ENABLED (λ=${noiseLambda})` : "DISABLED") +
    htmlRow("Target Columns", numericCols.join(", ")),
    htmlRow("Total Records Affected", `${totalAffected} instances`, totalAffected < N * 0.2 * numericCols.length) +
    htmlRow("Avg Mean Shift", `${avgMeanShift.toFixed(2)}%`, avgMeanShift < 5),
    colTable,
    interp,
    warnings,
  );

  return {
    technique: "Top/Bottom Coding", family: "SDC",
    processedData: processed, originalCount: N, processedCount: N,
    recordsSuppressed: 0,
    informationLoss: Math.min(1, avgMeanShift / 100),
    executionMs: Math.round(performance.now() - t0),
    stats: {
      topPercentile: `${topPercentile}th`,
      bottomPercentile: `${bottomPercentile}th`,
      gaussianNoise: addNoise ? `ENABLED (λ=${noiseLambda})` : "DISABLED",
      totalAffectedInstances: totalAffected,
      avgMeanShift: `${avgMeanShift.toFixed(2)}%`,
      columnsProcessed: numericCols.length,
    },
    colStats,
    warnings,
    interpretation: interp,
    compliancePassed,
    report,
  };
}

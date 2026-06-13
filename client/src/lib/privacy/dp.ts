import { type DataRow, isNumericCol, type PrivacyResult } from "./types";

// ── Local helpers (avoid circular dep with sdc.ts) ───────────────────────────
const _mean = (arr: number[]): number =>
  arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
const _std = (arr: number[], mu?: number): number => {
  if (arr.length < 2) return 0;
  const m = mu ?? _mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
};
const _quantile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
};

// ── Seeded PRNG (mulberry32) — reproducible noise ────────────────────────────
function makePRNG(seed: number | null): () => number {
  if (seed === null) return Math.random;
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Clipping / sensitivity computation ───────────────────────────────────────
export type SensitivityMode = "auto" | "iqr" | "percentile";

function computeClip(vals: number[], mode: SensitivityMode): [number, number] {
  if (vals.length === 0) return [0, 1];
  const sorted = [...vals].sort((a, b) => a - b);
  if (mode === "iqr") {
    const q1 = _quantile(sorted, 0.25);
    const q3 = _quantile(sorted, 0.75);
    const iqr = q3 - q1;
    return [q1 - 1.5 * iqr, q3 + 1.5 * iqr];
  }
  if (mode === "percentile") {
    return [_quantile(sorted, 0.01), _quantile(sorted, 0.99)];
  }
  return [sorted[0], sorted[sorted.length - 1]]; // auto = min–max
}

// ── Adaptive clipping — auto-upgrades to IQR when column range > 100,000 ─────
// Returns [lo, hi, wasUpgraded]. Prevents catastrophic noise on high-range cols.
function computeAdaptiveClip(vals: number[], mode: SensitivityMode): [number, number, boolean] {
  if (mode === "auto" && vals.length > 0) {
    const sorted = [...vals].sort((a, b) => a - b);
    const range = sorted[sorted.length - 1] - sorted[0];
    if (range > 100000) {
      const [lo, hi] = computeClip(vals, "iqr");
      return [lo, hi, true];
    }
  }
  const [lo, hi] = computeClip(vals, mode);
  return [lo, hi, false];
}

// ── DP Options ────────────────────────────────────────────────────────────────
export interface DPOptions {
  sensitivityMode?: SensitivityMode; // default "auto"
  postClamp?: boolean;               // default true — clamp output to clip bounds
  seed?: number | null;              // null = unseeded
}

// ── ε budget interpretation ───────────────────────────────────────────────────
function epsilonLabel(eps: number): string {
  if (eps <= 0.5) return "Very Strong Privacy";
  if (eps <= 1.0) return "Strong Privacy";
  if (eps <= 2.0) return "Moderate Privacy";
  if (eps <= 5.0) return "Acceptable Privacy";
  return "Weak Privacy ⚠";
}
function epsilonBadgeClass(eps: number): string {
  if (eps <= 0.5) return "bg-emerald-600";
  if (eps <= 1.0) return "bg-emerald-500";
  if (eps <= 2.0) return "bg-blue-500";
  if (eps <= 5.0) return "bg-amber-500";
  return "bg-rose-600";
}

// ── Per-column stat bundle ────────────────────────────────────────────────────
interface ColDPStat {
  sensitivity: number;
  noiseScale: number;
  mae: number;
  rmse: number;
  meanRelError: number;
  snr: number;
  meanShiftPct: number;
  stdRatio: number;
  p95AbsNoise: number;
}

function computeColDPStat(
  origVals: number[],
  dpVals: number[],
  noiseScale: number,
  sensitivity: number,
): ColDPStat {
  const noises    = origVals.map((v, i) => dpVals[i] - v);
  const absNoises = noises.map(Math.abs);
  const mae       = _mean(absNoises);
  const rmse      = Math.sqrt(_mean(noises.map((n) => n * n)));
  const relErrs   = origVals.map((v, i) => Math.abs(v) > 1e-9 ? absNoises[i] / Math.abs(v) : 0);
  const meanRelError = _mean(relErrs);
  const origMean  = _mean(origVals);
  const dpMean    = _mean(dpVals);
  const origStd   = _std(origVals, origMean);
  const dpStd     = _std(dpVals, dpMean);
  const snr       = noiseScale > 0 ? Math.abs(origMean) / noiseScale : Infinity;
  const meanShiftPct = Math.abs(origMean) > 1e-9 ? Math.abs(dpMean - origMean) / Math.abs(origMean) * 100 : 0;
  const stdRatio  = origStd > 0 ? dpStd / origStd : 1;
  const sortedAbs = [...absNoises].sort((a, b) => a - b);
  const p95AbsNoise = _quantile(sortedAbs, 0.95);
  return { sensitivity, noiseScale, mae, rmse, meanRelError, snr, meanShiftPct, stdRatio, p95AbsNoise };
}

// ── HTML report builder (DP-specific, standalone — no buildReport from sdc) ───
function dpHtmlRow(label: string, value: unknown, pass?: boolean | null): string {
  const style = pass === true
    ? ' style="color:#16a34a;font-weight:600"'
    : pass === false
    ? ' style="color:#dc2626;font-weight:600"'
    : "";
  return `<tr>
    <td style="padding:5px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc">${label}</td>
    <td style="padding:5px 12px;border:1px solid #e2e8f0"${style}>${String(value)}</td>
  </tr>`;
}

function buildDPReport(args: {
  mechanism: string;
  epsilon: number;
  delta: number;
  N: number;
  colStatMap: Record<string, ColDPStat>;
  catColStats?: Record<string, { shiftRate: number; top1Acc: number; cats: number }>;
  compliancePassed: boolean;
  interpretation: string;
  warnings: string[];
  auditTrail: object;
  sensitivityLabel: string;
  postClamp: boolean;
  seed: number | null;
}): string {
  const {
    mechanism, epsilon, delta, N, colStatMap, catColStats,
    compliancePassed, interpretation, warnings, auditTrail,
    sensitivityLabel, postClamp, seed,
  } = args;

  const date     = new Date().toLocaleString("en-IN");
  const epLabel  = epsilonLabel(epsilon);
  const numCols  = Object.keys(colStatMap);
  const catCols  = Object.keys(catColStats ?? {});
  const allCols  = [...numCols, ...catCols];

  const avgRelErr    = numCols.length > 0 ? _mean(numCols.map((c) => colStatMap[c].meanRelError)) : 0;
  const avgMeanShift = numCols.length > 0 ? _mean(numCols.map((c) => colStatMap[c].meanShiftPct)) : 0;
  const badgeColor   = compliancePassed ? "#16a34a" : "#dc2626";

  const numColRows = numCols.map((c) => {
    const s = colStatMap[c];
    const fmt = (v: number, dp = 4) => v.toLocaleString("en-IN", { maximumFractionDigits: dp });
    return `<tr>
      <td style="padding:4px 8px;border:1px solid #e2e8f0">${c}</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0">Numeric</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0">${fmt(s.sensitivity)}</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0">${fmt(s.noiseScale)}</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0">${fmt(s.mae)}</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0">${fmt(s.rmse)}</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0">${(s.meanRelError * 100).toFixed(2)}%</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0">${isFinite(s.snr) ? s.snr.toFixed(3) : "∞"}</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0">${s.meanShiftPct.toFixed(2)}%</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0">${s.stdRatio.toFixed(3)}</td>
    </tr>`;
  }).join("");

  const catColRows = catCols.map((c) => {
    const s = (catColStats ?? {})[c];
    return `<tr>
      <td style="padding:4px 8px;border:1px solid #e2e8f0">${c}</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0">Categorical</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0">—</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0">—</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0">—</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0">—</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0">${(s.shiftRate * 100).toFixed(1)}% changed</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0">${(s.top1Acc * 100).toFixed(1)}% unchanged</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0">—</td>
      <td style="padding:4px 8px;border:1px solid #e2e8f0">—</td>
    </tr>`;
  }).join("");

  const warningHtml = warnings.length > 0
    ? `<ul style="margin:0;padding-left:20px">${warnings.map((w) => `<li style="margin-bottom:4px">${w}</li>`).join("")}</ul>`
    : `<p style="color:#16a34a">No warnings — all checks passed.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>SafeData DP Report — ${mechanism}</title>
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:0;color:#1e293b;background:#f8fafc;font-size:13px}
  .hdr{background:linear-gradient(135deg,#1e3a8a,#1d4ed8);color:#fff;padding:28px 40px}
  .hdr h1{margin:0 0 6px;font-size:20px;font-weight:700}
  .hdr p{margin:0 0 2px;font-size:12px;opacity:.85}
  .badge{display:inline-block;padding:4px 14px;border-radius:99px;font-weight:700;font-size:12px;color:#fff;background:${badgeColor}}
  .section{padding:16px 40px;border-bottom:1px solid #e2e8f0}
  .section h2{font-size:14px;color:#1e40af;margin:0 0 10px;border-left:4px solid #1d4ed8;padding-left:8px;font-weight:700}
  table{border-collapse:collapse;width:100%;font-size:12px;margin-top:6px}
  th{background:#1e40af;color:#fff;padding:6px 8px;text-align:left;border:1px solid #1d4ed8;font-size:11px}
  .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:8px}
  .mc{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.06)}
  .mc .val{font-size:20px;font-weight:700;color:#1d4ed8}
  .mc .lbl{font-size:10px;color:#64748b;margin-top:2px}
  pre{background:#0f172a;color:#e2e8f0;padding:14px;border-radius:8px;font-size:10px;overflow-x:auto;white-space:pre-wrap}
  footer{padding:14px 40px;text-align:center;font-size:11px;color:#94a3b8}
</style>
</head>
<body>
<div class="hdr">
  <h1>🔒 SafeData Privacy Report — Differential Privacy Analysis</h1>
  <p>Mechanism: <strong>${mechanism}</strong> &nbsp;|&nbsp; Date: ${date}</p>
  <p>Generated by: SafeData v1.0 &nbsp;|&nbsp; MoSPI – STATATHON 2025</p>
</div>

<div class="section">
  <h2>Section 1 — Executive Summary</h2>
  <div class="grid4">
    <div class="mc"><div class="val">ε = ${epsilon}</div><div class="lbl">Privacy Budget</div></div>
    <div class="mc"><div class="val">${allCols.length}</div><div class="lbl">Columns Perturbed</div></div>
    <div class="mc"><div class="val">${(avgRelErr * 100).toFixed(1)}%</div><div class="lbl">Avg Relative Error</div></div>
    <div class="mc"><div class="val">${N}</div><div class="lbl">Records Protected</div></div>
  </div>
  <p style="margin-top:12px">${interpretation}</p>
  <p><span class="badge">${compliancePassed ? "COMPLIANCE PASS" : "COMPLIANCE FAIL"}</span> &nbsp;
     <strong>${epLabel}</strong> &nbsp;|&nbsp; Privacy guarantee: ${delta === 0 ? `ε-DP (ε = ${epsilon})` : `(ε,δ)-DP (ε = ${epsilon}, δ = ${delta})`}</p>
</div>

<div class="section">
  <h2>Section 2 — Configuration</h2>
  <table>
    ${dpHtmlRow("Mechanism", mechanism)}
    ${dpHtmlRow("Epsilon (ε)", `${epsilon} — ${epLabel}`, epsilon <= 5)}
    ${dpHtmlRow("Delta (δ)", delta === 0 ? "0 (pure ε-DP)" : delta)}
    ${dpHtmlRow("Sensitivity Method", sensitivityLabel)}
    ${dpHtmlRow("Post-clamp to bounds", postClamp ? "Enabled" : "Disabled")}
    ${dpHtmlRow("Random Seed", seed != null ? String(seed) : "Unseeded (non-reproducible)")}
    ${dpHtmlRow("Records Processed", N)}
    ${dpHtmlRow("Columns (numeric)", numCols.length)}
    ${dpHtmlRow("Columns (categorical)", catCols.length)}
  </table>
</div>

<div class="section">
  <h2>Section 3 — Per-Column Privacy &amp; Utility Metrics</h2>
  ${allCols.length === 0
    ? `<p style="color:#dc2626">No columns were perturbed by this mechanism.</p>`
    : `<table>
    <thead><tr>
      <th>Column</th><th>Type</th><th>Sensitivity (Δf)</th><th>Noise Scale</th>
      <th>MAE</th><th>RMSE</th><th>Rel. Error</th><th>SNR</th><th>Mean Shift %</th><th>Std Ratio</th>
    </tr></thead>
    <tbody>${numColRows}${catColRows}</tbody>
  </table>`}
</div>

<div class="section">
  <h2>Section 4 — Aggregate Utility Summary</h2>
  <table>
    ${dpHtmlRow("Avg Mean Absolute Error", numCols.length > 0 ? _mean(numCols.map((c) => colStatMap[c].mae)).toLocaleString("en-IN", { maximumFractionDigits: 4 }) : "N/A")}
    ${dpHtmlRow("Avg Relative Error", `${(avgRelErr * 100).toFixed(2)}%`, avgRelErr < 0.15)}
    ${dpHtmlRow("Avg Mean Shift", `${avgMeanShift.toFixed(2)}%`, avgMeanShift < 5)}
    ${dpHtmlRow("Columns Perturbed", allCols.length, allCols.length > 0)}
    ${dpHtmlRow("Overall Compliance", compliancePassed ? "PASS" : "FAIL", compliancePassed)}
  </table>
</div>

<div class="section">
  <h2>Section 5 — Recommendations &amp; Warnings</h2>
  ${warningHtml}
</div>

<div class="section">
  <h2>Section 6 — Audit Trail</h2>
  <pre>${JSON.stringify(auditTrail, null, 2)}</pre>
</div>

<footer>
  SafeData Pipeline &nbsp;|&nbsp; Government of India — Ministry of Statistics and Programme Implementation &nbsp;|&nbsp; STATATHON 2025
</footer>
</body></html>`;
}

// ── Shared result builder ─────────────────────────────────────────────────────
function colStatMapToRecord(
  colStatMap: Record<string, ColDPStat>,
): Record<string, Record<string, string | number>> {
  const out: Record<string, Record<string, string | number>> = {};
  for (const [col, s] of Object.entries(colStatMap)) {
    out[col] = {
      "Δf (Sensitivity)": s.sensitivity.toLocaleString("en-IN", { maximumFractionDigits: 4 }),
      "Noise Scale": s.noiseScale.toLocaleString("en-IN", { maximumFractionDigits: 4 }),
      "MAE": s.mae.toFixed(4),
      "RMSE": s.rmse.toFixed(4),
      "Mean Rel. Error": `${(s.meanRelError * 100).toFixed(2)}%`,
      "SNR": isFinite(s.snr) ? s.snr.toFixed(3) : "∞",
      "Mean Shift": `${s.meanShiftPct.toFixed(2)}%`,
      "Std Ratio (σ_dp/σ)": s.stdRatio.toFixed(3),
      "95th pct |noise|": s.p95AbsNoise.toFixed(4),
    };
  }
  return out;
}

// ─── Laplace Mechanism ────────────────────────────────────────────────────────
export function applyLaplace(
  data: DataRow[],
  epsilon: number,
  targetCols: string[],
  options: DPOptions = {},
): PrivacyResult {
  const t0 = performance.now();
  const { sensitivityMode = "auto", postClamp = true, seed = null } = options;
  const rng = makePRNG(seed);
  const N = data.length;

  const numericCols = targetCols.filter((c) => isNumericCol(data, c));
  const processed: DataRow[] = data.map((r) => ({ ...r }));
  const colStatMap: Record<string, ColDPStat> = {};
  const clipBounds: Record<string, [number, number]> = {};

  const adaptiveUpgraded: string[] = [];

  for (const col of numericCols) {
    const vals = data.map((r) => Number(r[col])).filter((v) => !isNaN(v));
    const [lo, hi, wasUpgraded] = computeAdaptiveClip(vals, sensitivityMode);
    if (wasUpgraded) adaptiveUpgraded.push(col);
    const sensitivity = Math.max(hi - lo, 1e-9);
    const scale = sensitivity / epsilon;
    clipBounds[col] = [lo, hi];

    const origVals: number[] = [];
    const dpVals: number[] = [];

    data.forEach((row, i) => {
      const v = Number(row[col]);
      if (isNaN(v)) return;
      const clipped = Math.min(Math.max(v, lo), hi);
      const u = rng() - 0.5;
      const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
      let dp = clipped + noise;
      if (postClamp) dp = Math.min(Math.max(dp, lo), hi);
      processed[i][col] = parseFloat(dp.toFixed(4));
      origVals.push(v);
      dpVals.push(dp);
    });

    colStatMap[col] = computeColDPStat(origVals, dpVals, scale, sensitivity);
  }

  const epLabel = epsilonLabel(epsilon);
  const compliancePassed = epsilon <= 5 && numericCols.length > 0;
  const avgRelErr = numericCols.length > 0
    ? _mean(numericCols.map((c) => colStatMap[c].meanRelError)) : 0;
  const infoLoss = numericCols.length > 0
    ? Math.min(1, _mean(numericCols.map((c) => colStatMap[c].meanRelError))) : 0;
  const skipped = targetCols.length - numericCols.length;
  const sensitivityLabel = sensitivityMode === "iqr"
    ? "IQR-based (1.5×IQR outlier-robust)"
    : sensitivityMode === "percentile"
    ? "Percentile (1st–99th)"
    : adaptiveUpgraded.length > 0
    ? `Auto (Min–Max) + IQR upgrade for: ${adaptiveUpgraded.join(", ")}`
    : "Auto (Min–Max range)";

  const interpretation =
    `Laplace Mechanism applied to ${numericCols.length} numeric column${numericCols.length !== 1 ? "s" : ""} ` +
    `(N = ${N}) with ε = ${epsilon} (${epLabel}). ` +
    `Sensitivity Δf = column range computed via ${sensitivityLabel}. ` +
    `Noise drawn i.i.d. from Lap(0, Δf/ε) per value. ` +
    `Average relative error = ${(avgRelErr * 100).toFixed(2)}%. ` +
    (postClamp ? "Outputs clamped back to clipping bounds. " : "") +
    `Privacy guarantee: ε-DP with ε = ${epsilon}. ` +
    (skipped > 0 ? `${skipped} non-numeric column(s) untouched — apply Exponential Mechanism for categorical columns. ` : "");

  const warnings: string[] = [
    ...(epsilon > 5 ? [`ε = ${epsilon} provides only WEAK privacy. Reduce to ε ≤ 1.0 for strong protection.`] : []),
    ...(epsilon > 2 && epsilon <= 5 ? [`Moderate ε = ${epsilon}. Consider ε ≤ 1.0 for sensitive census microdata.`] : []),
    ...(numericCols.length === 0 ? ["No numeric columns found — Laplace cannot be applied. Use Exponential Mechanism for categorical columns."] : []),
    ...(skipped > 0 ? [`${skipped} categorical column(s) skipped — Laplace applies to numeric only.`] : []),
    ...(numericCols.some((c) => colStatMap[c].meanShiftPct > 5) ? ["One or more columns show > 5% mean shift — consider narrower clipping (IQR) or lower ε."] : []),
    ...(sensitivityMode === "auto" && numericCols.some((c) => colStatMap[c].sensitivity > 100000) ? ["High sensitivity detected (column range > 100,000). Consider IQR-based or Percentile clipping."] : []),
  ];

  const auditTrail = {
    run_id: `laplace_${Date.now()}`,
    mechanism: "Laplace",
    epsilon, delta: 0,
    sensitivity_mode: sensitivityMode,
    post_clamp: postClamp,
    seed: seed ?? "unseeded",
    columns_perturbed: numericCols,
    sensitivity: Object.fromEntries(numericCols.map((c) => [c, parseFloat(colStatMap[c].sensitivity.toFixed(4))])),
    noise_scale: Object.fromEntries(numericCols.map((c) => [c, parseFloat(colStatMap[c].noiseScale.toFixed(4))])),
    records_processed: N,
    execution_time_ms: Math.round(performance.now() - t0),
    privacy_guarantee: `ε-DP (ε = ${epsilon})`,
    timestamp: new Date().toISOString(),
  };

  const report = buildDPReport({
    mechanism: "Laplace Mechanism", epsilon, delta: 0, N,
    colStatMap, compliancePassed, interpretation, warnings,
    auditTrail, sensitivityLabel, postClamp, seed,
  });

  return {
    technique: "Laplace Mechanism", family: "Differential Privacy",
    processedData: processed, originalCount: N, processedCount: N,
    recordsSuppressed: 0, informationLoss: infoLoss,
    executionMs: Math.round(performance.now() - t0),
    stats: {
      epsilon,
      privacyGuarantee: `ε-DP (ε = ${epsilon}) — ${epLabel}`,
      mechanism: "Laplace",
      columnsPerturbed: numericCols.length,
      sensitivityMode: sensitivityLabel,
      postClamp: postClamp ? "Enabled" : "Disabled",
      seed: seed ?? "unseeded",
      avgMAE: numericCols.length > 0 ? _mean(numericCols.map((c) => colStatMap[c].mae)).toFixed(4) : "N/A",
      avgRelativeError: `${(avgRelErr * 100).toFixed(2)}%`,
    },
    colStats: colStatMapToRecord(colStatMap),
    warnings, interpretation, compliancePassed, report,
  };
}

// ─── Gaussian Mechanism ───────────────────────────────────────────────────────
export function applyGaussian(
  data: DataRow[],
  epsilon: number,
  delta: number,
  targetCols: string[],
  options: DPOptions = {},
): PrivacyResult {
  const t0 = performance.now();
  const { sensitivityMode = "auto", postClamp = true, seed = null } = options;
  const rng = makePRNG(seed);
  const N = data.length;

  const numericCols = targetCols.filter((c) => isNumericCol(data, c));
  const processed: DataRow[] = data.map((r) => ({ ...r }));
  const colStatMap: Record<string, ColDPStat> = {};

  const adaptiveUpgradedG: string[] = [];

  for (const col of numericCols) {
    const vals = data.map((r) => Number(r[col])).filter((v) => !isNaN(v));
    const [lo, hi, wasUpgraded] = computeAdaptiveClip(vals, sensitivityMode);
    if (wasUpgraded) adaptiveUpgradedG.push(col);
    const sensitivity = Math.max(hi - lo, 1e-9);
    // σ ≥ Δ₂f · √(2 ln(1.25/δ)) / ε
    const sigma = (sensitivity * Math.sqrt(2 * Math.log(1.25 / delta))) / epsilon;

    const origVals: number[] = [];
    const dpVals: number[] = [];

    data.forEach((row, i) => {
      const v = Number(row[col]);
      if (isNaN(v)) return;
      const clipped = Math.min(Math.max(v, lo), hi);
      // Box-Muller transform using seeded PRNG
      const u1 = Math.max(rng(), 1e-12);
      const u2 = rng();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      let dp = clipped + sigma * z;
      if (postClamp) dp = Math.min(Math.max(dp, lo), hi);
      processed[i][col] = parseFloat(dp.toFixed(4));
      origVals.push(v);
      dpVals.push(dp);
    });

    colStatMap[col] = computeColDPStat(origVals, dpVals, sigma, sensitivity);
  }

  const epLabel = epsilonLabel(epsilon);
  const compliancePassed = epsilon <= 5 && delta > 0 && delta <= 1e-3 && numericCols.length > 0;
  const avgRelErr = numericCols.length > 0
    ? _mean(numericCols.map((c) => colStatMap[c].meanRelError)) : 0;
  const infoLoss = numericCols.length > 0
    ? Math.min(1, _mean(numericCols.map((c) => colStatMap[c].meanRelError))) : 0;
  const skipped = targetCols.length - numericCols.length;
  const sensitivityLabel = sensitivityMode === "iqr"
    ? "IQR-based (1.5×IQR outlier-robust)"
    : sensitivityMode === "percentile"
    ? "Percentile (1st–99th)"
    : adaptiveUpgradedG.length > 0
    ? `Auto (Min–Max) + IQR upgrade for: ${adaptiveUpgradedG.join(", ")}`
    : "Auto (Min–Max range)";
  const sigmaFormula = `Δf · √(2 ln(1.25/${delta})) / ε`;
  const exampleSigma = numericCols.length > 0
    ? parseFloat(colStatMap[numericCols[0]].noiseScale.toFixed(4)) : 0;

  const interpretation =
    `Gaussian Mechanism applied to ${numericCols.length} numeric column${numericCols.length !== 1 ? "s" : ""} ` +
    `(N = ${N}) with ε = ${epsilon}, δ = ${delta} (${epLabel}). ` +
    `Noise N(0, σ²) where σ = ${sigmaFormula}. ` +
    (numericCols.length > 0 ? `Example: σ(${numericCols[0]}) = ${exampleSigma}. ` : "") +
    `Average relative error = ${(avgRelErr * 100).toFixed(2)}%. ` +
    (postClamp ? "Outputs clamped to clipping bounds. " : "") +
    `Privacy guarantee: (ε, δ)-DP. ` +
    (skipped > 0 ? `${skipped} categorical column(s) untouched — use Exponential Mechanism for those. ` : "");

  const warnings: string[] = [
    ...(delta === 0 ? ["δ = 0 is invalid for Gaussian Mechanism — it requires δ > 0. Use Laplace for pure ε-DP."] : []),
    ...(delta > 1e-3 ? [`δ = ${delta} is large. Use δ ≤ 1/N² = ${(1 / (N * N)).toExponential(2)} for a meaningful guarantee.`] : []),
    ...(epsilon > 5 ? [`ε = ${epsilon} provides WEAK privacy.`] : []),
    ...(numericCols.length === 0 ? ["No numeric columns found — Gaussian requires numeric columns."] : []),
    ...(skipped > 0 ? [`${skipped} categorical column(s) skipped.`] : []),
    ...(numericCols.some((c) => colStatMap[c].meanShiftPct > 5) ? ["Mean shift > 5% in one or more columns."] : []),
  ];

  const auditTrail = {
    run_id: `gaussian_${Date.now()}`,
    mechanism: "Gaussian",
    epsilon, delta,
    sigma_formula: sigmaFormula,
    sensitivity_mode: sensitivityMode,
    post_clamp: postClamp,
    seed: seed ?? "unseeded",
    columns_perturbed: numericCols,
    sigma_per_col: Object.fromEntries(numericCols.map((c) => [c, parseFloat(colStatMap[c].noiseScale.toFixed(4))])),
    records_processed: N,
    execution_time_ms: Math.round(performance.now() - t0),
    privacy_guarantee: `(ε,δ)-DP (ε = ${epsilon}, δ = ${delta})`,
    timestamp: new Date().toISOString(),
  };

  const report = buildDPReport({
    mechanism: "Gaussian Mechanism", epsilon, delta, N,
    colStatMap, compliancePassed, interpretation, warnings,
    auditTrail, sensitivityLabel, postClamp, seed,
  });

  return {
    technique: "Gaussian Mechanism", family: "Differential Privacy",
    processedData: processed, originalCount: N, processedCount: N,
    recordsSuppressed: 0, informationLoss: infoLoss,
    executionMs: Math.round(performance.now() - t0),
    stats: {
      epsilon, delta,
      privacyGuarantee: `(ε,δ)-DP (ε = ${epsilon}, δ = ${delta}) — ${epLabel}`,
      mechanism: "Gaussian",
      columnsPerturbed: numericCols.length,
      sigmaExample: numericCols.length > 0 ? `${exampleSigma} (${numericCols[0]})` : "N/A",
      sensitivityMode: sensitivityLabel,
      postClamp: postClamp ? "Enabled" : "Disabled",
      seed: seed ?? "unseeded",
      avgRelativeError: `${(avgRelErr * 100).toFixed(2)}%`,
    },
    colStats: colStatMapToRecord(colStatMap),
    warnings, interpretation, compliancePassed, report,
  };
}

// ─── Exponential Mechanism ────────────────────────────────────────────────────
export function applyExponential(
  data: DataRow[],
  epsilon: number,
  targetCols: string[],
  options: DPOptions = {},
): PrivacyResult {
  const t0 = performance.now();
  const { seed = null } = options;
  const rng = makePRNG(seed);
  const N = data.length;

  const catCols = targetCols.filter((c) => !isNumericCol(data, c));
  const processed: DataRow[] = data.map((r) => ({ ...r }));

  const catColStats: Record<string, { shiftRate: number; top1Acc: number; cats: number }> = {};

  for (const col of catCols) {
    const freq = new Map<string, number>();
    data.forEach((r) => {
      const v = String(r[col] ?? "");
      freq.set(v, (freq.get(v) ?? 0) + 1);
    });
    const vals = Array.from(freq.keys());
    const deltaU = 1 / N;
    let changed = 0;

    data.forEach((row, i) => {
      const scores = vals.map((v) =>
        Math.exp((epsilon * ((freq.get(v) ?? 0) / N)) / (2 * deltaU)),
      );
      const total = scores.reduce((s, v) => s + v, 0);
      const probs = scores.map((s) => s / total);
      let rndVal = rng();
      let chosen = vals[vals.length - 1];
      for (let j = 0; j < vals.length; j++) {
        rndVal -= probs[j];
        if (rndVal <= 0) { chosen = vals[j]; break; }
      }
      if (chosen !== String(row[col] ?? "")) changed++;
      processed[i][col] = chosen;
    });

    catColStats[col] = {
      shiftRate: N > 0 ? changed / N : 0,
      top1Acc: N > 0 ? (N - changed) / N : 1,
      cats: vals.length,
    };
  }

  const epLabel = epsilonLabel(epsilon);
  const compliancePassed = epsilon <= 5 && catCols.length > 0;
  const avgShift = catCols.length > 0
    ? _mean(catCols.map((c) => catColStats[c].shiftRate)) : 0;
  const avgTop1 = catCols.length > 0
    ? _mean(catCols.map((c) => catColStats[c].top1Acc)) : 1;
  const skipped = targetCols.length - catCols.length;

  const interpretation =
    `Exponential Mechanism applied to ${catCols.length} categorical column${catCols.length !== 1 ? "s" : ""} ` +
    `(N = ${N}) with ε = ${epsilon} (${epLabel}). ` +
    `For each record, a new category is sampled with Pr[output = r] ∝ exp(ε·freq(r) / 2Δu) where Δu = 1/N. ` +
    `Average category shift rate = ${(avgShift * 100).toFixed(1)}% (values changed). ` +
    `Average top-1 accuracy (unchanged values) = ${(avgTop1 * 100).toFixed(1)}%. ` +
    `Privacy guarantee: ε-DP (ε = ${epsilon}). ` +
    (skipped > 0 ? `${skipped} numeric column(s) untouched — use Laplace or Gaussian for numeric columns. ` : "");

  const warnings: string[] = [
    ...(catCols.length === 0 ? ["No categorical columns found — Exponential Mechanism applies to categorical data. Use Laplace for numeric columns."] : []),
    ...(skipped > 0 ? [`${skipped} numeric column(s) skipped — Exponential applies to categorical only.`] : []),
    ...(epsilon > 5 ? [`ε = ${epsilon} provides WEAK privacy.`] : []),
    ...(catCols.some((c) => catColStats[c].cats < 3) ? ["One or more columns have fewer than 3 categories — Exponential Mechanism provides little protection with very few categories."] : []),
  ];

  const catColStatsCombined: Record<string, Record<string, string | number>> = {};
  for (const [col, s] of Object.entries(catColStats)) {
    catColStatsCombined[col] = {
      "Categories": s.cats,
      "Shift Rate": `${(s.shiftRate * 100).toFixed(1)}%`,
      "Top-1 Accuracy": `${(s.top1Acc * 100).toFixed(1)}%`,
      "Pr[unchanged]": avgTop1.toFixed(3),
    };
  }

  const auditTrail = {
    run_id: `exponential_${Date.now()}`,
    mechanism: "Exponential",
    epsilon, delta: 0,
    seed: seed ?? "unseeded",
    columns_perturbed: catCols,
    category_counts: Object.fromEntries(catCols.map((c) => [c, catColStats[c].cats])),
    shift_rates: Object.fromEntries(catCols.map((c) => [c, parseFloat((catColStats[c].shiftRate * 100).toFixed(2)) + "%"])),
    records_processed: N,
    execution_time_ms: Math.round(performance.now() - t0),
    privacy_guarantee: `ε-DP via Exponential Mechanism (ε = ${epsilon})`,
    timestamp: new Date().toISOString(),
  };

  // Exponential has no numeric colStatMap — pass empty, use catColStats override
  const report = buildDPReport({
    mechanism: "Exponential Mechanism", epsilon, delta: 0, N,
    colStatMap: {},
    catColStats,
    compliancePassed, interpretation, warnings,
    auditTrail, sensitivityLabel: "Frequency-based (utility = col freq / N)", postClamp: false, seed,
  });

  const infoLoss = catCols.length > 0 ? avgShift : 0;

  return {
    technique: "Exponential Mechanism", family: "Differential Privacy",
    processedData: processed, originalCount: N, processedCount: N,
    recordsSuppressed: 0, informationLoss: infoLoss,
    executionMs: Math.round(performance.now() - t0),
    stats: {
      epsilon,
      privacyGuarantee: `ε-DP via Exponential Mechanism (ε = ${epsilon}) — ${epLabel}`,
      mechanism: "Exponential",
      categoricalColumnsPerturbed: catCols.length,
      avgShiftRate: `${(avgShift * 100).toFixed(1)}%`,
      avgTop1Accuracy: `${(avgTop1 * 100).toFixed(1)}%`,
      seed: seed ?? "unseeded",
    },
    colStats: catColStatsCombined,
    warnings, interpretation, compliancePassed, report,
  };
}

// ─── Mixed Mechanism — Laplace/Gaussian (numeric) + Exponential (categorical) ─
// Provides full-dataset DP coverage in a single pass.
export function applyMixed(
  data: DataRow[],
  epsilon: number,
  delta: number,
  mechanism: "laplace" | "gaussian",
  targetCols: string[],
  options: DPOptions = {},
): PrivacyResult {
  const t0 = performance.now();

  // Run numeric mechanism first (perturbs only numerics, passes through categoricals unchanged)
  const numRes = mechanism === "laplace"
    ? applyLaplace(data, epsilon, targetCols, options)
    : applyGaussian(data, epsilon, delta, targetCols, options);

  // Run Exponential on the original data for categorical columns
  const catRes = applyExponential(data, epsilon, targetCols, options);

  const N = data.length;
  const catCols  = targetCols.filter((c) => !isNumericCol(data, c));
  const numCols  = targetCols.filter((c) =>  isNumericCol(data, c));

  // Merge: start with numRes output (numerics perturbed), overlay cat perturbations
  const mergedData: DataRow[] = numRes.processedData.map((row, i) => {
    const merged: DataRow = { ...row };
    for (const col of catCols) {
      merged[col] = catRes.processedData[i][col];
    }
    return merged;
  });

  const mechLabel  = mechanism === "laplace" ? "Laplace" : "Gaussian";
  const numLoss    = numRes.informationLoss;
  const catLoss    = catRes.informationLoss;
  const combinedLoss = (numCols.length > 0 && catCols.length > 0)
    ? (numLoss * numCols.length + catLoss * catCols.length) / (numCols.length + catCols.length)
    : numLoss + catLoss;

  const mergedColStats = { ...(numRes.colStats ?? {}), ...(catRes.colStats ?? {}) };

  const warnings = [
    ...numRes.warnings.filter((w) => !w.includes("categorical")),
    ...catRes.warnings.filter((w) => !w.includes("numeric")),
  ];

  const epLabel = epsilonLabel(epsilon);
  const compliancePassed = epsilon <= 5 && (numCols.length > 0 || catCols.length > 0);

  const interpretation =
    `Mixed DP: ${mechLabel} Mechanism on ${numCols.length} numeric column${numCols.length !== 1 ? "s" : ""} ` +
    `+ Exponential Mechanism on ${catCols.length} categorical column${catCols.length !== 1 ? "s" : ""} ` +
    `(N = ${N}, ε = ${epsilon}, ${epLabel}). ` +
    `Full-dataset coverage — no columns left unprotected. ` +
    `Numeric avg rel. error = ${(numLoss * 100).toFixed(1)}%. ` +
    `Categorical avg shift rate = ${(catLoss * 100).toFixed(1)}%. ` +
    (mechanism === "gaussian" ? `Privacy guarantee: (ε,δ)-DP (δ = ${delta}). ` : "Privacy guarantee: ε-DP. ");

  return {
    technique: `${mechLabel} + Exponential (Mixed DP)`,
    family: "Differential Privacy",
    processedData: mergedData,
    originalCount: N,
    processedCount: N,
    recordsSuppressed: 0,
    informationLoss: Math.min(1, combinedLoss),
    executionMs: Math.round(performance.now() - t0),
    stats: {
      epsilon,
      ...(mechanism === "gaussian" ? { delta } : {}),
      privacyGuarantee: mechanism === "laplace"
        ? `ε-DP (ε = ${epsilon}) — ${epLabel}`
        : `(ε,δ)-DP (ε = ${epsilon}, δ = ${delta}) — ${epLabel}`,
      mechanism: `${mechLabel} (numeric) + Exponential (categorical)`,
      numericColumnsProtected: numCols.length,
      categoricalColumnsProtected: catCols.length,
      totalColumnsProtected: numCols.length + catCols.length,
      numericAvgRelError: numRes.stats.avgRelativeError ?? "N/A",
      categoricalAvgShiftRate: (catRes.stats as Record<string, unknown>).avgShiftRate ?? "N/A",
    },
    colStats: mergedColStats,
    warnings,
    interpretation,
    compliancePassed,
    report: numRes.report,
  };
}

export { epsilonLabel, epsilonBadgeClass };

/**
 * SafeData Pipeline — Comparison Module
 * NIST Composite Risk Score (NIST_CRS) — Full Spec Implementation
 * §1–§6 of the Comparison Module specification
 */

// ─── §2.2 Configurable weight constants ──────────────────────────────────────
// NSO staff can adjust these to reflect their data release policy context.

export const ATTACK_WEIGHTS: Record<string, number> = {
  prosecutor:          1.5,
  journalist:          0.8,
  marketer:            1.5,
  singlingOut:         1.2,
  inference:           1.2,
  membership:          0.8,
  recordLinkage:       1.0,
  attributeDisclosure: 1.2,
  differencing:        1.0,
  modelInversion:      1.5,
};

// ─── §1 Safe thresholds (raw 0-100 scale) ────────────────────────────────────

export const SAFE_THRESHOLDS: Record<string, number> = {
  prosecutor:          5,
  journalist:          5,
  marketer:            5,
  singlingOut:         5,
  inference:           40,
  membership:          5,
  recordLinkage:       5,
  attributeDisclosure: 20,
  differencing:        20,
  modelInversion:      30,
};

// §2.3 uniform upper anchor
export const CRITICAL_THRESHOLD = 80;

// ─── §4.5 per-attack risk level thresholds (uses raw scores) ─────────────────

const PER_ATTACK_LEVELS: Record<string, { medium: number; high: number; critical: number }> = {
  prosecutor:          { medium: 5,  high: 20, critical: 50 },
  journalist:          { medium: 5,  high: 20, critical: 50 },
  marketer:            { medium: 5,  high: 20, critical: 50 },
  singlingOut:         { medium: 5,  high: 20, critical: 50 },
  inference:           { medium: 40, high: 60, critical: 80 },
  membership:          { medium: 5,  high: 20, critical: 50 },
  recordLinkage:       { medium: 5,  high: 20, critical: 50 },
  attributeDisclosure: { medium: 20, high: 50, critical: 80 },
  differencing:        { medium: 20, high: 50, critical: 80 },
  modelInversion:      { medium: 30, high: 60, critical: 80 },
};

const DISPLAY_NAMES: Record<string, string> = {
  prosecutor:          "Prosecutor",
  journalist:          "Journalist",
  marketer:            "Marketer",
  singlingOut:         "Singling Out",
  inference:           "Inference",
  membership:          "Membership",
  recordLinkage:       "Rec. Linkage",
  attributeDisclosure: "Attr. Disclose",
  differencing:        "Differencing",
  modelInversion:      "Model Inversion",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ComparisonEntry {
  key: string;
  attackName: string;
  rawScore: number;          // 0-100 per §1
  normScore: number;         // 0-100 normalised per §2.3
  pass: boolean;             // rawScore < safeThreshold
  weight: number;            // §2.2 weight
  contribution: number;      // weight * normScore / totalWeight
  riskLevel: RiskLevel;      // per-attack classification §4.5
  primaryThreat: string;     // §4.5.1
  keyMetric: string;         // §4.5.1
}

export interface PriorityAction {
  priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW";
  emoji: string;
  action: string;
  detail: string;
  mechanism: string;
  attacksAddressed: string[];
}

export interface RadarAxisValue {
  axis: string;
  value: number;
  notRun: boolean;
}

// Slim interface for the fields compositeScore needs from each attack result
export interface RawAttackResults {
  prosecutor?: {
    riskScore: number;
    uniqueRecordsCount?: number;
    N?: number;
  };
  journalist?: {
    riskScore: number;
    populationUniqueCount?: number;
  };
  marketer?: {
    riskScore: number;
    lDiversityPassRate?: number;
    N?: number;
  };
  singlingOut?: {
    riskScore: number;
    singulableCount?: number;
    predicateSoRate?: number;
  };
  inference?: {
    riskScore: number;
    infoGain?: number;
  };
  membership?: {
    riskScore: number;
    pctHighRisk?: number;
    highRiskCount?: number;
    aucScore?: number;
  };
  recordLinkage?: {
    riskScore: number;
    numUniqueRecords?: number;
    amplificationFactor?: number;
    eclr?: number;
  };
  attributeDisclosure?: {
    riskScore: number;
    overallAdr?: number;
    perSAResults?: Array<{ sa: string; guaranteedRecords: number; adr: number }>;
  };
  differencing?: {
    riskScore: number;
    ddr?: number;
    exactCount?: number;
    coverageRate?: number;
  };
  modelInversion?: {
    riskScore: number;
    datasetMIRisk?: number;
    inversionRate?: number;
  };
}

export interface ComparisonResult {
  nistCRS: number;
  riskLevel: RiskLevel;
  passCount: number;
  failCount: number;
  totalRun: number;
  worstAttack: string;
  worstNormScore: number;
  breakdown: ComparisonEntry[];
  radarValues: RadarAxisValue[];
  priorityActions: PriorityAction[];
  // backward-compat fields used by header badge
  score: number;
  enabledCount: number;
}

// ─── §2.3 Threshold-relative normalisation ────────────────────────────────────

function normalise(rawScore: number, key: string): number {
  const safe = SAFE_THRESHOLDS[key] ?? 5;
  const crit = CRITICAL_THRESHOLD;
  const n = ((rawScore - safe) / (crit - safe)) * 100;
  return Math.max(0, Math.min(100, n));
}

// ─── §4.5 Per-attack risk level ───────────────────────────────────────────────

function perAttackLevel(rawScore: number, key: string): RiskLevel {
  const t = PER_ATTACK_LEVELS[key] ?? { medium: 5, high: 20, critical: 50 };
  if (rawScore >= t.critical) return "CRITICAL";
  if (rawScore >= t.high)     return "HIGH";
  if (rawScore >= t.medium)   return "MEDIUM";
  return "LOW";
}

// ─── §4.5.1 Primary threat and key metric strings ────────────────────────────

function buildThreatMetric(
  key: string,
  raw: number,
  r: RawAttackResults,
): { primaryThreat: string; keyMetric: string } {
  const fmt = (v: number | undefined, dec = 1, suffix = "") =>
    v != null && isFinite(v) ? `${v.toFixed(dec)}${suffix}` : "—";

  switch (key) {
    case "prosecutor":
      return {
        primaryThreat: "Within-dataset re-ID",
        keyMetric: r.prosecutor?.uniqueRecordsCount != null
          ? `${r.prosecutor.uniqueRecordsCount} unique records`
          : `${fmt(raw, 1)}% risk`,
      };
    case "journalist":
      return {
        primaryThreat: "Pop. re-id risk",
        keyMetric: r.journalist?.populationUniqueCount != null
          ? `${r.journalist.populationUniqueCount} at pop.-level risk`
          : `${fmt(raw, 1)}% risk`,
      };
    case "marketer":
      return {
        primaryThreat: "Group attribute disclosure",
        keyMetric: r.marketer?.lDiversityPassRate != null
          ? `${(r.marketer.lDiversityPassRate * 100).toFixed(0)}% L-div pass`
          : `${fmt(raw, 1)}% risk`,
      };
    case "singlingOut":
      return {
        primaryThreat: "GDPR/DPDP singling-out",
        keyMetric: r.singlingOut?.singulableCount != null
          ? `${r.singlingOut.singulableCount} singlable`
          : `${fmt(raw, 1)}% risk`,
      };
    case "inference":
      return {
        primaryThreat: "ML attribute prediction",
        keyMetric: r.inference?.infoGain != null
          ? `${r.inference.infoGain}% info gain`
          : `${fmt(raw, 1)}% avg confidence`,
      };
    case "membership":
      return {
        primaryThreat: "Presence detection",
        keyMetric: r.membership?.aucScore != null
          ? `AUC ${r.membership.aucScore.toFixed(2)}`
          : `${fmt(raw, 1)}% high-risk`,
      };
    case "recordLinkage":
      return {
        primaryThreat: "External dataset re-ID",
        keyMetric: r.recordLinkage?.numUniqueRecords != null
          ? `${r.recordLinkage.numUniqueRecords} certain links`
          : `${fmt(raw, 1)}% ECLR`,
      };
    case "attributeDisclosure":
      return {
        primaryThreat: "Sensitive value inference",
        keyMetric: r.attributeDisclosure?.overallAdr != null
          ? `ADR ${(r.attributeDisclosure.overallAdr * 100).toFixed(1)}%`
          : `${fmt(raw, 1)}% ADR`,
      };
    case "differencing":
      return {
        primaryThreat: "Aggregate query leakage",
        keyMetric: r.differencing?.ddr != null
          ? `DDR ${(r.differencing.ddr * 100).toFixed(1)}%`
          : `${fmt(raw, 1)}% DDR`,
      };
    case "modelInversion":
      return {
        primaryThreat: "Attribute reconstruction",
        keyMetric: r.modelInversion?.inversionRate != null
          ? `${r.modelInversion.inversionRate.toFixed(1)}% inverted`
          : `MIRisk ${fmt(raw, 1)}%`,
      };
    default:
      return { primaryThreat: "—", keyMetric: "—" };
  }
}

// ─── §4.2 Radar axis values ───────────────────────────────────────────────────

function buildRadarValues(
  normScores: Partial<Record<string, number>>,
): RadarAxisValue[] {
  const get = (k: string) => normScores[k];
  const avg = (...keys: string[]) => {
    const vals = keys.map(get).filter((v): v is number => v != null);
    if (vals.length === 0) return { value: 0, notRun: true };
    return { value: parseFloat((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1)), notRun: false };
  };
  const max2 = (...keys: string[]) => {
    const vals = keys.map(get).filter((v): v is number => v != null);
    if (vals.length === 0) return { value: 0, notRun: true };
    return { value: parseFloat(Math.max(...vals).toFixed(1)), notRun: false };
  };

  const reId        = avg("prosecutor", "journalist");
  const popLinkage  = avg("marketer", "recordLinkage");
  const attrDisc    = max2("attributeDisclosure", "inference");
  const singlingOut = get("singlingOut") != null ? { value: parseFloat((get("singlingOut") as number).toFixed(1)), notRun: false } : { value: 0, notRun: true };
  const membership  = get("membership")  != null ? { value: parseFloat((get("membership")  as number).toFixed(1)), notRun: false } : { value: 0, notRun: true };
  const modelInv    = max2("modelInversion", "differencing");

  return [
    { axis: "Re-Identification",   ...reId },
    { axis: "Population Linkage",  ...popLinkage },
    { axis: "Attribute Disclosure",...attrDisc },
    { axis: "Singling Out",        ...singlingOut },
    { axis: "Membership",          ...membership },
    { axis: "Model Inversion",     ...modelInv },
  ];
}

// ─── §4.8 Priority action builder ────────────────────────────────────────────

function buildPriorityActions(
  rawScores: Partial<Record<string, number>>,
  r: RawAttackResults,
  kVal: number,
  lVal: number,
  tVal: number,
): PriorityAction[] {
  const actions: PriorityAction[] = [];
  const S = (k: string) => rawScores[k] ?? 0;

  if (S("prosecutor") > 20) {
    const singletons = r.prosecutor?.uniqueRecordsCount ?? Math.round((S("prosecutor") / 100) * (r.prosecutor?.N ?? 0));
    actions.push({
      priority: "URGENT", emoji: "🔴",
      action: `Mitigate Prosecutor attack (${S("prosecutor").toFixed(0)}% risk) — highest priority`,
      detail: `Apply record suppression for ${singletons} singleton records, OR generalise quasi-identifier columns to raise Min-K to ${kVal}. This single fix also reduces Journalist, Record Linkage, and Singling Out scores.`,
      mechanism: "k-Anonymity / Record Suppression",
      attacksAddressed: ["Prosecutor", "Journalist", "Rec. Linkage", "Singling Out"],
    });
  }

  if (S("marketer") > 20) {
    const N = r.marketer?.N ?? 0;
    const est = Math.round((S("marketer") / 100) * N);
    actions.push({
      priority: "URGENT", emoji: "🔴",
      action: `Mitigate Marketer attack (${S("marketer").toFixed(0)}% risk) — highest priority`,
      detail: `Estimated ${est > 0 ? est : "multiple"} bulk re-identifications expected. Apply k-anonymisation (target Min-K ≥ ${kVal}) and enforce l-diversity for all sensitive attributes.`,
      mechanism: "k-Anonymity + l-Diversity",
      attacksAddressed: ["Marketer", "Rec. Linkage"],
    });
  }

  if (S("attributeDisclosure") > 20) {
    const worst = r.attributeDisclosure?.perSAResults?.[0];
    const worstSa = worst?.sa ?? "sensitive attribute";
    const guaranteed = worst?.guaranteedRecords ?? 0;
    const adr = r.attributeDisclosure?.overallAdr ?? S("attributeDisclosure") / 100;
    actions.push({
      priority: "URGENT", emoji: "🔴",
      action: `Mitigate Attribute Disclosure attack (${S("attributeDisclosure").toFixed(0)}% risk)`,
      detail: `ADR = ${(adr * 100).toFixed(1)}%. Enforce l-diversity ≥ ${lVal} for "${worstSa}".${guaranteed > 0 ? ` ${guaranteed} records are in fully homogeneous ECs — their ${worstSa} value is directly inferable without re-identification.` : ""}`,
      mechanism: "l-Diversity",
      attacksAddressed: ["Attr. Disclose", "Inference", "Model Inversion"],
    });
  }

  if (S("differencing") > 20) {
    const ddr = r.differencing?.ddr ?? S("differencing") / 100;
    const exact = r.differencing?.exactCount ?? 0;
    actions.push({
      priority: "URGENT", emoji: "🔴",
      action: `Mitigate Differencing attack (${S("differencing").toFixed(0)}% risk) — requires Differential Privacy`,
      detail: `DDR = ${(ddr * 100).toFixed(1)}%.${exact > 0 ? ` ${exact} records are exactly reconstructable via aggregate query pairs.` : ""} k-anonymity and l-diversity do NOT protect against this. Apply Laplace mechanism (ε=1.0) to all published statistics derived from this dataset.`,
      mechanism: "Differential Privacy (Laplace Mechanism)",
      attacksAddressed: ["Differencing"],
    });
  }

  if (S("modelInversion") > 30) {
    const mi = r.modelInversion?.datasetMIRisk ?? S("modelInversion") / 100;
    actions.push({
      priority: "URGENT", emoji: "🔴",
      action: `Mitigate Model Inversion attack (${S("modelInversion").toFixed(0)}% risk)`,
      detail: `MIRisk = ${mi.toFixed(3)}. Sensitive attributes are reconstructable from QI combinations. Increase l-diversity to ${lVal}, apply t-closeness (t ≤ ${tVal.toFixed(2)}), and add calibrated noise to aggregate statistics.`,
      mechanism: "l-Diversity + t-Closeness + Noise",
      attacksAddressed: ["Model Inversion", "Inference", "Attr. Disclose"],
    });
  }

  if (S("singlingOut") > 5) {
    const singled = r.singlingOut?.singulableCount ?? Math.round((S("singlingOut") / 100) * 100);
    actions.push({
      priority: "URGENT", emoji: "🔴",
      action: `Mitigate Singling Out attack (${S("singlingOut").toFixed(0)}% risk)`,
      detail: `${singled} records can be singled out using ≤ 3 QI columns with NO external data required. This violates GDPR Article 4(1) and DPDP Act 2023 data minimisation principles. Generalise or suppress the most discriminating quasi-identifier columns.`,
      mechanism: "k-Anonymity / Column Generalisation",
      attacksAddressed: ["Singling Out", "Prosecutor"],
    });
  }

  if (S("recordLinkage") > 5) {
    const certain = r.recordLinkage?.numUniqueRecords ?? 0;
    const amp = r.recordLinkage?.amplificationFactor ?? "—";
    actions.push({
      priority: "HIGH", emoji: "🟠",
      action: `Mitigate Record Linkage attack (${S("recordLinkage").toFixed(0)}% expected linkage rate)`,
      detail: `ECLR = ${S("recordLinkage").toFixed(1)}%. Amplification Factor = ${amp}×.${certain > 0 ? ` An attacker with an external register can bulk re-identify ${certain} records with certainty.` : ""} Generalise or suppress the highest-cardinality quasi-identifier columns.`,
      mechanism: "k-Anonymity / QI Generalisation",
      attacksAddressed: ["Rec. Linkage", "Marketer"],
    });
  }

  if (S("inference") > 40) {
    actions.push({
      priority: "HIGH", emoji: "🟠",
      action: `Mitigate Inference attack (${S("inference").toFixed(0)}% average SA confidence)`,
      detail: `QIs predict sensitive attributes with ${S("inference").toFixed(0)}% average confidence. This exceeds the safe threshold of 40%. Apply l-diversity transformations in Privacy Enhancement. Note: a dataset can satisfy k-anonymity and still fail Inference.`,
      mechanism: "l-Diversity + QI Generalisation",
      attacksAddressed: ["Inference"],
    });
  }

  if (S("journalist") > 5) {
    const popUnique = r.journalist?.populationUniqueCount ?? 0;
    const prosScore = rawScores["prosecutor"] ?? 0;
    actions.push({
      priority: "MEDIUM", emoji: "🟡",
      action: `Note: Journalist attack (${S("journalist").toFixed(0)}% risk) — population-adjusted re-ID risk`,
      detail: `Journalist Re-ID Risk is ${S("journalist").toFixed(1)}% vs Prosecutor risk of ${prosScore.toFixed(1)}%. Sampling provides some protection, but${popUnique > 0 ? ` ${popUnique} records remain unique even at population level.` : " population-level uniqueness persists."}`,
      mechanism: "k-Anonymity / Sampling Control",
      attacksAddressed: ["Journalist"],
    });
  }

  if (S("membership") > 5) {
    const highRisk = r.membership?.highRiskCount ?? Math.round((S("membership") / 100) * 100);
    actions.push({
      priority: "MEDIUM", emoji: "🟡",
      action: `Mitigate Membership Inference (${S("membership").toFixed(0)}% high-risk records)`,
      detail: `${highRisk} records are outliers — their distinctive profile alone enables presence confirmation. Apply top/bottom-coding and attribute generalisation for the most distinctive records.`,
      mechanism: "Outlier Suppression / Top-Bottom Coding",
      attacksAddressed: ["Membership"],
    });
  }

  const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  return actions;
}

// ─── §2.4 NIST_CRS risk level ─────────────────────────────────────────────────

function classifyNISTCRS(score: number): RiskLevel {
  if (score >= 70) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function computeCompositeScore(
  allResults: RawAttackResults,
  kVal = 5,
  lVal = 3,
  tVal = 0.2,
): ComparisonResult {
  const attackKeys = Object.keys(ATTACK_WEIGHTS) as (keyof RawAttackResults)[];

  // Step 1: Extract raw scores (0-100) for enabled (run) attacks
  const rawScores: Partial<Record<string, number>> = {};
  for (const k of attackKeys) {
    const res = allResults[k];
    if (res == null) continue;
    // All riskScore fields are 0-1 fractions → multiply by 100
    rawScores[k] = Math.max(0, Math.min(100, (res.riskScore ?? 0) * 100));
  }

  const enabledKeys = Object.keys(rawScores);
  const totalRun = enabledKeys.length;

  if (totalRun === 0) {
    return {
      nistCRS: 0, riskLevel: "LOW", passCount: 0, failCount: 0, totalRun: 0,
      worstAttack: "—", worstNormScore: 0, breakdown: [], radarValues: buildRadarValues({}),
      priorityActions: [], score: 0, enabledCount: 0,
    };
  }

  // Step 2: Normalise each raw score (§2.3)
  const normScores: Partial<Record<string, number>> = {};
  for (const k of enabledKeys) {
    normScores[k] = normalise(rawScores[k]!, k);
  }

  // Step 3: Weighted sum (§2.4)
  let weightedSum = 0;
  let totalWeight = 0;
  for (const k of enabledKeys) {
    const w = ATTACK_WEIGHTS[k] ?? 1.0;
    weightedSum += w * normScores[k]!;
    totalWeight += w;
  }
  const rawCRS = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const nistCRS = parseFloat(Math.min(100, Math.max(0, rawCRS)).toFixed(1));

  // Step 4: Risk classification (§2.4)
  const riskLevel = classifyNISTCRS(nistCRS);

  // Step 5: Pass/fail tally (§2.5)
  let passCount = 0;
  let failCount = 0;
  for (const k of enabledKeys) {
    if (rawScores[k]! < SAFE_THRESHOLDS[k]) passCount++;
    else failCount++;
  }

  // Step 6: Worst attack (§2.6)
  let worstAttack = enabledKeys[0] ?? "—";
  let worstNormScore = 0;
  for (const k of enabledKeys) {
    if (normScores[k]! > worstNormScore) {
      worstNormScore = normScores[k]!;
      worstAttack = k;
    }
  }
  worstNormScore = parseFloat(worstNormScore.toFixed(1));

  // Step 7: Score breakdown (sorted by normalised score desc)
  const breakdown: ComparisonEntry[] = enabledKeys
    .map((k) => {
      const raw = rawScores[k]!;
      const norm = normScores[k]!;
      const w = ATTACK_WEIGHTS[k] ?? 1.0;
      const { primaryThreat, keyMetric } = buildThreatMetric(k, raw, allResults);
      return {
        key: k,
        attackName: DISPLAY_NAMES[k] ?? k,
        rawScore: parseFloat(raw.toFixed(1)),
        normScore: parseFloat(norm.toFixed(1)),
        pass: raw < SAFE_THRESHOLDS[k],
        weight: w,
        contribution: parseFloat((totalWeight > 0 ? (w * norm / totalWeight) : 0).toFixed(2)),
        riskLevel: perAttackLevel(raw, k),
        primaryThreat,
        keyMetric,
      };
    })
    .sort((a, b) => b.normScore - a.normScore);

  // Step 8: Radar values (§4.2)
  const radarValues = buildRadarValues(normScores);

  // Step 9: Priority actions (§4.8)
  const priorityActions = buildPriorityActions(rawScores, allResults, kVal, lVal, tVal);

  // §6 Sanity checks (console warnings only)
  const jScore = rawScores["journalist"];
  const pScore = rawScores["prosecutor"];
  if (jScore != null && pScore != null && jScore > pScore + 0.5) {
    console.warn("[C1] Sanity check failed: journalist_score > prosecutor_score. Check ec_size_population computation.");
  }
  if (nistCRS < 0 || nistCRS > 100) {
    console.error("[C3] NIST_CRS out of bounds:", nistCRS);
  }

  return {
    nistCRS,
    riskLevel,
    passCount,
    failCount,
    totalRun,
    worstAttack: DISPLAY_NAMES[worstAttack] ?? worstAttack,
    worstNormScore,
    breakdown,
    radarValues,
    priorityActions,
    score: nistCRS,           // backward compat
    enabledCount: totalRun,   // backward compat
  };
}

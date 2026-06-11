import { getRiskLevel, RiskLevel } from "./utils";

export interface CompositeResult {
  score: number; // 0–100
  riskLevel: RiskLevel;
  breakdown: { attack: string; weight: number; risk: number; weighted: number }[];
}

/**
 * NIST-Inspired Composite Privacy Risk Score (10-Attack Framework)
 *
 * Identity threats  (Prosecutor + Record Linkage + Singling Out): 0.36
 * Attribute threats (Attr. Disclosure + Marketer + Differencing):  0.31
 * Inference threats (Journalist + Inference + Model Inversion):    0.29
 * Presence threats  (Membership):                                  0.04
 *
 * All weights sum to 1.00.
 */
const WEIGHTS = {
  prosecutor:          0.12,
  journalist:          0.10,
  marketer:            0.08,
  singlingOut:         0.12,
  inference:           0.08,
  membership:          0.04,
  recordLinkage:       0.12,
  attributeDisclosure: 0.12,
  differencing:        0.11,
  modelInversion:      0.11,
};

export function computeCompositeScore(risks: {
  prosecutor: number;
  journalist: number;
  marketer: number;
  singlingOut: number;
  inference: number;
  membership: number;
  recordLinkage: number;
  attributeDisclosure: number;
  differencing: number;
  modelInversion: number;
}): CompositeResult {
  const breakdown = [
    { attack: "Prosecutor",           weight: WEIGHTS.prosecutor,          risk: risks.prosecutor },
    { attack: "Journalist",           weight: WEIGHTS.journalist,          risk: risks.journalist },
    { attack: "Marketer",             weight: WEIGHTS.marketer,            risk: risks.marketer },
    { attack: "Singling Out",         weight: WEIGHTS.singlingOut,         risk: risks.singlingOut },
    { attack: "Inference",            weight: WEIGHTS.inference,           risk: risks.inference },
    { attack: "Membership",           weight: WEIGHTS.membership,          risk: risks.membership },
    { attack: "Record Linkage",       weight: WEIGHTS.recordLinkage,       risk: risks.recordLinkage },
    { attack: "Attr. Disclosure",     weight: WEIGHTS.attributeDisclosure, risk: risks.attributeDisclosure },
    { attack: "Differencing",         weight: WEIGHTS.differencing,        risk: risks.differencing },
    { attack: "Model Inversion",      weight: WEIGHTS.modelInversion,      risk: risks.modelInversion },
  ].map((b) => ({ ...b, weighted: b.weight * b.risk }));

  const composite = breakdown.reduce((s, b) => s + b.weighted, 0);
  const score = parseFloat((composite * 100).toFixed(1));

  return {
    score,
    riskLevel: getRiskLevel(composite),
    breakdown,
  };
}

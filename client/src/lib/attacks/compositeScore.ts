import { getRiskLevel, RiskLevel } from "./utils";

export interface CompositeResult {
  score: number; // 0–100
  riskLevel: RiskLevel;
  breakdown: { attack: string; weight: number; risk: number; weighted: number }[];
}

const WEIGHTS = {
  prosecutor: 0.25,
  journalist: 0.20,
  marketer: 0.15,
  singlingOut: 0.20,
  inference: 0.15,
  membership: 0.05,
};

export function computeCompositeScore(risks: {
  prosecutor: number;
  journalist: number;
  marketer: number;
  singlingOut: number;
  inference: number;
  membership: number;
}): CompositeResult {
  const breakdown = [
    { attack: "Prosecutor", weight: WEIGHTS.prosecutor, risk: risks.prosecutor },
    { attack: "Journalist", weight: WEIGHTS.journalist, risk: risks.journalist },
    { attack: "Marketer", weight: WEIGHTS.marketer, risk: risks.marketer },
    { attack: "Singling Out", weight: WEIGHTS.singlingOut, risk: risks.singlingOut },
    { attack: "Inference", weight: WEIGHTS.inference, risk: risks.inference },
    { attack: "Membership", weight: WEIGHTS.membership, risk: risks.membership },
  ].map((b) => ({ ...b, weighted: b.weight * b.risk }));

  const composite = breakdown.reduce((s, b) => s + b.weighted, 0);
  const score = parseFloat((composite * 100).toFixed(1));

  return {
    score,
    riskLevel: getRiskLevel(composite),
    breakdown,
  };
}

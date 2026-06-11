import { DataRow, getRiskLevel, isNumeric, RiskLevel } from "./utils";

interface TreeNode {
  attribute?: string;
  threshold?: number | string;
  isNumericSplit?: boolean;
  left?: TreeNode;
  right?: TreeNode;
  prediction?: string;
  gini?: number;
  samples?: number;
}

function gini(labels: string[]): number {
  if (labels.length === 0) return 0;
  const counts = new Map<string, number>();
  labels.forEach((l) => counts.set(l, (counts.get(l) || 0) + 1));
  const n = labels.length;
  let sum = 0;
  counts.forEach((c) => { sum += (c / n) ** 2; });
  return 1 - sum;
}

function mostCommon(labels: string[]): string {
  const counts = new Map<string, number>();
  labels.forEach((l) => counts.set(l, (counts.get(l) || 0) + 1));
  let best = ""; let bestC = 0;
  counts.forEach((c, l) => { if (c > bestC) { best = l; bestC = c; } });
  return best;
}

function buildTree(X: number[][], y: string[], depth: number, maxDepth: number, attrs: string[]): TreeNode {
  if (depth >= maxDepth || new Set(y).size === 1 || y.length < 6) {
    return { prediction: mostCommon(y), gini: gini(y), samples: y.length };
  }

  const parentGini = gini(y);
  let bestGain = -Infinity;
  let bestAttr = -1;
  let bestThreshold = 0;

  for (let a = 0; a < X[0].length; a++) {
    const vals = [...new Set(X.map((r) => r[a]))].sort((a, b) => a - b);
    const thresholds = vals.slice(0, -1).map((v, i) => (v + vals[i + 1]) / 2);

    for (const t of thresholds.slice(0, 10)) {
      const left = y.filter((_, i) => X[i][a] <= t);
      const right = y.filter((_, i) => X[i][a] > t);
      if (left.length === 0 || right.length === 0) continue;

      const giniSplit = (left.length / y.length) * gini(left) + (right.length / y.length) * gini(right);
      const gain = parentGini - giniSplit;
      if (gain > bestGain) { bestGain = gain; bestAttr = a; bestThreshold = t; }
    }
  }

  if (bestAttr === -1 || bestGain <= 0) return { prediction: mostCommon(y), samples: y.length };

  const leftIdx = X.map((_, i) => i).filter((i) => X[i][bestAttr] <= bestThreshold);
  const rightIdx = X.map((_, i) => i).filter((i) => X[i][bestAttr] > bestThreshold);

  return {
    attribute: attrs[bestAttr],
    threshold: bestThreshold,
    isNumericSplit: true,
    gini: parentGini,
    samples: y.length,
    left: buildTree(leftIdx.map((i) => X[i]), leftIdx.map((i) => y[i]), depth + 1, maxDepth, attrs),
    right: buildTree(rightIdx.map((i) => X[i]), rightIdx.map((i) => y[i]), depth + 1, maxDepth, attrs),
  };
}

function predict(node: TreeNode, x: number[]): string {
  if (node.prediction !== undefined) return node.prediction;
  const attrIdx = (node as any)._attrIdx ?? 0;
  const val = x[attrIdx];
  if (val <= (node.threshold as number)) {
    return node.left ? predict(node.left, x) : "";
  }
  return node.right ? predict(node.right, x) : "";
}

function predictWithAttrs(node: TreeNode, x: number[], attrs: string[]): string {
  if (node.prediction !== undefined) return node.prediction;
  const attrIdx = attrs.indexOf(node.attribute!);
  if (attrIdx === -1) return mostCommon([]);
  const val = x[attrIdx];
  if (val <= (node.threshold as number)) {
    return node.left ? predictWithAttrs(node.left, x, attrs) : "";
  }
  return node.right ? predictWithAttrs(node.right, x, attrs) : "";
}

function computeGiniImportance(node: TreeNode, importance: Map<string, number>, totalSamples: number): void {
  if (!node.attribute) return;
  const weighted = ((node.gini ?? 0) * (node.samples ?? 0)) / totalSamples;
  const leftContrib = node.left ? ((node.left.gini ?? 0) * (node.left.samples ?? 0)) / totalSamples : 0;
  const rightContrib = node.right ? ((node.right.gini ?? 0) * (node.right.samples ?? 0)) / totalSamples : 0;
  const gain = weighted - leftContrib - rightContrib;
  importance.set(node.attribute, (importance.get(node.attribute) || 0) + Math.max(0, gain));
  if (node.left) computeGiniImportance(node.left, importance, totalSamples);
  if (node.right) computeGiniImportance(node.right, importance, totalSamples);
}

export interface PerSAResult {
  sa: string;
  attackAccuracy: number;
  baselineAccuracy: number;
  infoGain: number;
  riskLevel: string;
}

export interface InferenceResult {
  riskScore: number;
  riskLevel: RiskLevel;
  attackAccuracy: number;
  baselineAccuracy: number;
  infoGain: number;
  featureImportance: { qi: string; importance: number }[];
  perSA: PerSAResult[];
  accuracyComparison: { name: string; value: number }[];
  recommendations: string[];
  totalRecords: number;
}

export function runInferenceAttack(
  data: DataRow[],
  quasiIdentifiers: string[],
  sensitiveAttributes: string[]
): InferenceResult {
  const n = data.length;
  if (n === 0 || quasiIdentifiers.length === 0 || sensitiveAttributes.length === 0) return emptyResult();

  // Frequency encoding for QIs
  const encodings = new Map<string, Map<string, number>>();
  quasiIdentifiers.forEach((qi) => {
    const freq = new Map<string, number>();
    data.forEach((r) => {
      const v = String(r[qi] ?? "");
      freq.set(v, (freq.get(v) || 0) + 1);
    });
    const total = data.length;
    const enc = new Map<string, number>();
    freq.forEach((cnt, v) => enc.set(v, cnt / total));
    encodings.set(qi, enc);
  });

  // Build X matrix
  const X: number[][] = data.map((row) =>
    quasiIdentifiers.map((qi) => {
      const v = String(row[qi] ?? "");
      return encodings.get(qi)?.get(v) ?? 0;
    })
  );

  const perSA: PerSAResult[] = [];
  let overallAccuracy = 0;
  let overallBaseline = 0;
  const importanceAgg = new Map<string, number>();

  sensitiveAttributes.forEach((sa) => {
    const y = data.map((r) => String(r[sa] ?? ""));

    // Baseline: most frequent class
    const classCounts = new Map<string, number>();
    y.forEach((l) => classCounts.set(l, (classCounts.get(l) || 0) + 1));
    const baselineAcc = Math.max(...Array.from(classCounts.values())) / n;

    // 5-fold CV
    const indices = shuffle([...Array(n).keys()]);
    const foldSize = Math.floor(n / 5);
    let correct = 0;
    const localImportance = new Map<string, number>();

    for (let fold = 0; fold < 5; fold++) {
      const valIdx = indices.slice(fold * foldSize, (fold + 1) * foldSize);
      const trainIdx = indices.filter((_, i) => i < fold * foldSize || i >= (fold + 1) * foldSize);

      if (trainIdx.length < 6) continue;

      const X_train = trainIdx.map((i) => X[i]);
      const y_train = trainIdx.map((i) => y[i]);
      const X_val = valIdx.map((i) => X[i]);
      const y_val = valIdx.map((i) => y[i]);

      const tree = buildTree(X_train, y_train, 0, 8, quasiIdentifiers);
      computeGiniImportance(tree, localImportance, trainIdx.length);

      X_val.forEach((x, i) => {
        if (predictWithAttrs(tree, x, quasiIdentifiers) === y_val[i]) correct++;
      });
    }

    const attackAcc = correct / n;
    const ig = Math.max(0, attackAcc - baselineAcc);

    localImportance.forEach((v, k) => {
      importanceAgg.set(k, (importanceAgg.get(k) || 0) + v);
    });

    let saRisk = "LOW";
    if (ig > 0.20) saRisk = "CRITICAL";
    else if (ig > 0.10) saRisk = "HIGH";
    else if (ig > 0.05) saRisk = "MEDIUM";

    perSA.push({
      sa,
      attackAccuracy: parseFloat((attackAcc * 100).toFixed(1)),
      baselineAccuracy: parseFloat((baselineAcc * 100).toFixed(1)),
      infoGain: parseFloat((ig * 100).toFixed(1)),
      riskLevel: saRisk,
    });

    overallAccuracy += attackAcc;
    overallBaseline += baselineAcc;
  });

  const saCount = sensitiveAttributes.length;
  const avgAccuracy = saCount > 0 ? overallAccuracy / saCount : 0;
  const avgBaseline = saCount > 0 ? overallBaseline / saCount : 0;
  const avgIG = Math.max(0, avgAccuracy - avgBaseline);

  // Normalize importance
  const totalImp = Array.from(importanceAgg.values()).reduce((a, b) => a + b, 0);
  const featureImportance = quasiIdentifiers.map((qi) => ({
    qi,
    importance: parseFloat((totalImp > 0 ? (importanceAgg.get(qi) || 0) / totalImp : 0).toFixed(3)),
  })).sort((a, b) => b.importance - a.importance);

  const recommendations: string[] = [];
  if (avgIG > 0.2) recommendations.push("CRITICAL: QIs can predict sensitive attributes with high accuracy — strong inference attack risk.");
  if (avgIG > 0.1) recommendations.push("AI inference attack can significantly improve over random guessing — apply feature suppression.");
  const topFeat = featureImportance[0];
  if (topFeat && topFeat.importance > 0.3) recommendations.push(`'${topFeat.qi}' is the strongest predictor — suppressing it would most reduce inference risk.`);
  const topSA = [...perSA].sort((a, b) => b.infoGain - a.infoGain)[0];
  if (topSA && topSA.infoGain > 5) recommendations.push(`Sensitive attribute '${topSA.sa}' has the highest inference gain (${topSA.infoGain}%) — consider stronger privacy protection.`);
  if (recommendations.length === 0) recommendations.push("Inference attack risk is within acceptable bounds.");

  return {
    riskScore: avgIG,
    riskLevel: getRiskLevel(avgIG),
    attackAccuracy: parseFloat((avgAccuracy * 100).toFixed(1)),
    baselineAccuracy: parseFloat((avgBaseline * 100).toFixed(1)),
    infoGain: parseFloat((avgIG * 100).toFixed(1)),
    featureImportance,
    perSA,
    accuracyComparison: [
      { name: "Attack Accuracy", value: parseFloat((avgAccuracy * 100).toFixed(1)) },
      { name: "Baseline (Random)", value: parseFloat((avgBaseline * 100).toFixed(1)) },
    ],
    recommendations,
    totalRecords: n,
  };
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function emptyResult(): InferenceResult {
  return {
    riskScore: 0, riskLevel: "LOW", attackAccuracy: 0, baselineAccuracy: 0, infoGain: 0,
    featureImportance: [], perSA: [], accuracyComparison: [],
    recommendations: ["Select quasi-identifiers and sensitive attributes to run inference attack."], totalRecords: 0,
  };
}

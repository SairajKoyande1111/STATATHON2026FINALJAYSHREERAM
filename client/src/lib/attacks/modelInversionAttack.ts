import { buildEquivalenceClasses, frequencyMap, getRiskLevel, type DataRow, type RiskLevel } from "./utils";

export interface ModelInversionResult {
  riskScore: number;
  riskLevel: RiskLevel;
  totalRecords: number;
  successfulInversions: number;
  inversionRate: number;
  avgConfidence: number;
  maxConfidence: number;
  reconstructionAccuracy: number;
  perSAResults: {
    sa: string;
    avgConfidence: number;
    maxConfidence: number;
    inversionRate: number;
    reconstructedValue: string;
    riskLevel: RiskLevel;
  }[];
  confidenceHistogram: { bucket: string; count: number }[];
  inversionCurve: { threshold: string; inversions: number; rate: number }[];
  topReconstructedRecords: { qiCombo: string; targetSA: string; reconstructedValue: string; confidence: number }[];
  recommendations: string[];
}

/**
 * Model Inversion Attack
 *
 * Objective: Determine whether sensitive attributes can be reconstructed
 * purely from quasi-identifier values, simulating what an attacker would
 * learn from a published model (or from the dataset statistics themselves).
 *
 * Mathematical Foundation:
 *
 *   The attacker seeks: x* = argmax_x P(y | x)
 *   i.e., find the QI combination that maximises predicted confidence for
 *   a target sensitive attribute value y.
 *
 *   Implementation (no external ML library):
 *   We train a simple Naïve Bayes / Maximum A-Posteriori (MAP) classifier
 *   using the conditional frequency tables from the dataset:
 *
 *     P(SA = v | QI₁=q₁, …, QIₙ=qₙ)
 *       ≈ P(SA = v) × ∏ P(QIᵢ = qᵢ | SA = v)   [Naïve Bayes]
 *
 *   Confidence(record) = max_v P(SA = v | QI combo)  (normalised)
 *
 *   Record is "successfully inverted" if confidence > HIGH_CONF_THRESHOLD (0.80)
 *
 *   Reconstruction accuracy:
 *     Accuracy = |{r : argmax_v P(SA=v|QI)  = actual SA value}| / N
 *
 *   Risk = successful_inversions / N
 *
 * Reference: Fredrikson et al., "Model Inversion Attacks that Exploit
 *            Confidence Information and Basic Countermeasures",
 *            ACM CCS 2015.
 */
export function runModelInversionAttack(
  data: DataRow[],
  quasiIdentifiers: string[],
  sensitiveAttributes: string[]
): ModelInversionResult {
  if (data.length === 0 || quasiIdentifiers.length === 0 || sensitiveAttributes.length === 0) {
    return emptyResult(sensitiveAttributes.length);
  }

  const HIGH_CONF_THRESHOLD = 0.80;
  const N = data.length;

  let totalSuccessfulInversions = 0;
  let globalSumConfidence = 0;
  let globalMaxConfidence = 0;
  let totalCorrect = 0;
  const allConfidences: number[] = [];

  const perSAResults: ModelInversionResult["perSAResults"] = [];
  const topReconstructed: ModelInversionResult["topReconstructedRecords"] = [];

  for (const sa of sensitiveAttributes) {
    // ── Step 1: Build Naïve Bayes tables ────────────────────────────────────

    // P(SA = v) — prior
    const saVals = data.map((r) => String(r[sa] ?? "MISSING"));
    const saFreq = frequencyMap(saVals);
    const saClasses = Array.from(saFreq.keys());
    const prior = new Map<string, number>();
    saFreq.forEach((cnt, v) => prior.set(v, cnt / N));

    // P(QI = q | SA = v) — likelihood per feature
    // Map: saClass → Map<column → Map<value → probability>>
    const likelihood = new Map<string, Map<string, Map<string, number>>>();
    saClasses.forEach((cls) => likelihood.set(cls, new Map()));

    data.forEach((row) => {
      const cls = String(row[sa] ?? "MISSING");
      const clsMap = likelihood.get(cls)!;
      quasiIdentifiers.forEach((qi) => {
        if (!clsMap.has(qi)) clsMap.set(qi, new Map());
        const qiMap = clsMap.get(qi)!;
        const val = String(row[qi] ?? "");
        qiMap.set(val, (qiMap.get(val) || 0) + 1);
      });
    });

    // Normalise likelihoods (convert counts → probabilities with Laplace smoothing)
    likelihood.forEach((clsMap, cls) => {
      const clsCount = saFreq.get(cls) || 1;
      clsMap.forEach((qiMap) => {
        const total = clsCount;
        const vocabSize = qiMap.size;
        qiMap.forEach((cnt, v) => {
          qiMap.set(v, (cnt + 1) / (total + vocabSize)); // Laplace +1
        });
      });
    });

    // ── Step 2: Score each record ────────────────────────────────────────────
    let saSuccessful = 0;
    let saSumConf = 0;
    let saMaxConf = 0;
    let saCorrect = 0;
    let bestReconstructValue = "";
    let bestReconstructConf = 0;
    let bestReconstructQI = "";

    for (const row of data) {
      const actualVal = String(row[sa] ?? "MISSING");

      // Compute log-posterior for each class (Naïve Bayes MAP)
      let sumExp = 0;
      const logScores = new Map<string, number>();
      saClasses.forEach((cls) => {
        let logProb = Math.log(prior.get(cls) || 1e-10);
        const clsMap = likelihood.get(cls)!;
        quasiIdentifiers.forEach((qi) => {
          const qiMap = clsMap.get(qi);
          const val = String(row[qi] ?? "");
          const p = qiMap?.get(val) || 1e-10;
          logProb += Math.log(p);
        });
        logScores.set(cls, logProb);
        sumExp += Math.exp(logProb);
      });

      // Normalise to probabilities (softmax from log-space)
      let maxConf = 0;
      let predictedClass = "";
      logScores.forEach((logP, cls) => {
        const p = Math.exp(logP) / Math.max(sumExp, 1e-300);
        if (p > maxConf) { maxConf = p; predictedClass = cls; }
      });

      allConfidences.push(maxConf);
      saSumConf += maxConf;
      if (maxConf > saMaxConf) {
        saMaxConf = maxConf;
        bestReconstructValue = predictedClass;
        bestReconstructConf = maxConf;
        bestReconstructQI = quasiIdentifiers.map((qi) => `${qi}=${row[qi]}`).join(", ").slice(0, 80);
      }
      if (maxConf > HIGH_CONF_THRESHOLD) saSuccessful++;
      if (predictedClass === actualVal) saCorrect++;

      // Collect top high-confidence reconstructions
      if (maxConf > 0.85 && topReconstructed.length < 10) {
        topReconstructed.push({
          qiCombo: quasiIdentifiers.map((qi) => `${qi}=${row[qi]}`).join(", ").slice(0, 80),
          targetSA: sa,
          reconstructedValue: predictedClass,
          confidence: parseFloat((maxConf * 100).toFixed(1)),
        });
      }
    }

    totalSuccessfulInversions += saSuccessful;
    globalSumConfidence += saSumConf;
    if (saMaxConf > globalMaxConfidence) globalMaxConfidence = saMaxConf;
    totalCorrect += saCorrect;

    const avgConf = saSumConf / N;
    perSAResults.push({
      sa,
      avgConfidence: parseFloat((avgConf * 100).toFixed(1)),
      maxConfidence: parseFloat((saMaxConf * 100).toFixed(1)),
      inversionRate: parseFloat(((saSuccessful / N) * 100).toFixed(1)),
      reconstructedValue: bestReconstructValue,
      riskLevel: getRiskLevel(saMaxConf >= 0.75 ? 0.75 : saMaxConf >= 0.5 ? 0.55 : saMaxConf >= 0.25 ? 0.35 : 0.1),
    });
  }

  const totalSARecords = N * sensitiveAttributes.length;
  const riskScore = totalSARecords > 0 ? totalSuccessfulInversions / totalSARecords : 0;
  const avgConfidence = totalSARecords > 0 ? globalSumConfidence / totalSARecords : 0;
  const reconstructionAccuracy = totalSARecords > 0 ? totalCorrect / totalSARecords : 0;

  // ── Confidence Histogram ──────────────────────────────────────────────────
  const confBuckets = [
    { label: "0-25% (Low)", min: 0, max: 0.25 },
    { label: "25-50%", min: 0.25, max: 0.5 },
    { label: "50-75%", min: 0.5, max: 0.75 },
    { label: "75-90%", min: 0.75, max: 0.9 },
    { label: ">90% (Critical)", min: 0.9, max: 1.01 },
  ];
  const confidenceHistogram = confBuckets.map(({ label, min, max }) => ({
    bucket: label,
    count: allConfidences.filter((v) => v >= min && v < max).length,
  }));

  // ── Inversion Curve (sensitivity at different thresholds) ─────────────────
  const thresholds = [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];
  const inversionCurve = thresholds.map((t) => ({
    threshold: `${(t * 100).toFixed(0)}%`,
    inversions: allConfidences.filter((v) => v >= t).length,
    rate: parseFloat(((allConfidences.filter((v) => v >= t).length / Math.max(allConfidences.length, 1)) * 100).toFixed(1)),
  }));

  const top10 = [...topReconstructed].sort((a, b) => b.confidence - a.confidence).slice(0, 10);

  return {
    riskScore,
    riskLevel: getRiskLevel(riskScore),
    totalRecords: N,
    successfulInversions: totalSuccessfulInversions,
    inversionRate: parseFloat(((totalSuccessfulInversions / Math.max(totalSARecords, 1)) * 100).toFixed(1)),
    avgConfidence: parseFloat((avgConfidence * 100).toFixed(1)),
    maxConfidence: parseFloat((globalMaxConfidence * 100).toFixed(1)),
    reconstructionAccuracy: parseFloat((reconstructionAccuracy * 100).toFixed(1)),
    perSAResults,
    confidenceHistogram,
    inversionCurve,
    topReconstructedRecords: top10,
    recommendations: buildRecommendations(riskScore, globalMaxConfidence, reconstructionAccuracy, sensitiveAttributes),
  };
}

function buildRecommendations(
  risk: number,
  maxConf: number,
  recAcc: number,
  sas: string[]
): string[] {
  const recs: string[] = [];
  if (maxConf > 0.75) {
    recs.push(`Maximum reconstruction confidence is ${(maxConf * 100).toFixed(0)}% — an attacker can recover sensitive attribute values with high certainty using only quasi-identifiers.`);
  }
  if (recAcc > 0.6) {
    recs.push(`Reconstruction accuracy is ${(recAcc * 100).toFixed(0)}% — the dataset has strong statistical dependencies between QIs and sensitive attributes. Reduce this with L-Diversity.`);
  }
  if (risk > 0.5) {
    recs.push("Model inversion risk is HIGH. Consider applying noise to published model weights, output perturbation, or confidence score masking to prevent inversion attacks.");
  }
  if (sas.length > 1) {
    recs.push("Multiple sensitive attributes are at risk. Apply per-attribute L-Diversity (l ≥ 3) and T-Closeness (t ≤ 0.2) to break the QI → SA statistical correlation.");
  }
  recs.push("Apply Prediction Perturbation: instead of returning the top class with full probability, return a rounded/binned confidence score to prevent gradient-based inversion.");
  if (risk < 0.25) {
    recs.push("Model inversion risk is LOW. Quasi-identifiers do not strongly predict sensitive attribute values — statistical dependencies are limited.");
  }
  return recs;
}

function emptyResult(saCount: number): ModelInversionResult {
  return {
    riskScore: 0, riskLevel: "LOW", totalRecords: 0, successfulInversions: 0,
    inversionRate: 0, avgConfidence: 0, maxConfidence: 0, reconstructionAccuracy: 0,
    perSAResults: [], confidenceHistogram: [], inversionCurve: [], topReconstructedRecords: [],
    recommendations: saCount === 0
      ? ["Select at least one sensitive attribute to run Model Inversion analysis."]
      : ["No data available."],
  };
}

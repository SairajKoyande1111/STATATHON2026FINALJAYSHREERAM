import { buildEquivalenceClasses, DataRow, freqDist, getRiskLevel, RiskLevel, totalVariationDistance } from "./utils";

export interface GroupRisk {
  qiCombo: string;
  size: number;
  dominantProb: number;
  lDiversity: number;
  emd: number;
  isLDiverse: boolean;
  isTClose: boolean;
}

export interface MarketerResult {
  riskScore: number;
  riskLevel: RiskLevel;
  lDiversityPassRate: number;
  tClosenessPassRate: number;
  atRiskGroups: number;
  groupRisks: GroupRisk[];
  lDiversityHistogram: { label: string; count: number }[];
  emdHistogram: { bucket: string; count: number }[];
  recommendations: string[];
  totalRecords: number;
  totalGroups: number;
}

export function runMarketerAttack(
  data: DataRow[],
  quasiIdentifiers: string[],
  sensitiveAttributes: string[],
  lThreshold: number,
  tThreshold: number
): MarketerResult {
  const n = data.length;
  if (n === 0 || quasiIdentifiers.length === 0) return emptyResult();

  const ecs = buildEquivalenceClasses(data, quasiIdentifiers);
  const m = ecs.length;

  // Global distribution per sensitive attribute
  const globalDists = new Map<string, Map<string, number>>();
  sensitiveAttributes.forEach((sa) => {
    globalDists.set(sa, freqDist(data.map((r) => r[sa] ?? "")));
  });

  const groupRisks: GroupRisk[] = [];
  let weightedRiskSum = 0;
  let lDiverseCount = 0;
  let tCloseCount = 0;
  let atRiskGroups = 0;

  ecs.forEach((ec) => {
    let maxDominantProb = 0;
    let minLDiv = Infinity;
    let maxEMD = 0;
    let groupIsLDiverse = true;
    let groupIsTClose = true;

    if (sensitiveAttributes.length === 0) {
      // No sensitive attrs: use EC size as proxy
      maxDominantProb = 1 / ec.size;
      minLDiv = ec.size;
      maxEMD = 0;
    } else {
      sensitiveAttributes.forEach((sa) => {
        const vals = ec.records.map((r) => r[sa] ?? "");
        const localFreq = new Map<string, number>();
        vals.forEach((v) => localFreq.set(String(v), (localFreq.get(String(v)) || 0) + 1));
        const distinctVals = localFreq.size;
        const dominantCount = Math.max(...Array.from(localFreq.values()));
        const dominantProb = dominantCount / ec.size;

        maxDominantProb = Math.max(maxDominantProb, dominantProb);
        minLDiv = Math.min(minLDiv, distinctVals);

        const localDist = freqDist(vals);
        const globalDist = globalDists.get(sa) || new Map();
        const emd = totalVariationDistance(localDist, globalDist);
        maxEMD = Math.max(maxEMD, emd);

        if (distinctVals < lThreshold) groupIsLDiverse = false;
        if (emd > tThreshold) groupIsTClose = false;
      });
    }

    const weight = ec.size / n;
    weightedRiskSum += weight * maxDominantProb;
    if (groupIsLDiverse) lDiverseCount++;
    if (groupIsTClose) tCloseCount++;
    if (!groupIsLDiverse || !groupIsTClose) atRiskGroups++;

    groupRisks.push({
      qiCombo: ec.key.split("|").map((v, i) => `${quasiIdentifiers[i] || i}=${v}`).join(", "),
      size: ec.size,
      dominantProb: parseFloat(maxDominantProb.toFixed(3)),
      lDiversity: minLDiv === Infinity ? 1 : minLDiv,
      emd: parseFloat(maxEMD.toFixed(3)),
      isLDiverse: groupIsLDiverse,
      isTClose: groupIsTClose,
    });
  });

  const marketerRisk = weightedRiskSum;

  // L-Diversity histogram
  const lBuckets = [1, 2, 3, 4, 5];
  const lDiversityHistogram = lBuckets.map((l) => ({
    label: l < 5 ? String(l) : "5+",
    count: groupRisks.filter((g) => (l < 5 ? g.lDiversity === l : g.lDiversity >= 5)).length,
  }));

  // EMD histogram
  const emdBuckets = [
    { bucket: "0–0.1", min: 0, max: 0.1 },
    { bucket: "0.1–0.2", min: 0.1, max: 0.2 },
    { bucket: "0.2–0.3", min: 0.2, max: 0.3 },
    { bucket: "0.3–0.5", min: 0.3, max: 0.5 },
    { bucket: ">0.5", min: 0.5, max: Infinity },
  ];
  const emdHistogram = emdBuckets.map((b) => ({
    bucket: b.bucket,
    count: groupRisks.filter((g) => g.emd >= b.min && g.emd < b.max).length,
  }));

  const recommendations: string[] = [];
  const lPassRate = m > 0 ? lDiverseCount / m : 1;
  const tPassRate = m > 0 ? tCloseCount / m : 1;

  if (lPassRate < 0.5) recommendations.push(`Only ${(lPassRate * 100).toFixed(0)}% of groups satisfy l-diversity — apply L-Diversity enforcement.`);
  if (tPassRate < 0.5) recommendations.push(`Only ${(tPassRate * 100).toFixed(0)}% of groups satisfy t-closeness — reduce QI granularity to align local/global distributions.`);
  const worstGroup = [...groupRisks].sort((a, b) => b.dominantProb - a.dominantProb)[0];
  if (worstGroup && worstGroup.dominantProb > 0.5) recommendations.push(`Group "${worstGroup.qiCombo.slice(0, 60)}" has ${(worstGroup.dominantProb * 100).toFixed(0)}% attribute dominance — critical disclosure risk.`);
  if (recommendations.length === 0) recommendations.push("Marketer attack risk is within acceptable bounds.");

  return {
    riskScore: marketerRisk,
    riskLevel: getRiskLevel(marketerRisk),
    lDiversityPassRate: lPassRate,
    tClosenessPassRate: tPassRate,
    atRiskGroups,
    groupRisks: [...groupRisks].sort((a, b) => b.dominantProb - a.dominantProb).slice(0, 20),
    lDiversityHistogram,
    emdHistogram,
    recommendations,
    totalRecords: n,
    totalGroups: m,
  };
}

function emptyResult(): MarketerResult {
  return {
    riskScore: 0, riskLevel: "LOW", lDiversityPassRate: 1, tClosenessPassRate: 1,
    atRiskGroups: 0, groupRisks: [], lDiversityHistogram: [], emdHistogram: [],
    recommendations: ["No data or quasi-identifiers selected."], totalRecords: 0, totalGroups: 0,
  };
}

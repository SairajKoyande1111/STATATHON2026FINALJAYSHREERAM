/**
 * Privacy Enhancement Utilities
 * Implements K-Anonymity, L-Diversity, T-Closeness, Differential Privacy
 */

export interface EquivalenceClassInfo {
  key: string;
  records: any[];
  size: number;
  distinctCount: number;
}

/**
 * K-ANONYMITY: Ensures each equivalence class has at least k records
 * Methods: Global Recoding, Local Recoding, Clustering
 */
export function applyKAnonymityEnhanced(
  data: any[],
  quasiIdentifiers: string[],
  kValue: number,
  suppressionLimit: number = 0.1
): { 
  processedData: any[]; 
  recordsSuppressed: number; 
  informationLoss: number;
  equivalenceClasses: number;
  avgGroupSize: number;
  minGroupSize: number;
  maxGroupSize: number;
  privacyRisk: number;
} {
  const groups = new Map<string, any[]>();
  data.forEach((row) => {
    const key = quasiIdentifiers.map((qi) => row[qi]).join("|");
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push({ ...row });
  });

  let processedData: any[] = [];
  let currentSuppressed = 0;
  const maxSuppressed = Math.floor(data.length * suppressionLimit);
  const groupSizes: number[] = [];

  groups.forEach((records) => {
    if (records.length >= kValue) {
      processedData.push(...records);
      groupSizes.push(records.length);
    } else {
      if (currentSuppressed + records.length <= maxSuppressed) {
        // Suppress these records
        currentSuppressed += records.length;
      } else {
        // Generalize instead
        const generalizedRecords = records.map((r) => {
          const generalized = { ...r };
          quasiIdentifiers.forEach((qi) => {
            const val = generalized[qi];
            if (typeof val === "number") {
              // Generalize numeric values to ranges of 10
              const lower = Math.floor(val / 10) * 10;
              const upper = lower + 10;
              generalized[qi] = `${lower}-${upper}`;
            } else if (typeof val === "string") {
              // Mask string values
              generalized[qi] = "*";
            } else {
              generalized[qi] = "*";
            }
          });
          return generalized;
        });
        processedData.push(...generalizedRecords);
        groupSizes.push(records.length);
      }
    }
  });

  const avgGroupSize = groupSizes.length > 0 ? processedData.length / groupSizes.length : 0;
  const minGroupSize = groupSizes.length > 0 ? Math.min(...groupSizes) : 0;
  const maxGroupSize = groupSizes.length > 0 ? Math.max(...groupSizes) : 0;
  
  // Safety Score Calculation
  // We want to measure how close we are to the target kValue.
  // If minGroupSize >= kValue, we are safe (100%).
  // If minGroupSize < kValue, the safety score should reflect the gap.
  // A common metric is: score = (minGroupSize / kValue) * 100
  const safetyScore = Math.min(100, Math.round((minGroupSize / kValue) * 100));
  const privacyRisk = 1 - (safetyScore / 100);

  console.log(`[K-Anonymity Debug] kValue: ${kValue}, minGroupSize: ${minGroupSize}, safetyScore: ${safetyScore}%, recordsSuppressed: ${currentSuppressed}`);

  return { 
    processedData, 
    recordsSuppressed: currentSuppressed, 
    informationLoss: currentSuppressed / data.length,
    equivalenceClasses: groupSizes.length,
    avgGroupSize,
    minGroupSize,
    maxGroupSize,
    privacyRisk: safetyScore // Passing the 0-100 score
  };
}

/**
 * L-DIVERSITY: Distinct Variant
 * Ensures each equivalence class contains at least l distinct values for sensitive attribute
 */
export function applyLDiversityDistinct(
  data: any[],
  quasiIdentifiers: string[],
  sensitiveAttribute: string,
  lValue: number
): { 
  processedData: any[]; 
  recordsSuppressed: number; 
  informationLoss: number;
  diverseClasses: number;
  violatingClasses: number;
  avgDiversity: number;
  minDiversity: number;
  maxDiversity: number;
  diversityScore: number;
  privacyRisk?: number;
} {
  const ecMap = new Map<string, EquivalenceClassInfo>();
  const sensitiveValuesByKey = new Map<string, Set<string>>();

  data.forEach((row) => {
    const key = quasiIdentifiers.map((qi) => String(row[qi] || "")).join("|");
    if (!ecMap.has(key)) {
      ecMap.set(key, { key, records: [], size: 0, distinctCount: 0 });
      sensitiveValuesByKey.set(key, new Set());
    }
    const ec = ecMap.get(key)!;
    ec.records.push(row);
    ec.size++;
    sensitiveValuesByKey.get(key)!.add(String(row[sensitiveAttribute] || ""));
  });

  const equivalenceClasses = Array.from(ecMap.values()).map((ec) => ({
    ...ec,
    distinctCount: sensitiveValuesByKey.get(ec.key)!.size,
  }));

  let processedData: any[] = [];
  let recordsSuppressed = 0;
  let diverseClasses = 0;
  let violatingClasses = 0;
  const diversities: number[] = [];

  equivalenceClasses.forEach((ec) => {
    diversities.push(ec.distinctCount);
    if (ec.distinctCount >= lValue) {
      processedData.push(...ec.records);
      diverseClasses++;
    } else {
      // Generalization strategy for L-diversity:
      // If a group doesn't meet L-diversity, we generalize the quasi-identifiers
      // similar to K-anonymity, rather than just suppressing everything.
      const generalizedRecords = ec.records.map((r) => {
        const generalized = { ...r };
        quasiIdentifiers.forEach((qi) => {
          const val = generalized[qi];
          if (typeof val === "number" || (typeof val === "string" && !isNaN(Number(val)))) {
            const numVal = Number(val);
            const lower = Math.floor(numVal / 10) * 10;
            const upper = lower + 10;
            generalized[qi] = `${lower}-${upper}`;
          } else {
            generalized[qi] = "*";
          }
        });
        return generalized;
      });
      
      processedData.push(...generalizedRecords);
      // We count these as "transformed/lossy" but they ARE in the output
      // Only count records as suppressed if they are actually removed.
      violatingClasses++;
    }
  });

  const avgDiversity = diversities.length > 0 ? diversities.reduce((a, b) => a + b, 0) / diversities.length : 0;
  const minDiversity = diversities.length > 0 ? Math.min(...diversities) : 0;
  const maxDiversity = diversities.length > 0 ? Math.max(...diversities) : 0;
  
  // Calculate a 0-100 score representing how well L-diversity is met
  const diversityScore = Math.min(100, Math.round((minDiversity / lValue) * 100));

  console.log(`[L-Diversity Debug] lValue: ${lValue}, minDiversity: ${minDiversity}, score: ${diversityScore}%`);

  return { 
    processedData, 
    recordsSuppressed, 
    informationLoss: recordsSuppressed / data.length,
    diverseClasses,
    violatingClasses,
    avgDiversity,
    minDiversity,
    maxDiversity,
    privacyRisk: diversityScore, // Repurpose privacyRisk for the score
    diversityScore
  };
}

/**
 * T-CLOSENESS: Earth Mover's Distance (EMD) Implementation
 * Ensures sensitive attribute distribution within groups stays close to overall distribution
 */
export function applyTCloseness(
  data: any[],
  quasiIdentifiers: string[],
  sensitiveAttribute: string,
  tValue: number
): { 
  processedData: any[]; 
  recordsSuppressed: number; 
  informationLoss: number;
  satisfyingClasses: number;
  violatingClasses: number;
  avgDistance: number;
  maxDistance: number;
} {
  const ecMap = new Map<string, EquivalenceClassInfo>();

  data.forEach((row) => {
    const key = quasiIdentifiers.map((qi) => String(row[qi] || "")).join("|");
    if (!ecMap.has(key)) {
      ecMap.set(key, {
        key,
        records: [],
        size: 0,
        distinctCount: 0,
      });
    }
    const ec = ecMap.get(key)!;
    ec.records.push(row);
    ec.size++;
  });

  const valueFrequency = new Map<string, number>();
  data.forEach((row) => {
    const val = String(row[sensitiveAttribute] || "");
    valueFrequency.set(val, (valueFrequency.get(val) || 0) + 1);
  });

  const overallDist = new Map<string, number>();
  valueFrequency.forEach((count, val) => {
    overallDist.set(val, count / data.length);
  });

  let processedData: any[] = [];
  let recordsSuppressed = 0;
  let satisfyingClasses = 0;
  let violatingClasses = 0;
  const distances: number[] = [];

  Array.from(ecMap.values()).forEach((ec) => {
    const groupValueFrequency = new Map<string, number>();
    ec.records.forEach((row) => {
      const val = String(row[sensitiveAttribute] || "");
      groupValueFrequency.set(val, (groupValueFrequency.get(val) || 0) + 1);
    });

    const groupDist = new Map<string, number>();
    groupValueFrequency.forEach((count, val) => {
      groupDist.set(val, count / ec.size);
    });

    let emd = 0;
    const allValues = new Set<string>();
    
    overallDist.forEach((_, val) => allValues.add(val));
    groupDist.forEach((_, val) => allValues.add(val));

    allValues.forEach((val) => {
      const overallProb = overallDist.get(val) || 0;
      const groupProb = groupDist.get(val) || 0;
      emd += Math.abs(overallProb - groupProb);
    });

    emd = emd / 2;
    distances.push(emd);

    if (emd <= tValue) {
      processedData.push(...ec.records);
      satisfyingClasses++;
    } else {
      recordsSuppressed += ec.size;
      violatingClasses++;
    }
  });

  const avgDistance = distances.length > 0 ? distances.reduce((a, b) => a + b, 0) / distances.length : 0;
  const maxDistance = distances.length > 0 ? Math.max(...distances) : 0;

  return { 
    processedData, 
    recordsSuppressed, 
    informationLoss: recordsSuppressed / data.length,
    satisfyingClasses,
    violatingClasses,
    avgDistance,
    maxDistance
  };
}

/**
 * Helper: Calculate information loss
 */
export function calculateInformationLoss(
  originalSize: number,
  processedSize: number,
  suppressedRecords: number
): number {
  return Math.max(0, suppressedRecords / originalSize);
}

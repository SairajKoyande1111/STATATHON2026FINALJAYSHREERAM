export type DataRow = Record<string, string | number>;

export interface EquivalenceClass {
  key: string;
  records: DataRow[];
  size: number;
}

export function buildEquivalenceClasses(
  data: DataRow[],
  quasiIdentifiers: string[]
): EquivalenceClass[] {
  const ecMap = new Map<string, EquivalenceClass>();
  data.forEach((row) => {
    const key = quasiIdentifiers.map((qi) => String(row[qi] ?? "")).join("|");
    if (!ecMap.has(key)) ecMap.set(key, { key, records: [], size: 0 });
    const ec = ecMap.get(key)!;
    ec.records.push(row);
    ec.size++;
  });
  return Array.from(ecMap.values());
}

export function sampleData(data: DataRow[], pct: number): DataRow[] {
  if (pct >= 100) return data;
  const n = Math.max(1, Math.round((data.length * pct) / 100));
  const shuffled = [...data].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

export function columnRange(data: DataRow[], col: string): number {
  const vals = data.map((r) => Number(r[col])).filter((v) => !isNaN(v));
  if (vals.length === 0) return 1;
  return Math.max(1, Math.max(...vals) - Math.min(...vals));
}

export function isNumeric(data: DataRow[], col: string): boolean {
  const sample = data.slice(0, 20);
  return sample.every((r) => r[col] === undefined || !isNaN(Number(r[col])));
}

export function frequencyMap(values: (string | number)[]): Map<string, number> {
  const m = new Map<string, number>();
  values.forEach((v) => {
    const k = String(v);
    m.set(k, (m.get(k) || 0) + 1);
  });
  return m;
}

export function freqDist(values: (string | number)[]): Map<string, number> {
  const fm = frequencyMap(values);
  const total = values.length;
  const dist = new Map<string, number>();
  fm.forEach((cnt, k) => dist.set(k, cnt / total));
  return dist;
}

export function totalVariationDistance(
  local: Map<string, number>,
  global: Map<string, number>
): number {
  const all = new Set([...local.keys(), ...global.keys()]);
  let tvd = 0;
  all.forEach((v) => {
    tvd += Math.abs((local.get(v) || 0) - (global.get(v) || 0));
  });
  return tvd / 2;
}

export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export function getRiskLevel(score: number): RiskLevel {
  if (score >= 0.7) return "CRITICAL";
  if (score >= 0.5) return "HIGH";
  if (score >= 0.3) return "MEDIUM";
  return "LOW";
}

export const RISK_COLORS: Record<RiskLevel, string> = {
  CRITICAL: "#DC2626",
  HIGH: "#EA580C",
  MEDIUM: "#D97706",
  LOW: "#16A34A",
};

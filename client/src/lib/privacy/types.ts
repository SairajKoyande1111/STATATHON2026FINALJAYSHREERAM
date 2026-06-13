export type DataRow = Record<string, string | number>;

export interface PrivacyResult {
  technique: string;
  family: string;
  processedData: DataRow[];
  originalCount: number;
  processedCount: number;
  recordsSuppressed: number;
  informationLoss: number; // 0–1
  executionMs: number;
  stats: Record<string, string | number>;
  warnings: string[];
  colStats?: Record<string, Record<string, string | number>>;
  interpretation?: string;
  compliancePassed?: boolean | null;
  report?: string;
}

export function columnRange(data: DataRow[], col: string): number {
  const vals = data.map((r) => Number(r[col])).filter((v) => !isNaN(v));
  if (vals.length === 0) return 1;
  return Math.max(1, Math.max(...vals) - Math.min(...vals));
}

export function isNumericCol(data: DataRow[], col: string): boolean {
  const sample = data.slice(0, 30);
  return sample.filter((r) => r[col] !== undefined && r[col] !== "").every((r) => !isNaN(Number(r[col])));
}

export function downloadCSV(data: DataRow[], filename: string): void {
  if (data.length === 0) return;
  const cols = Object.keys(data[0]);
  const header = cols.join(",");
  const rows = data.map((r) => cols.map((c) => {
    const v = String(r[c] ?? "");
    return v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(","));
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function calcInfoLoss(original: DataRow[], processed: DataRow[], numericCols: string[]): number {
  if (numericCols.length === 0 || original.length === 0 || processed.length === 0) return 0;
  let totalLoss = 0;
  for (const col of numericCols) {
    const origVals = original.map((r) => Number(r[col])).filter((v) => !isNaN(v));
    const procVals = processed.map((r) => Number(r[col])).filter((v) => !isNaN(v));
    if (origVals.length === 0 || procVals.length === 0) continue;
    const origMean = origVals.reduce((s, v) => s + v, 0) / origVals.length;
    const procMean = procVals.reduce((s, v) => s + v, 0) / procVals.length;
    const range = columnRange(original, col);
    totalLoss += Math.abs(origMean - procMean) / Math.max(range, 1);
  }
  return Math.min(1, totalLoss / Math.max(numericCols.length, 1));
}

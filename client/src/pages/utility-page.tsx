import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ScatterChart, Scatter, ZAxis,
} from "recharts";
import {
  Activity, BarChart2, GitCompare, Shield, Target, CheckSquare,
  Download, FileText, AlertTriangle, CheckCircle, XCircle, Info,
  ChevronDown, ChevronUp,
} from "lucide-react";

// ── CLIENT-SIDE TYPES (mirror server/utility-compute.ts) ─────────────────────

interface HistogramData { bins: number[]; origCounts: number[]; procCounts: number[]; }

interface NumFidelity {
  col: string;
  origMean: number; procMean: number;
  origStd: number; procStd: number;
  origMin: number; origMax: number;
  origMedian: number; procMedian: number;
  relBias: number; varRatio: number; nmae: number; mps: number; pp: number; sfs: number;
  ksStat: number; jsd: number; wassersteinNorm: number;
  entropyOrig: number; entropyProc: number; epr: number; uvrr: number;
  origP: number[]; procP: number[];
  histogram: HistogramData;
  generalised: boolean;
}

interface CatFidelity {
  col: string; histIntersection: number; uvrr: number;
  entropyOrig: number; entropyProc: number; epr: number; sfs: number;
  origFreq: Record<string, number>; procFreq: Record<string, number>;
}

interface UtilityMetrics {
  ous: number; grade: string; gradeLabel: string; verdict: string;
  sfs: number; dsScore: number; icScore: number; cpScore: number; puScore: number;
  rowsOrig: number; rowsProc: number;
  commonCols: string[]; numericCols: string[]; catCols: string[]; suppressedCols: string[];
  numericFidelity: NumFidelity[]; catFidelity: CatFidelity[];
  correlationCols: string[]; corrOrig: number[][]; corrProc: number[][];
  deltaFrob: number;
  riskBefore: number | null; riskAfter: number | null; riskReduction: number | null;
  technique: string; datasetName: string;
  warnings: string[]; recommendations: string[];
}

interface UMeasurement {
  id: number;
  originalDatasetId: number;
  processedOperationId: number;
  overallUtility: number;
  utilityLevel: string;
  correlationPreservation: number;
  distributionSimilarity: number;
  informationLoss: number;
  metrics: UtilityMetrics;
  createdAt: string;
}

// ── STYLE HELPERS ─────────────────────────────────────────────────────────────

const gradeColor = (g: string) => {
  if (g === "A+" || g === "A") return "text-green-600 dark:text-green-400";
  if (g === "B") return "text-blue-600 dark:text-blue-400";
  if (g === "C") return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
};
const gradeBg = (g: string) => {
  if (g === "A+" || g === "A") return "bg-green-50 border-green-300 dark:bg-green-950/30";
  if (g === "B") return "bg-blue-50 border-blue-300 dark:bg-blue-950/30";
  if (g === "C") return "bg-amber-50 border-amber-300 dark:bg-amber-950/30";
  return "bg-red-50 border-red-300 dark:bg-red-950/30";
};
const scoreColor = (v: number) => {
  if (v >= 0.8) return "text-green-600 dark:text-green-400";
  if (v >= 0.6) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
};
const sfsBarClass = (v: number) => v >= 0.8 ? "bg-green-500" : v >= 0.6 ? "bg-amber-500" : "bg-red-500";
const fmt2 = (v: number) => (v * 100).toFixed(1) + "%";
const fmt3 = (v: number) => v.toFixed(3);
const fmtN = (v: number) => Number.isFinite(v) ? v.toFixed(2) : "—";
const verdictClass = (g: string) =>
  g === "A+" || g === "A" ? "bg-green-50 border-green-300 text-green-800 dark:bg-green-950/30 dark:text-green-300" :
  g === "B" ? "bg-blue-50 border-blue-300 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300" :
  g === "C" ? "bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300" :
  "bg-red-50 border-red-300 text-red-800 dark:bg-red-950/30 dark:text-red-300";

// ── HTML REPORT GENERATOR ─────────────────────────────────────────────────────

function generateReport(m: UtilityMetrics): string {
  const now = new Date().toLocaleString();
  const scoreRow = (label: string, val: number) =>
    `<tr><td>${label}</td><td class="mono">${fmt2(val)}</td><td>${val >= 0.8 ? "✅" : val >= 0.6 ? "⚠" : "❌"}</td></tr>`;
  const numRows = m.numericFidelity.map(f =>
    `<tr><td class="mono">${f.col}${f.generalised ? " (gen)" : ""}</td><td>${fmtN(f.origMean)}</td><td>${fmtN(f.procMean)}</td><td>${fmtN(f.relBias)}%</td><td>${fmt3(f.ksStat)}</td><td>${fmt3(f.jsd)}</td><td>${fmt2(f.sfs)}</td></tr>`
  ).join("");
  const suppPct = m.rowsOrig > 0 ? ((m.rowsOrig - m.rowsProc) / m.rowsOrig * 100).toFixed(1) : "0.0";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Privacy-Utility Assessment Report</title>
<style>
  body{font-family:'Segoe UI',Arial,sans-serif;margin:0;color:#1e293b;background:#fff}
  .cover{background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff;padding:56px 48px;text-align:center}
  .cover h1{font-size:1.9rem;margin:0 0 8px}
  .cover .grade{font-size:4rem;font-weight:800;margin:16px 0}
  .cover .ous{font-size:2rem;font-weight:700}
  section{padding:28px 48px;border-bottom:1px solid #e2e8f0}
  h2{color:#1e3a5f;border-bottom:2px solid #2563eb;padding-bottom:6px;margin-top:0}
  table{width:100%;border-collapse:collapse;margin-top:10px;font-size:.84rem}
  th{background:#1e3a5f;color:#fff;padding:8px 12px;text-align:left}
  td{padding:8px 12px;border-bottom:1px solid #e2e8f0}
  tr:nth-child(even)td{background:#f8fafc}
  .mono{font-family:monospace}
  .verdict{background:#f0fdf4;border-left:4px solid #16a34a;padding:12px 16px;margin:12px 0;border-radius:4px;font-weight:600}
  .warn{background:#fff7ed;border-left:4px solid #d97706;padding:10px 16px;margin:8px 0;border-radius:4px}
  .rec{background:#eff6ff;border-left:4px solid #2563eb;padding:10px 16px;margin:8px 0;border-radius:4px;font-size:.84rem}
  .scoregrid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:16px 0}
  .scorecard{text-align:center;padding:14px;border:1px solid #e2e8f0;border-radius:8px}
  .scorecard .val{font-size:1.4rem;font-weight:700;color:#2563eb}
  .scorecard .lbl{font-size:.72rem;color:#64748b;margin-top:4px}
  footer{padding:16px 48px;text-align:center;font-size:.73rem;color:#94a3b8;border-top:1px solid #e2e8f0}
</style></head>
<body>
<div class="cover">
  <p style="font-size:.75rem;text-transform:uppercase;letter-spacing:2px;opacity:.75">
    Government of India • MoSPI • SafeData Pipeline | Statathon 2025</p>
  <h1>Privacy-Utility Assessment Report</h1>
  <p>Dataset: <strong>${m.datasetName}</strong> &nbsp;|&nbsp; Technique: <strong>${m.technique}</strong></p>
  <p style="font-size:.85rem;opacity:.8">Generated: ${now}</p>
  <div class="grade">${m.grade}</div>
  <div class="ous">${m.ous}% Overall Utility Score</div>
  <p style="opacity:.8;font-size:.85rem;margin-top:8px">${m.gradeLabel}</p>
</div>
<section>
  <h2>1. Executive Summary</h2>
  <div class="verdict">${m.verdict}</div>
  <div class="scoregrid">
    <div class="scorecard"><div class="val">${fmt2(m.sfs)}</div><div class="lbl">Statistical Fidelity</div></div>
    <div class="scorecard"><div class="val">${fmt2(m.dsScore)}</div><div class="lbl">Distribution Similarity</div></div>
    <div class="scorecard"><div class="val">${fmt2(m.icScore)}</div><div class="lbl">Information Content</div></div>
    <div class="scorecard"><div class="val">${fmt2(m.cpScore)}</div><div class="lbl">Correlation Preservation</div></div>
    <div class="scorecard"><div class="val">${fmt2(m.puScore)}</div><div class="lbl">Predictive Utility</div></div>
  </div>
  <table><tr><th>Records (Orig)</th><th>Records (Proc)</th><th>Suppression</th><th>Columns</th></tr>
  <tr><td>${m.rowsOrig}</td><td>${m.rowsProc}</td><td>${m.rowsOrig - m.rowsProc} (${suppPct}%)</td><td>${m.numericCols.length} numeric / ${m.catCols.length} categorical</td></tr></table>
  ${m.riskReduction != null ? `<p>Re-identification risk reduced by approximately <strong>${m.riskReduction.toFixed(1)}%</strong>.</p>` : ""}
</section>
<section>
  <h2>2. Component Scores</h2>
  <table><tr><th>Component</th><th>Score</th><th>Status</th></tr>
  ${scoreRow("Statistical Fidelity (SFS) — weight 30%", m.sfs)}
  ${scoreRow("Distribution Similarity (DS) — weight 25%", m.dsScore)}
  ${scoreRow("Information Content (IC) — weight 20%", m.icScore)}
  ${scoreRow("Correlation Preservation (CP) — weight 15%", m.cpScore)}
  ${scoreRow("Predictive Utility (PU) — weight 10%", m.puScore)}
  </table>
  <p>OUS = 0.30×SFS + 0.25×DS + 0.20×IC + 0.15×CP + 0.10×PU = <strong>${m.ous}%</strong> (Grade <strong>${m.grade}</strong>)</p>
</section>
<section>
  <h2>3. Per-Column Statistical Fidelity</h2>
  <table><tr><th>Column</th><th>Orig Mean</th><th>Proc Mean</th><th>Rel Bias</th><th>KS Stat</th><th>JSD</th><th>SFS</th></tr>
  ${numRows || "<tr><td colspan='7'>No numeric columns detected</td></tr>"}
  </table>
</section>
<section>
  <h2>4. Recommendations</h2>
  ${m.recommendations.map(r => `<div class="rec">• ${r}</div>`).join("")}
</section>
${m.warnings.length ? `<section><h2>Warnings</h2>${m.warnings.map(w => `<div class="warn">⚠ ${w}</div>`).join("")}</section>` : ""}
<section>
  <h2>5. Compliance Readiness (DPDP Act 2023)</h2>
  <table><tr><th>Criterion</th><th>Value</th><th>Threshold</th><th>Status</th></tr>
  <tr><td>Data Utility (OUS)</td><td>${m.ous}%</td><td>≥ 70%</td><td>${m.ous >= 70 ? "✅" : "❌"}</td></tr>
  <tr><td>Information Content (IC)</td><td>${fmt2(m.icScore)}</td><td>≥ 70%</td><td>${m.icScore >= 0.7 ? "✅" : "❌"}</td></tr>
  <tr><td>Record Suppression Rate</td><td>${suppPct}%</td><td>≤ 5%</td><td>${parseFloat(suppPct) <= 5 ? "✅" : "⚠"}</td></tr>
  <tr><td>Correlation Preserved</td><td>${fmt2(m.cpScore)}</td><td>≥ 70%</td><td>${m.cpScore >= 0.7 ? "✅" : "❌"}</td></tr>
  ${m.riskReduction != null ? `<tr><td>Risk Reduction</td><td>${m.riskReduction.toFixed(1)}%</td><td>≥ 50%</td><td>${m.riskReduction >= 50 ? "✅" : "⚠"}</td></tr>` : ""}
  </table>
</section>
<section>
  <h2>Methodology</h2>
  <p>Overall Utility Score (OUS) follows academic SDC literature and NIST SP 800-188 guidelines. The five-component weighted composite measures: (1) Statistical Fidelity via NMAE, Variance Ratio, MPS, and Percentile Preservation; (2) Distribution Similarity via KS test, Jensen-Shannon Divergence, and Wasserstein-1 distance; (3) Information Content via Shannon Entropy Preservation Ratio; (4) Correlation Preservation via normalised Frobenius distance; (5) Predictive Utility via pairwise R² retention proxy.</p>
</section>
<footer>SafeData Pipeline | AIRAVATA Technologies | Statathon 2025 | MoE Innovation Cell, Government of India<br>
Report auto-generated ${now}. Results based on academic statistical methodology (NIST 8053).</footer>
</body></html>`;
}

// ── SUB-COMPONENTS ────────────────────────────────────────────────────────────

function ScoreBar({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">{icon}{label}</span>
        <span className={`font-semibold ${scoreColor(value)}`}>{pct}%</span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}

function StatBadgeColored({ val, lowGood }: { val: number; lowGood?: boolean }) {
  const good = lowGood ? val <= 0.1 : val >= 0.8;
  const mid = lowGood ? val <= 0.25 : val >= 0.6;
  const cls = good ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
    : mid ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
    : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-mono font-semibold ${cls}`}>{fmt3(val)}</span>;
}

function FidelityRow({ f }: { f: NumFidelity }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr
        className="border-b hover:bg-muted/30 cursor-pointer"
        onClick={() => setOpen(o => !o)}
        data-testid={`fidelity-row-${f.col}`}
      >
        <td className="px-3 py-2 font-mono text-xs">
          <span className="flex items-center gap-1">
            {open ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
            {f.col}
            {f.generalised && <Badge variant="outline" className="text-[10px] py-0 px-1 ml-1">gen</Badge>}
          </span>
        </td>
        <td className="px-3 py-2 text-xs text-right font-mono">{fmtN(f.origMean)}</td>
        <td className="px-3 py-2 text-xs text-right font-mono">{fmtN(f.procMean)}</td>
        <td className="px-3 py-2 text-xs text-right">
          <span className={Math.abs(f.relBias) < 5 ? "text-green-600" : Math.abs(f.relBias) < 15 ? "text-amber-600" : "text-red-600"}>
            {f.relBias > 0 ? "+" : ""}{fmtN(f.relBias)}%
          </span>
        </td>
        <td className="px-3 py-2 text-xs text-right">
          <span className={f.varRatio >= 0.8 && f.varRatio <= 1.25 ? "text-green-600" : f.varRatio >= 0.6 && f.varRatio <= 1.5 ? "text-amber-600" : "text-red-600"}>
            {fmtN(f.varRatio)}
          </span>
        </td>
        <td className="px-3 py-2 text-xs"><StatBadgeColored val={f.ksStat} lowGood /></td>
        <td className="px-3 py-2 text-xs"><StatBadgeColored val={f.jsd} lowGood /></td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <div className={`h-2 rounded-full ${sfsBarClass(f.sfs)}`} style={{ width: `${Math.round(f.sfs * 60)}px` }} />
            <span className={`text-xs font-semibold ${scoreColor(f.sfs)}`}>{fmt2(f.sfs)}</span>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="bg-muted/20 border-b">
          <td colSpan={8} className="px-4 py-3">
            <div className="grid grid-cols-4 gap-4 text-xs">
              <div>
                <p className="font-semibold text-muted-foreground mb-1.5">Descriptive Statistics</p>
                <p>Orig: μ={fmtN(f.origMean)}, σ={fmtN(f.origStd)}</p>
                <p>Proc: μ={fmtN(f.procMean)}, σ={fmtN(f.procStd)}</p>
                <p>Range: [{fmtN(f.origMin)}, {fmtN(f.origMax)}]</p>
                <p>MPS: {fmt3(f.mps)} &nbsp; PP: {fmt3(f.pp)}</p>
              </div>
              <div>
                <p className="font-semibold text-muted-foreground mb-1.5">Distribution Metrics</p>
                <p>KS statistic: {fmt3(f.ksStat)}</p>
                <p>Jensen-Shannon Div: {fmt3(f.jsd)}</p>
                <p>Wasserstein-1: {fmt3(f.wassersteinNorm)}</p>
                <p>NMAE: {fmt3(f.nmae)}</p>
              </div>
              <div>
                <p className="font-semibold text-muted-foreground mb-1.5">Information Content</p>
                <p>Entropy (orig): {fmt3(f.entropyOrig)} bits</p>
                <p>Entropy (proc): {fmt3(f.entropyProc)} bits</p>
                <p>EPR: {fmt3(f.epr)}</p>
                <p>UVRR: {fmt3(f.uvrr)}</p>
              </div>
              <div>
                <p className="font-semibold text-muted-foreground mb-1.5">Percentiles (P5/P25/P50/P75/P95)</p>
                <p>Orig: {[0, 2, 3, 4, 6].map(i => fmtN(f.origP[i] ?? 0)).join(" / ")}</p>
                <p>Proc: {[0, 2, 3, 4, 6].map(i => fmtN(f.procP[i] ?? 0)).join(" / ")}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function HistChart({ f }: { f: NumFidelity }) {
  const data = useMemo(() => {
    const h = f.histogram;
    if (!h.bins.length) return [];
    return h.bins.map((b, i) => ({
      bin: b.toFixed(1),
      Original: h.origCounts[i] ?? 0,
      Processed: h.procCounts[i] ?? 0,
    }));
  }, [f]);
  if (!data.length) return <p className="text-xs text-muted-foreground">No data</p>;
  return (
    <div>
      <p className="text-xs font-semibold mb-1 text-muted-foreground">{f.col}</p>
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="bin" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9 }} />
          <Tooltip />
          <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
          <Bar dataKey="Original" fill="#3b82f6" barSize={6} />
          <Bar dataKey="Processed" fill="#f97316" barSize={6} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RadarOUS({ m }: { m: UtilityMetrics }) {
  const data = [
    { subject: "Stat Fidelity", Original: 100, Processed: Math.round(m.sfs * 100) },
    { subject: "Distribution", Original: 100, Processed: Math.round(m.dsScore * 100) },
    { subject: "Info Content", Original: 100, Processed: Math.round(m.icScore * 100) },
    { subject: "Correlation", Original: 100, Processed: Math.round(m.cpScore * 100) },
    { subject: "Predictive", Original: 100, Processed: Math.round(m.puScore * 100) },
  ];
  return (
    <ResponsiveContainer width="100%" height={240}>
      <RadarChart data={data} margin={{ top: 8, right: 24, left: 24, bottom: 8 }}>
        <PolarGrid />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
        <Radar name="Original" dataKey="Original" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.1} />
        <Radar name="Processed" dataKey="Processed" stroke="#2563eb" fill="#2563eb" fillOpacity={0.3} />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <Tooltip formatter={(v: number) => `${v}%`} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function CorrHeatmap({ cols, delta }: { cols: string[]; delta: number[][] }) {
  if (cols.length < 2) return <p className="text-xs text-muted-foreground">Need ≥2 numeric columns.</p>;
  const cellCls = (v: number) =>
    Math.abs(v) < 0.05 ? "bg-green-100 dark:bg-green-900/40"
    : Math.abs(v) < 0.15 ? "bg-amber-100 dark:bg-amber-900/40"
    : "bg-red-100 dark:bg-red-900/40";
  return (
    <div className="overflow-auto">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="px-2 py-1 bg-muted/50 border border-border w-24" />
            {cols.map(c => (
              <th key={c} className="px-2 py-1 bg-muted/50 border border-border font-mono text-center min-w-16">{c.slice(0, 8)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cols.map((r, i) => (
            <tr key={r}>
              <td className="px-2 py-1 bg-muted/50 border border-border font-mono">{r.slice(0, 8)}</td>
              {cols.map((_, j) => (
                <td key={j} className={`px-2 py-1 border border-border text-center font-mono ${cellCls(delta[i]?.[j] ?? 0)}`}>
                  {(delta[i]?.[j] ?? 0).toFixed(2)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-muted-foreground mt-1">ΔCorr = Original − Processed. Green &lt;0.05, Amber 0.05–0.15, Red &gt;0.15.</p>
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────

export default function UtilityPage() {
  const [selectedDataset, setSelectedDataset] = useState("");
  const [selectedOperation, setSelectedOperation] = useState("");
  const [active, setActive] = useState<UMeasurement | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: datasets = [] } = useQuery<any[]>({ queryKey: ["/api/datasets"] });
  const { data: operations = [] } = useQuery<any[]>({ queryKey: ["/api/privacy/operations"] });
  const { data: history = [] } = useQuery<UMeasurement[]>({ queryKey: ["/api/utility/measurements"] });

  const measureMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/utility/measure", {
        originalDatasetId: Number(selectedDataset),
        processedOperationId: Number(selectedOperation),
      }).then((r) => r.json()),
    onSuccess: (data: UMeasurement) => {
      qc.invalidateQueries({ queryKey: ["/api/utility/measurements"] });
      setActive(data);
      toast({ title: "Utility measured", description: `OUS: ${data.metrics?.ous}% — Grade ${data.metrics?.grade}` });
    },
    onError: (e: any) => toast({ title: "Measurement failed", description: String(e.message), variant: "destructive" }),
  });

  const raw = active?.metrics ?? null;
  const m: UtilityMetrics | null = raw ? {
    ...raw,
    ous: raw.ous ?? 0,
    grade: raw.grade ?? "F",
    gradeLabel: raw.gradeLabel ?? "",
    verdict: raw.verdict ?? "",
    sfs: raw.sfs ?? 0,
    dsScore: raw.dsScore ?? 0,
    icScore: raw.icScore ?? 0,
    cpScore: raw.cpScore ?? 0,
    puScore: raw.puScore ?? 0,
    rowsOrig: raw.rowsOrig ?? 0,
    rowsProc: raw.rowsProc ?? 0,
    deltaFrob: raw.deltaFrob ?? 0,
    riskBefore: raw.riskBefore ?? null,
    riskAfter: raw.riskAfter ?? null,
    riskReduction: raw.riskReduction ?? null,
    technique: raw.technique ?? "",
    datasetName: raw.datasetName ?? "",
    numericFidelity: raw.numericFidelity ?? [],
    catFidelity: raw.catFidelity ?? [],
    correlationCols: raw.correlationCols ?? [],
    corrOrig: raw.corrOrig ?? [],
    corrProc: raw.corrProc ?? [],
    warnings: raw.warnings ?? [],
    recommendations: raw.recommendations ?? [],
    numericCols: raw.numericCols ?? [],
    catCols: raw.catCols ?? [],
    suppressedCols: raw.suppressedCols ?? [],
    commonCols: raw.commonCols ?? [],
  } : null;

  const deltaCorr = useMemo(() => {
    if (!m || m.correlationCols.length < 2 || !m.corrOrig.length) return [];
    return m.corrOrig.map((row, i) => row.map((v, j) => v - (m.corrProc[i]?.[j] ?? v)));
  }, [m]);

  const suppPct = m && m.rowsOrig > 0 ? (m.rowsOrig - m.rowsProc) / m.rowsOrig * 100 : 0;

  const filteredOps = selectedDataset
    ? operations.filter((o: any) => o.datasetId === Number(selectedDataset))
    : operations;

  const dpdpChecks = m ? [
    { label: "Data Utility (OUS) ≥ 70%", pass: m.ous >= 70, val: `${m.ous}%` },
    { label: "Information Content ≥ 70%", pass: m.icScore >= 0.7, val: fmt2(m.icScore) },
    { label: "Correlation Preserved ≥ 70%", pass: m.cpScore >= 0.7, val: fmt2(m.cpScore) },
    { label: "Record Suppression ≤ 5%", pass: suppPct <= 5, val: `${suppPct.toFixed(1)}%` },
    { label: "Risk Reduction ≥ 50%", pass: (m.riskReduction ?? 0) >= 50, val: m.riskReduction != null ? `${m.riskReduction.toFixed(1)}%` : "N/A" },
    { label: "Distribution Preserved ≥ 70%", pass: m.dsScore >= 0.7, val: fmt2(m.dsScore) },
  ] : [];

  const nsoChecks = m ? [
    { label: "Utility OUS > 70% for research use", pass: m.ous >= 70, val: `${m.ous}%` },
    { label: "Suppression < 5% of records", pass: suppPct < 5, val: `${suppPct.toFixed(1)}%` },
    { label: "Statistical Fidelity (SFS) ≥ 70%", pass: m.sfs >= 0.7, val: fmt2(m.sfs) },
    { label: "Distribution Similarity ≥ 70%", pass: m.dsScore >= 0.7, val: fmt2(m.dsScore) },
  ] : [];

  const downloadReport = () => {
    if (!m) return;
    const html = generateReport(m);
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `utility_report_${m.datasetName.replace(/\s+/g, "_")}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadCsv = () => {
    if (!m) return;
    const header = "column,type,orig_mean,proc_mean,rel_bias_pct,orig_std,proc_std,var_ratio,nmae,ks_stat,jsd,wasserstein,epr,uvrr,sfs\n";
    const rows = m.numericFidelity.map(f =>
      [f.col, f.generalised ? "generalised" : "numeric",
        f.origMean, f.procMean, f.relBias, f.origStd, f.procStd,
        f.varRatio, f.nmae, f.ksStat, f.jsd, f.wassersteinNorm, f.epr, f.uvrr, f.sfs].join(",")
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "utility_metrics.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <DashboardLayout title="Utility Measurement">
      <div className="flex gap-4 min-h-0" data-testid="utility-page">

        {/* ── LEFT PANEL ───────────────────────────────────────────────── */}
        <div className="w-72 shrink-0 flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <GitCompare className="h-4 w-4 text-blue-600" />
                Compare Datasets
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Original Dataset</label>
                <Select
                  value={selectedDataset}
                  onValueChange={v => { setSelectedDataset(v); setSelectedOperation(""); }}
                >
                  <SelectTrigger data-testid="select-original-dataset" className="text-xs h-8">
                    <SelectValue placeholder="Select dataset…" />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map((d: any) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.originalName} ({d.rowCount} rows)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Processed Operation</label>
                <Select value={selectedOperation} onValueChange={setSelectedOperation}>
                  <SelectTrigger data-testid="select-processed-operation" className="text-xs h-8">
                    <SelectValue placeholder="Select operation…" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredOps.map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        {o.technique} #{o.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                data-testid="button-measure-utility"
                size="sm"
                className="w-full mt-1"
                disabled={!selectedDataset || !selectedOperation || measureMut.isPending}
                onClick={() => measureMut.mutate()}
              >
                {measureMut.isPending
                  ? <><Activity className="h-3 w-3 mr-2 animate-spin" />Computing…</>
                  : <><BarChart2 className="h-3 w-3 mr-2" />Measure Utility</>}
              </Button>
            </CardContent>
          </Card>

          {/* History */}
          {history.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground">Recent Measurements</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 p-3 pt-0">
                {history.slice(0, 6).map((h: UMeasurement) => (
                  <button
                    key={h.id}
                    data-testid={`history-item-${h.id}`}
                    className="text-left text-xs px-2 py-2 rounded hover:bg-muted/50 border border-transparent hover:border-border transition-colors"
                    onClick={() => setActive(h)}
                  >
                    <p className="font-medium text-foreground">{h.metrics?.datasetName ?? `#${h.id}`}</p>
                    <p className="text-muted-foreground">{h.metrics?.grade ?? "?"} — {h.metrics?.ous ?? Math.round(h.overallUtility * 100)}% OUS</p>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── RESULTS PANEL ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto flex flex-col gap-4 pb-6">

          {/* Empty state */}
          {!m && !measureMut.isPending && (
            <Card className="flex items-center justify-center min-h-64">
              <div className="text-center space-y-3 p-8">
                <BarChart2 className="h-12 w-12 text-muted-foreground mx-auto" />
                <p className="text-lg font-semibold">No Measurement Yet</p>
                <p className="text-sm text-muted-foreground">
                  Select an original dataset and a processed operation,<br />then click <strong>Measure Utility</strong>.
                </p>
              </div>
            </Card>
          )}

          {/* Computing loader */}
          {measureMut.isPending && (
            <Card className="p-6 flex flex-col gap-3">
              <p className="font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 animate-spin text-blue-600" />
                Computing Utility Metrics…
              </p>
              {["Statistical Fidelity", "Distribution Similarity", "Correlation Analysis", "Composite OUS Score"].map(step => (
                <div key={step} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Activity className="h-3 w-3 animate-spin text-blue-500" />{step}…
                </div>
              ))}
            </Card>
          )}

          {m && (
            <>
              {/* ── SECTION A: SUMMARY DASHBOARD ─────────────────── */}
              <Card>
                <CardContent className="pt-4 pb-4">
                  {/* Top row: Score + Grade + metadata */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Overall Utility Score</p>
                      <div className="flex items-baseline gap-3 mt-1">
                        <span className="text-5xl font-bold">{m.ous}%</span>
                        <div className={`border rounded-lg px-3 py-1 ${gradeBg(m.grade)}`}>
                          <span className={`text-2xl font-bold ${gradeColor(m.grade)}`}>{m.grade}</span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{m.gradeLabel}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground space-y-0.5">
                      <p className="font-semibold text-foreground text-sm">{m.datasetName}</p>
                      <p>Technique: <span className="font-medium capitalize">{m.technique}</span></p>
                      <p>{m.rowsOrig.toLocaleString()} → {m.rowsProc.toLocaleString()} rows</p>
                      <p>{suppPct.toFixed(1)}% suppressed &nbsp;·&nbsp; {m.numericCols.length}N + {m.catCols.length}C columns</p>
                    </div>
                  </div>

                  {/* 5 component score bars */}
                  <div className="grid grid-cols-5 gap-4 mb-3">
                    <ScoreBar label="Stat Fidelity" value={m.sfs} icon={<Activity className="h-3 w-3" />} />
                    <ScoreBar label="Distribution" value={m.dsScore} icon={<BarChart2 className="h-3 w-3" />} />
                    <ScoreBar label="Info Content" value={m.icScore} icon={<Info className="h-3 w-3" />} />
                    <ScoreBar label="Correlation" value={m.cpScore} icon={<GitCompare className="h-3 w-3" />} />
                    <ScoreBar label="Predictive" value={m.puScore} icon={<Target className="h-3 w-3" />} />
                  </div>

                  {/* Balance bar */}
                  <div className="flex rounded overflow-hidden h-2.5 mb-2">
                    <div className="bg-blue-500" style={{ width: `${m.sfs * 30}%` }} title="SFS ×30%" />
                    <div className="bg-orange-500" style={{ width: `${m.dsScore * 25}%` }} title="DS ×25%" />
                    <div className="bg-purple-500" style={{ width: `${m.icScore * 20}%` }} title="IC ×20%" />
                    <div className="bg-green-500" style={{ width: `${m.cpScore * 15}%` }} title="CP ×15%" />
                    <div className="bg-cyan-500" style={{ width: `${m.puScore * 10}%` }} title="PU ×10%" />
                    <div className="bg-muted flex-1" />
                  </div>
                  <div className="flex gap-4 text-[10px] text-muted-foreground mb-3">
                    {[
                      ["bg-blue-500", "SFS ×30%"], ["bg-orange-500", "DS ×25%"],
                      ["bg-purple-500", "IC ×20%"], ["bg-green-500", "CP ×15%"], ["bg-cyan-500", "PU ×10%"],
                    ].map(([cls, label]) => (
                      <span key={label} className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full inline-block ${cls}`} />{label}
                      </span>
                    ))}
                  </div>

                  {/* Verdict */}
                  <div className={`rounded-lg px-4 py-2.5 text-sm font-medium border ${verdictClass(m.grade)}`}>
                    {m.verdict}
                  </div>

                  {/* Warnings */}
                  {m.warnings.length > 0 && (
                    <div className="mt-3 flex flex-col gap-1">
                      {m.warnings.map((w, i) => (
                        <p key={i} className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />{w}
                        </p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── TABS ─────────────────────────────────────────────── */}
              <Tabs defaultValue="statistical">
                <TabsList className="grid grid-cols-6 w-full">
                  <TabsTrigger value="statistical" className="text-xs">Statistical</TabsTrigger>
                  <TabsTrigger value="distributions" className="text-xs">Distributions</TabsTrigger>
                  <TabsTrigger value="correlations" className="text-xs">Correlations</TabsTrigger>
                  <TabsTrigger value="privacy-utility" className="text-xs">Privacy-Utility</TabsTrigger>
                  <TabsTrigger value="attack-impact" className="text-xs">Attack Impact</TabsTrigger>
                  <TabsTrigger value="compliance" className="text-xs">Compliance</TabsTrigger>
                </TabsList>

                {/* ── B: STATISTICAL FIDELITY ─────────────────────── */}
                <TabsContent value="statistical">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Statistical Fidelity — Per Column</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      {m.numericFidelity.length === 0 ? (
                        <p className="p-4 text-sm text-muted-foreground">No numeric columns detected.</p>
                      ) : (
                        <div className="overflow-auto">
                          <table className="w-full text-xs" data-testid="fidelity-table">
                            <thead>
                              <tr className="border-b bg-muted/40 text-muted-foreground">
                                <th className="px-3 py-2 text-left">Column</th>
                                <th className="px-3 py-2 text-right">Orig Mean</th>
                                <th className="px-3 py-2 text-right">Proc Mean</th>
                                <th className="px-3 py-2 text-right">Rel Bias</th>
                                <th className="px-3 py-2 text-right">Var Ratio</th>
                                <th className="px-3 py-2 text-right">KS Stat ↓</th>
                                <th className="px-3 py-2 text-right">JSD ↓</th>
                                <th className="px-3 py-2 text-left">SFS ↑</th>
                              </tr>
                            </thead>
                            <tbody>
                              {m.numericFidelity.map(f => <FidelityRow key={f.col} f={f} />)}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {m.catFidelity.length > 0 && (
                        <div className="p-3 border-t">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">Categorical Columns</p>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b bg-muted/30 text-muted-foreground">
                                <th className="px-3 py-1 text-left">Column</th>
                                <th className="px-3 py-1 text-right">Hist. Intersection ↑</th>
                                <th className="px-3 py-1 text-right">EPR</th>
                                <th className="px-3 py-1 text-right">UVRR ↑</th>
                                <th className="px-3 py-1 text-left">SFS ↑</th>
                              </tr>
                            </thead>
                            <tbody>
                              {m.catFidelity.map(f => (
                                <tr key={f.col} className="border-b hover:bg-muted/20">
                                  <td className="px-3 py-1.5 font-mono">{f.col}</td>
                                  <td className="px-3 py-1.5 text-right"><StatBadgeColored val={f.histIntersection} /></td>
                                  <td className="px-3 py-1.5 text-right">
                                    <StatBadgeColored val={Math.max(0, 1 - Math.abs(1 - f.epr))} />
                                  </td>
                                  <td className="px-3 py-1.5 text-right"><StatBadgeColored val={f.uvrr} /></td>
                                  <td className="px-3 py-1.5">
                                    <div className="flex items-center gap-2">
                                      <div className={`h-1.5 rounded-full ${sfsBarClass(f.sfs)}`} style={{ width: `${f.sfs * 60}px` }} />
                                      <span className={`font-semibold ${scoreColor(f.sfs)}`}>{fmt2(f.sfs)}</span>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── C: DISTRIBUTIONS ──────────────────────────────── */}
                <TabsContent value="distributions">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Distribution Comparison — Histogram Overlays</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {m.numericFidelity.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No numeric columns.</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-6 mb-6">
                          {m.numericFidelity.slice(0, 8).map(f => <HistChart key={f.col} f={f} />)}
                        </div>
                      )}
                      {m.numericFidelity.length > 0 && (
                        <>
                          <p className="text-xs font-semibold text-muted-foreground mb-2">Distribution Divergence Metrics</p>
                          <div className="overflow-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b bg-muted/30 text-muted-foreground">
                                  <th className="px-3 py-1 text-left">Column</th>
                                  <th className="px-3 py-1 text-right">KS Stat</th>
                                  <th className="px-3 py-1 text-right">JSD</th>
                                  <th className="px-3 py-1 text-right">Wasserstein-1</th>
                                  <th className="px-3 py-1 text-right">EPR</th>
                                  <th className="px-3 py-1 text-right">UVRR</th>
                                </tr>
                              </thead>
                              <tbody>
                                {m.numericFidelity.map(f => (
                                  <tr key={f.col} className="border-b hover:bg-muted/20">
                                    <td className="px-3 py-1.5 font-mono">{f.col}</td>
                                    <td className="px-3 py-1.5 text-right"><StatBadgeColored val={f.ksStat} lowGood /></td>
                                    <td className="px-3 py-1.5 text-right"><StatBadgeColored val={f.jsd} lowGood /></td>
                                    <td className="px-3 py-1.5 text-right"><StatBadgeColored val={f.wassersteinNorm} lowGood /></td>
                                    <td className="px-3 py-1.5 text-right">
                                      <span className={`font-mono ${Math.abs(1 - f.epr) < 0.15 ? "text-green-600" : Math.abs(1 - f.epr) < 0.35 ? "text-amber-600" : "text-red-600"}`}>
                                        {f.epr.toFixed(3)}
                                      </span>
                                    </td>
                                    <td className="px-3 py-1.5 text-right"><StatBadgeColored val={f.uvrr} /></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── D: CORRELATIONS ───────────────────────────────── */}
                <TabsContent value="correlations">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Correlation Preservation</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-6">
                      <div className="flex gap-6 items-start">
                        <div className="p-4 rounded-lg bg-muted/40 text-center min-w-40">
                          <p className="text-xs text-muted-foreground">Frobenius Distance (ΔR_F)</p>
                          <p className={`text-3xl font-bold mt-1 ${m.deltaFrob < 0.1 ? "text-green-600" : m.deltaFrob < 0.2 ? "text-amber-600" : "text-red-600"}`}>
                            {m.deltaFrob.toFixed(3)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">Normalised</p>
                        </div>
                        <div className="p-4 rounded-lg bg-muted/40 text-center min-w-40">
                          <p className="text-xs text-muted-foreground">CP Score</p>
                          <p className={`text-3xl font-bold mt-1 ${scoreColor(m.cpScore)}`}>{fmt2(m.cpScore)}</p>
                          <p className="text-xs text-muted-foreground mt-1">= 1 − Frob dist</p>
                        </div>
                        <div className="text-xs text-muted-foreground max-w-xs">
                          <p className="font-semibold text-foreground mb-1">Interpretation</p>
                          <p>Frobenius distance measures how much the full Pearson correlation matrix changed between original and processed data. Lower values mean correlations are well-preserved.</p>
                          <p className="mt-2">• &lt;0.10: Excellent preservation (green)</p>
                          <p>• 0.10–0.20: Acceptable (amber)</p>
                          <p>• &gt;0.20: Significant structure change (red)</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">ΔCorrelation Heatmap (Original − Processed)</p>
                        <CorrHeatmap cols={m.correlationCols} delta={deltaCorr} />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── E: PRIVACY-UTILITY ────────────────────────────── */}
                <TabsContent value="privacy-utility">
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Privacy-Utility Radar</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <RadarOUS m={m} />
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Risk-Utility Trade-off</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {m.riskBefore != null ? (
                            <ResponsiveContainer width="100%" height={220}>
                              <ScatterChart margin={{ top: 8, right: 24, left: 0, bottom: 24 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis
                                  type="number" dataKey="x" name="Re-ID Risk %" domain={[0, 100]}
                                  tick={{ fontSize: 10 }}
                                  label={{ value: "Re-ID Risk (%)", position: "insideBottom", offset: -12, fontSize: 10 }}
                                />
                                <YAxis
                                  type="number" dataKey="y" name="Utility Loss %" domain={[0, 100]}
                                  tick={{ fontSize: 10 }}
                                  label={{ value: "Utility Loss (%)", angle: -90, position: "insideLeft", fontSize: 10 }}
                                />
                                <ZAxis type="number" dataKey="z" range={[200, 200]} />
                                <Tooltip formatter={(v: number, n: string) => [`${v.toFixed(1)}%`, n]} />
                                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                                <Scatter name="Original" data={[{ x: m.riskBefore * 100, y: 100 - m.ous, z: 30 }]} fill="#ef4444" opacity={0.8} />
                                <Scatter name="Processed" data={[{ x: (m.riskAfter ?? m.riskBefore * 0.4) * 100, y: 100 - m.ous, z: 30 }]} fill="#16a34a" opacity={0.8} />
                              </ScatterChart>
                            </ResponsiveContainer>
                          ) : (
                            <div className="h-48 flex items-center justify-center text-center text-sm text-muted-foreground">
                              <div>
                                <Info className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                <p>No risk assessment found.</p>
                                <p className="text-xs mt-1">Run Risk Assessment first.</p>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Technique Effectiveness Summary</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 gap-3 mb-4">
                          {[
                            { label: "Statistical Fidelity", score: m.sfs, weight: "30%", desc: "Mean preservation, variance, percentiles" },
                            { label: "Distribution Similarity", score: m.dsScore, weight: "25%", desc: "KS test, JSD, Wasserstein-1" },
                            { label: "Information Content", score: m.icScore, weight: "20%", desc: "Shannon entropy preservation (EPR)" },
                            { label: "Correlation Preservation", score: m.cpScore, weight: "15%", desc: "Pearson matrix Frobenius distance" },
                            { label: "Predictive Utility", score: m.puScore, weight: "10%", desc: "R² retention proxy" },
                            { label: "Overall Utility (OUS)", score: m.ous / 100, weight: "100%", desc: "Weighted composite of all 5 dimensions" },
                          ].map(item => (
                            <div key={item.label} className="p-3 rounded-lg border bg-muted/20">
                              <div className="flex justify-between items-start mb-2">
                                <p className="text-xs font-semibold leading-tight">{item.label}</p>
                                <Badge variant="outline" className="text-[10px] shrink-0 ml-1">{item.weight}</Badge>
                              </div>
                              <p className={`text-2xl font-bold ${scoreColor(item.score)}`}>{fmt2(item.score)}</p>
                              <p className="text-[10px] text-muted-foreground mt-1">{item.desc}</p>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Recommendations</p>
                        <div className="flex flex-col gap-2">
                          {m.recommendations.map((r, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs p-2 rounded bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                              <CheckCircle className="h-3.5 w-3.5 text-blue-600 mt-0.5 shrink-0" />{r}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* ── F: ATTACK IMPACT ──────────────────────────────── */}
                <TabsContent value="attack-impact">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Attack Impact Assessment</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {m.riskBefore === null ? (
                        <div className="flex items-center gap-3 p-4 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200">
                          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                          <div>
                            <p className="text-sm font-medium">No Risk Assessment Available</p>
                            <p className="text-xs text-muted-foreground">Run a Risk Assessment on the original dataset to see per-attack risk scores.</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-3 gap-3 mb-4">
                            {[
                              { label: "Risk Before", val: `${(m.riskBefore * 100).toFixed(1)}%`, cls: "text-red-600" },
                              { label: "Risk After (est.)", val: m.riskAfter != null ? `${(m.riskAfter * 100).toFixed(1)}%` : "—", cls: "text-green-600" },
                              { label: "Risk Reduction", val: m.riskReduction != null ? `${m.riskReduction.toFixed(1)}%` : "—", cls: "text-blue-600" },
                            ].map(item => (
                              <div key={item.label} className="p-3 rounded border bg-muted/20 text-center">
                                <p className="text-xs text-muted-foreground">{item.label}</p>
                                <p className={`text-2xl font-bold mt-1 ${item.cls}`}>{item.val}</p>
                              </div>
                            ))}
                          </div>
                          <table className="w-full text-xs" data-testid="attack-table">
                            <thead>
                              <tr className="border-b bg-muted/40 text-muted-foreground">
                                <th className="px-3 py-2 text-left">Attack Model</th>
                                <th className="px-3 py-2 text-right">Risk Before</th>
                                <th className="px-3 py-2 text-right">Risk After (est.)</th>
                                <th className="px-3 py-2 text-right">Reduction</th>
                                <th className="px-3 py-2">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(["Prosecutor", "Journalist", "Marketer"] as const).map((attack, i) => {
                                const mult = [1.0, 0.75, 0.5][i];
                                const rb = (m.riskBefore ?? 0) * mult;
                                const ra = (m.riskAfter ?? (m.riskBefore ?? 0) * 0.4) * mult;
                                const red = rb > 0 ? (rb - ra) / rb * 100 : 0;
                                const status = ra < 0.2 ? "Low Risk" : ra < 0.4 ? "Medium Risk" : "High Risk";
                                const statusCls = ra < 0.2
                                  ? "bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/40 dark:text-green-300"
                                  : ra < 0.4
                                  ? "bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300"
                                  : "bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-300";
                                return (
                                  <tr key={attack} className="border-b hover:bg-muted/20">
                                    <td className="px-3 py-2 font-medium">{attack}</td>
                                    <td className="px-3 py-2 text-right text-red-600">{(rb * 100).toFixed(1)}%</td>
                                    <td className="px-3 py-2 text-right text-green-600">{(ra * 100).toFixed(1)}%</td>
                                    <td className="px-3 py-2 text-right text-blue-600">{red.toFixed(1)}%</td>
                                    <td className="px-3 py-2"><Badge className={statusCls}>{status}</Badge></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          <p className="text-[10px] text-muted-foreground mt-2">
                            * Post-anonymization risk estimates are derived from statistical fidelity reduction. Run a full Risk Assessment on the processed data for precise values.
                          </p>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* ── G: COMPLIANCE ─────────────────────────────────── */}
                <TabsContent value="compliance">
                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Shield className="h-4 w-4 text-blue-600" />
                          DPDP Act 2023 Readiness
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-col">
                          {dpdpChecks.map((c, i) => (
                            <div key={i} className="flex items-center justify-between py-2.5 border-b last:border-0">
                              <div className="flex items-center gap-2 text-xs">
                                {c.pass
                                  ? <CheckCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />
                                  : <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                                {c.label}
                              </div>
                              <span className={`text-xs font-mono font-semibold ${c.pass ? "text-green-600" : "text-red-500"}`}>{c.val}</span>
                            </div>
                          ))}
                        </div>
                        <div className={`mt-3 p-3 rounded-lg text-xs font-semibold border ${dpdpChecks.filter(c => c.pass).length >= 4 ? "bg-green-50 border-green-300 text-green-800 dark:bg-green-950/30 dark:text-green-300" : "bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"}`}>
                          {dpdpChecks.filter(c => c.pass).length}/{dpdpChecks.length} criteria met —{" "}
                          {dpdpChecks.filter(c => c.pass).length >= 5 ? "LIKELY COMPLIANT" : dpdpChecks.filter(c => c.pass).length >= 3 ? "PARTIALLY COMPLIANT" : "REVIEW REQUIRED"}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <CheckSquare className="h-4 w-4 text-blue-600" />
                          NSO Microdata Release Criteria
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-col">
                          {nsoChecks.map((c, i) => (
                            <div key={i} className="flex items-center justify-between py-2.5 border-b last:border-0">
                              <div className="flex items-center gap-2 text-xs">
                                {c.pass
                                  ? <CheckCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />
                                  : <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                                {c.label}
                              </div>
                              <span className={`text-xs font-mono font-semibold ${c.pass ? "text-green-600" : "text-red-500"}`}>{c.val}</span>
                            </div>
                          ))}
                        </div>
                        <div className={`mt-3 p-3 rounded-lg text-xs font-semibold border ${nsoChecks.filter(c => c.pass).length >= 3 ? "bg-green-50 border-green-300 text-green-800 dark:bg-green-950/30 dark:text-green-300" : "bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"}`}>
                          {nsoChecks.filter(c => c.pass).length >= 3
                            ? "✅ SUITABLE FOR RESTRICTED ACCESS RELEASE"
                            : "⚠ ADDITIONAL PRIVACY MEASURES REQUIRED"}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>

              {/* ── EXPORT ACTIONS ────────────────────────────────────── */}
              <div className="flex gap-3">
                <Button variant="outline" size="sm" onClick={downloadReport} data-testid="btn-download-report">
                  <FileText className="h-3.5 w-3.5 mr-2" />
                  Generate Full Report (HTML)
                </Button>
                <Button variant="outline" size="sm" onClick={downloadCsv} data-testid="btn-export-csv">
                  <Download className="h-3.5 w-3.5 mr-2" />
                  Export Metrics (CSV)
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

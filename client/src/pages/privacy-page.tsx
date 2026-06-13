import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Shield, Lock, Database, Shuffle, Sparkles, Play, Loader2,
  CheckCircle, Download, Info, Network, Key, Server,
  GitMerge, BarChart3, ChevronRight, AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Dataset } from "@shared/schema";
import type { DataRow } from "@/lib/attacks/utils";
import type { PrivacyResult } from "@/lib/privacy/types";
import { downloadCSV } from "@/lib/privacy/types";
import { applyKAnonymity, applyLDiversity, applyTCloseness, applyRankSwapping, applyMicroaggregation, applyPRAM, applyTopBottomCoding } from "@/lib/privacy/sdc";
import { applyLaplace, applyGaussian, applyExponential } from "@/lib/privacy/dp";
import { applyStatisticalSDG, applyDPSDG } from "@/lib/privacy/synthetic";
import { applyHomomorphicEncryption, applySMPC } from "@/lib/privacy/crypto";
import { applyFederatedLearning } from "@/lib/privacy/federated";
import { ATTACK_MATRIX, ATTACK_COLUMNS, countMitigations, type MitigationLevel } from "@/lib/privacy/attackMatrix";

// ─── Technique catalogue ─────────────────────────────────────────────────────
const FAMILIES = [
  { id: "sdc",       label: "Statistical Disclosure Control", icon: Shield,    color: "text-blue-600 dark:text-blue-400" },
  { id: "dp",        label: "Differential Privacy",           icon: Lock,      color: "text-purple-600 dark:text-purple-400" },
  { id: "synthetic", label: "Synthetic Data Generation",      icon: Sparkles,  color: "text-emerald-600 dark:text-emerald-400" },
  { id: "crypto",    label: "Cryptographic PETs",             icon: Key,       color: "text-amber-600 dark:text-amber-400" },
  { id: "federated", label: "Federated Learning",             icon: Network,   color: "text-rose-600 dark:text-rose-400" },
  { id: "matrix",    label: "Attack Mitigation Matrix",       icon: BarChart3, color: "text-slate-600 dark:text-slate-400" },
] as const;

type FamilyId = typeof FAMILIES[number]["id"];

const SDC_TECHNIQUES = [
  { id: "k-anonymity",    label: "K-Anonymity",        subtitle: "Mondrian Greedy Partitioning",  needsQI: true,  needsSA: false },
  { id: "l-diversity",    label: "L-Diversity",        subtitle: "Entropy / Distinct / Recursive", needsQI: true,  needsSA: true  },
  { id: "t-closeness",    label: "T-Closeness",        subtitle: "Earth Mover's Distance (EMD)",  needsQI: true,  needsSA: true  },
  { id: "rank-swapping",  label: "Rank Swapping",      subtitle: "Rank-bounded value exchange",   needsQI: false, needsSA: false },
  { id: "microagg",       label: "Microaggregation",   subtitle: "MDAV centroid replacement",     needsQI: false, needsSA: false },
  { id: "pram",           label: "PRAM",               subtitle: "Post Randomisation Method",     needsQI: false, needsSA: false },
  { id: "topbottom",      label: "Top/Bottom Coding",  subtitle: "Percentile capping + noise",    needsQI: false, needsSA: false },
];
const DP_TECHNIQUES = [
  { id: "laplace",     label: "Laplace Mechanism",    subtitle: "ε-DP on numeric queries" },
  { id: "gaussian",    label: "Gaussian Mechanism",   subtitle: "(ε,δ)-DP relaxed guarantee" },
  { id: "exponential", label: "Exponential Mechanism",subtitle: "ε-DP for categorical outputs" },
];
const SDG_TECHNIQUES = [
  { id: "stat-sdg", label: "Statistical SDG",       subtitle: "Marginal distribution sampling" },
  { id: "dp-sdg",   label: "DP-SDG (DP-CTGAN)",    subtitle: "DP-SGD gradient clipping + noise" },
];
const CRYPTO_TECHNIQUES = [
  { id: "he",   label: "Homomorphic Encryption", subtitle: "Paillier additive HE (simulation)" },
  { id: "smpc", label: "Secure MPC (SMPC)",       subtitle: "Additive secret sharing" },
];
const FED_TECHNIQUES = [
  { id: "fedavg", label: "FedAvg / DP-FedAvg", subtitle: "Federated Averaging (McMahan et al.)" },
];

// ─── Math formula display ─────────────────────────────────────────────────────
const FORMULAS: Record<string, { title: string; latex: string; desc: string }> = {
  "k-anonymity":   { title: "K-Anonymity (Mondrian)", latex: "|E| ≥ k  for all equivalence classes E", desc: "Every individual is indistinguishable from at least k−1 others. Mondrian recursively splits on the widest-range QI column." },
  "l-diversity":   { title: "Entropy L-Diversity", latex: "−Σ p(s) log p(s) ≥ log(l)", desc: "Shannon entropy of sensitive attribute distribution per equivalence class must be ≥ log(l), preventing attribute-homogeneity attacks." },
  "t-closeness":   { title: "T-Closeness (EMD)", latex: "D[P, Q] ≤ t  (Earth Mover's Distance)", desc: "The distance between the local sensitive-attribute distribution P and the global distribution Q must not exceed t." },
  "rank-swapping": { title: "Rank Swapping", latex: "|rank(rᵢ) − rank(rⱼ)| ≤ p", desc: "Numeric values are swapped between pairs of records whose rank indices differ by at most p = swapFraction × N, preserving marginals." },
  "microagg":      { title: "Microaggregation (MDAV)", latex: "x̄ = (1/k) Σᵢ xᵢ  (cluster centroid)", desc: "Records are grouped into clusters of size ≥ k using MDAV. Each record's numeric values are replaced by the cluster centroid." },
  "pram":          { title: "PRAM Transition Matrix", latex: "M[i,j] = p_ret  if i=j;  (1−p_ret)/(|S|−1)  otherwise", desc: "Each categorical value is independently perturbed according to a Markov transition matrix M with retention probability p_ret." },
  "topbottom":     { title: "Top/Bottom Coding + Noise", latex: "v′ = clip(v, q_bot, q_top) + N(0, λ²·σ²)", desc: "Values outside [q_bot, q_top] are capped at those percentile thresholds. Optional Gaussian noise σ_noise = λ × col_std is added." },
  "laplace":       { title: "Laplace Mechanism", latex: "M(D) = f(D) + Lap(0, Δf/ε)  →  ε-DP", desc: "Noise drawn from Lap(0, Δf/ε) is added to each numeric value. Global sensitivity Δf = column range. Guarantees ε-differential privacy." },
  "gaussian":      { title: "Gaussian Mechanism", latex: "σ ≥ Δf · √(2 ln(1.25/δ)) / ε  →  (ε,δ)-DP", desc: "Gaussian N(0,σ²) noise provides (ε,δ)-DP. Weaker than Laplace per unit ε but often more numerically stable for composition." },
  "exponential":   { title: "Exponential Mechanism", latex: "P[output = r] ∝ exp(ε·u(D,r) / 2Δu)", desc: "Categorical outputs are sampled proportionally to exp(ε·utility/2Δu), where utility = normalised frequency. Gives ε-DP for categorical data." },
  "stat-sdg":      { title: "Statistical Marginal Sampling", latex: "x̃ ~ P̂(X)  (empirical marginal + Box-Muller)", desc: "New records are sampled independently from each column's empirical distribution. Optionally preserves pairwise Pearson correlations." },
  "dp-sdg":        { title: "DP-SDG (DP-SGD Gradient Clipping)", latex: "g̃ = (1/B) Σ [gt/max(1,‖gt‖/C)] + N(0,σ²C²I)", desc: "Gradients are clipped to norm C and Gaussian noise N(0,σ²C²I) is injected. σ ≥ C·√(2ln(1.25/δ))/ε gives (ε,δ)-DP on the generated model." },
  "he":            { title: "Paillier Homomorphic Encryption", latex: "E(m₁) · E(m₂) ≡ E(m₁ + m₂) (mod n²)", desc: "Additive partially-homomorphic encryption. Computations on ciphertexts equal encryption of the computed result — data is never decrypted at the analyst." },
  "smpc":          { title: "Additive Secret Sharing (Shamir)", latex: "s₁ + s₂ + … + sₖ ≡ v (mod P)  ∀P prime", desc: "Each value is split into k additive shares over a prime field. Any individual share is information-theoretically random. Threshold t shares reconstruct the original." },
  "fedavg":        { title: "Federated Averaging (FedAvg)", latex: "w_{t+1} = Σₖ (nₖ/n) · wₖₜ", desc: "Each node trains locally on its shard and sends only model updates (gradients). FedAvg computes the weighted average of local model weights across K nodes." },
};

// ─── Result summary component ─────────────────────────────────────────────────
function ResultCard({ result }: { result: PrivacyResult }) {
  const lossColor = result.informationLoss < 0.15 ? "text-emerald-600" : result.informationLoss < 0.35 ? "text-amber-500" : "text-rose-500";
  const lossLabel = result.informationLoss < 0.15 ? "Low" : result.informationLoss < 0.35 ? "Moderate" : "High";
  const retainedPct = result.originalCount > 0 ? (result.processedCount / result.originalCount * 100).toFixed(1) : "100";

  function downloadReport() {
    if (!result.report) return;
    const blob = new Blob([result.report], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.technique.replace(/\s+/g, "_")}_report.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Compliance badge + title */}
      {result.compliancePassed !== undefined && result.compliancePassed !== null && (
        <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
          result.compliancePassed
            ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30"
            : "border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30"
        }`}>
          <CheckCircle className={`h-5 w-5 shrink-0 ${result.compliancePassed ? "text-emerald-600" : "text-rose-600"}`} />
          <div className="flex-1">
            <p className={`text-sm font-semibold ${result.compliancePassed ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
              Compliance: {result.compliancePassed ? "PASS" : "FAIL"}
            </p>
            <p className="text-xs text-muted-foreground">{result.technique} · {result.family}</p>
          </div>
          <Badge variant="outline" className={`text-xs font-bold ${result.compliancePassed ? "border-emerald-400 text-emerald-700 dark:text-emerald-400" : "border-rose-400 text-rose-700 dark:text-rose-400"}`}>
            {result.compliancePassed ? "✓ PASS" : "✗ FAIL"}
          </Badge>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Information Loss</p>
          <p className={`text-xl font-bold ${lossColor}`}>{(result.informationLoss * 100).toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground">{lossLabel}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Records Retained</p>
          <p className="text-xl font-bold text-foreground">{retainedPct}%</p>
          <p className="text-xs text-muted-foreground">{result.processedCount} of {result.originalCount}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Suppressed</p>
          <p className="text-xl font-bold text-foreground">{result.recordsSuppressed}</p>
          <p className="text-xs text-muted-foreground">records removed</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Execution</p>
          <p className="text-xl font-bold text-foreground">{result.executionMs}ms</p>
          <p className="text-xs text-muted-foreground">{result.family}</p>
        </div>
      </div>

      {/* Interpretation */}
      {result.interpretation && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-4 py-3">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1 uppercase tracking-wide">Interpretation</p>
          <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">{result.interpretation}</p>
        </div>
      )}

      {/* Stats table */}
      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Algorithm Statistics
        </div>
        <div className="divide-y text-sm">
          {Object.entries(result.stats).map(([k, v]) => (
            <div key={k} className="flex justify-between px-4 py-2">
              <span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
              <span className={`font-mono text-xs font-medium max-w-[60%] text-right break-all ${
                String(v) === "YES" ? "text-emerald-600 dark:text-emerald-400" :
                String(v) === "NO"  ? "text-rose-600 dark:text-rose-400" : ""
              }`}>{String(v)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Per-column stats table */}
      {result.colStats && Object.keys(result.colStats).length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Per-Column Statistics
          </div>
          <ScrollArea className="h-[200px]">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/20">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">Column</th>
                    {Object.values(result.colStats)[0] && Object.keys(Object.values(result.colStats)[0]).map((metric) => (
                      <th key={metric} className="px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap">{metric}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.colStats).map(([col, metrics]) => (
                    <tr key={col} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-1.5 font-medium whitespace-nowrap">{col}</td>
                      {Object.values(metrics).map((v, mi) => (
                        <td key={mi} className="px-3 py-1.5 font-mono text-right whitespace-nowrap">{String(v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="space-y-2">
          {result.warnings.map((w, i) => (
            <div key={i} className="flex gap-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">{w}</p>
            </div>
          ))}
        </div>
      )}

      {/* Sample of processed data */}
      {result.processedData.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center justify-between">
            <span>Sample Output (first 5 records)</span>
            <Badge variant="outline" className="text-xs">{result.processedData.length} records</Badge>
          </div>
          <ScrollArea className="h-[160px]">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    {Object.keys(result.processedData[0]).slice(0, 8).map((col) => (
                      <th key={col} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.processedData.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      {Object.keys(result.processedData[0]).slice(0, 8).map((col) => (
                        <td key={col} className="px-3 py-1.5 font-mono whitespace-nowrap">{String(row[col] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => downloadCSV(result.processedData, `${result.technique.replace(/\s+/g, "_")}_output.csv`)}
          disabled={result.processedData.length === 0}
          data-testid="button-download-result"
        >
          <Download className="mr-2 h-4 w-4" />
          Download CSV ({result.processedData.length} records)
        </Button>
        {result.report && (
          <Button
            variant="outline"
            className="flex-1"
            onClick={downloadReport}
            data-testid="button-download-report"
          >
            <ChevronRight className="mr-2 h-4 w-4" />
            Download Report (HTML)
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Formula box ──────────────────────────────────────────────────────────────
function FormulaBox({ id }: { id: string }) {
  const f = FORMULAS[id];
  if (!f) return null;
  return (
    <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-3 space-y-1">
      <div className="flex items-center gap-2">
        <Info className="h-4 w-4 text-blue-500 shrink-0" />
        <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">{f.title}</p>
      </div>
      <code className="block text-xs font-mono bg-blue-100 dark:bg-blue-900/40 rounded px-2 py-1 text-blue-800 dark:text-blue-300">
        {f.latex}
      </code>
      <p className="text-xs text-blue-700 dark:text-blue-400">{f.desc}</p>
    </div>
  );
}

// ─── Attack mitigation badge ──────────────────────────────────────────────────
function MitigationBadge({ level }: { level: MitigationLevel }) {
  const styles: Record<MitigationLevel, string> = {
    Stops:   "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
    Partial: "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    Fails:   "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800",
    "N/A":   "bg-muted text-muted-foreground",
  };
  return <span className={`inline-block text-xs font-medium border rounded px-1.5 py-0.5 ${styles[level]}`}>{level}</span>;
}

// ─── Technique selector list ──────────────────────────────────────────────────
function TechList({ items, selected, onSelect }: {
  items: { id: string; label: string; subtitle: string }[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-1">
      {items.map((tech) => (
        <div
          key={tech.id}
          className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
            selected === tech.id ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/50 border border-transparent"
          }`}
          onClick={() => onSelect(tech.id)}
          data-testid={`technique-${tech.id}`}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{tech.label}</p>
            <p className="text-xs text-muted-foreground truncate">{tech.subtitle}</p>
          </div>
          {selected === tech.id && <CheckCircle className="h-4 w-4 text-primary shrink-0" />}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function PrivacyPage() {
  const { toast } = useToast();

  // ── Dataset selection ──────────────────────────────────────────────────────
  const [selectedDataset, setSelectedDataset] = useState<string>("");
  const [quasiIdentifiers, setQuasiIdentifiers] = useState<string[]>([]);
  const [sensitiveAttr, setSensitiveAttr] = useState<string>("");
  const [targetCols, setTargetCols] = useState<string[]>([]);

  const { data: datasets } = useQuery<Dataset[]>({ queryKey: ["/api/datasets"] });
  const { data: datasetFull } = useQuery<{ data: DataRow[] }>({
    queryKey: ["/api/data", selectedDataset],
    enabled: !!selectedDataset,
  });
  const rawData: DataRow[] = (datasetFull?.data as DataRow[]) ?? [];
  const selectedDS = datasets?.find((d) => d.id.toString() === selectedDataset);
  const allCols = selectedDS?.columns ?? [];

  // ── UI state ───────────────────────────────────────────────────────────────
  const [family, setFamily] = useState<FamilyId>("sdc");
  const [sdcTech, setSdcTech]         = useState("k-anonymity");
  const [dpTech, setDpTech]           = useState("laplace");
  const [sdgTech, setSdgTech]         = useState("stat-sdg");
  const [cryptoTech, setCryptoTech]   = useState("he");
  const [fedTech]                     = useState("fedavg");

  // ── Results ────────────────────────────────────────────────────────────────
  const [result, setResult] = useState<PrivacyResult | null>(null);
  const [running, setRunning] = useState(false);

  // ── SDC parameters ─────────────────────────────────────────────────────────
  const [kVal,            setKVal]            = useState([5]);
  const [suppLimit,       setSuppLimit]       = useState([5]);   // %
  const [lVal,            setLVal]            = useState([3]);
  const [lMethod,         setLMethod]         = useState<"entropy"|"distinct"|"recursive">("entropy");
  const [lKBase,          setLKBase]          = useState([3]);   // underlying k for l-diversity
  const [cRecursive,      setCRecursive]      = useState([0.5]); // c for recursive variant
  const [tVal,            setTVal]            = useState([0.3]);
  const [tKBase,          setTKBase]          = useState([3]);   // underlying k for t-closeness
  const [swapFrac,        setSwapFrac]        = useState([0.1]);
  const [microK,          setMicroK]          = useState([5]);
  const [microDist,       setMicroDist]       = useState<"euclidean"|"manhattan">("euclidean");
  const [pramRetention,   setPramRetention]   = useState([0.7]);
  const [pramVariant,     setPramVariant]     = useState<"simple"|"unbiased">("simple");
  const [topPct,          setTopPct]          = useState([95]);
  const [botPct,          setBotPct]          = useState([5]);
  const [addNoise,        setAddNoise]        = useState(false);
  const [noiseLevel,      setNoiseLevel]      = useState([0.1]);

  // ── DP parameters ──────────────────────────────────────────────────────────
  const [epsilon,    setEpsilon]    = useState([1.0]);
  const [delta,      setDelta]      = useState([1e-5]);

  // ── SDG parameters ─────────────────────────────────────────────────────────
  const [synthSize,   setSynthSize]   = useState([100]);
  const [preserveCorr, setPreserveCorr] = useState(true);
  const [dpSgdClip,   setDpSgdClip]   = useState([1.0]);

  // ── Crypto parameters ──────────────────────────────────────────────────────
  const [heKeySize,    setHeKeySize]    = useState("1024");
  const [smpcShares,   setSmpcShares]   = useState([3]);
  const [smpcThreshold,setSmpcThreshold]= useState([2]);

  // ── Federated parameters ───────────────────────────────────────────────────
  const [fedNodes,  setFedNodes]   = useState([3]);
  const [fedRounds, setFedRounds]  = useState([5]);
  const [fedDP,     setFedDP]      = useState(false);
  const [fedEps,    setFedEps]     = useState([2.0]);
  const [fedGenSynth, setFedGenSynth] = useState(true);

  // ── Column toggles ─────────────────────────────────────────────────────────
  const toggleQI = (col: string) =>
    setQuasiIdentifiers((p) => p.includes(col) ? p.filter((c) => c !== col) : [...p, col]);
  const toggleTarget = (col: string) =>
    setTargetCols((p) => p.includes(col) ? p.filter((c) => c !== col) : [...p, col]);

  // On dataset change: reset selections
  const handleDatasetChange = (id: string) => {
    setSelectedDataset(id);
    setQuasiIdentifiers([]);
    setSensitiveAttr("");
    setTargetCols([]);
    setResult(null);
  };

  // ── Run algorithm ──────────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    if (rawData.length === 0) {
      toast({ title: "No data", description: "Select a dataset first.", variant: "destructive" });
      return;
    }

    const activeTech =
      family === "sdc" ? sdcTech :
      family === "dp"  ? dpTech  :
      family === "synthetic" ? sdgTech :
      family === "crypto"    ? cryptoTech :
      fedTech;

    // Validate required columns
    const needsQI  = [...SDC_TECHNIQUES].find((t) => t.id === activeTech)?.needsQI;
    const needsSA  = [...SDC_TECHNIQUES].find((t) => t.id === activeTech)?.needsSA;
    if (needsQI && quasiIdentifiers.length === 0) {
      toast({ title: "Select quasi-identifiers", description: "This technique requires at least one QI column.", variant: "destructive" });
      return;
    }
    if (needsSA && !sensitiveAttr) {
      toast({ title: "Select sensitive attribute", description: "This technique requires a sensitive attribute.", variant: "destructive" });
      return;
    }
    const cols = targetCols.length > 0 ? targetCols : allCols;

    setRunning(true);
    setResult(null);
    await new Promise((r) => setTimeout(r, 30)); // yield to re-render

    try {
      let res: PrivacyResult;

      if (family === "sdc") {
        switch (sdcTech) {
          case "k-anonymity":
            res = applyKAnonymity(rawData, quasiIdentifiers, kVal[0], suppLimit[0] / 100);
            break;
          case "l-diversity":
            res = applyLDiversity(rawData, quasiIdentifiers, sensitiveAttr, lVal[0], lMethod, lKBase[0], cRecursive[0]);
            break;
          case "t-closeness":
            res = applyTCloseness(rawData, quasiIdentifiers, sensitiveAttr, tVal[0], tKBase[0]);
            break;
          case "rank-swapping":
            res = applyRankSwapping(rawData, cols, swapFrac[0]);
            break;
          case "microagg":
            res = applyMicroaggregation(rawData, cols, microK[0], microDist);
            break;
          case "pram":
            res = applyPRAM(rawData, cols, pramRetention[0], pramVariant);
            break;
          case "topbottom":
            res = applyTopBottomCoding(rawData, cols, topPct[0], botPct[0], addNoise, noiseLevel[0]);
            break;
          default:
            throw new Error("Unknown SDC technique");
        }
      } else if (family === "dp") {
        switch (dpTech) {
          case "laplace":
            res = applyLaplace(rawData, epsilon[0], cols);
            break;
          case "gaussian":
            res = applyGaussian(rawData, epsilon[0], delta[0], cols);
            break;
          case "exponential":
            res = applyExponential(rawData, epsilon[0], cols);
            break;
          default:
            throw new Error("Unknown DP technique");
        }
      } else if (family === "synthetic") {
        switch (sdgTech) {
          case "stat-sdg":
            res = applyStatisticalSDG(rawData, synthSize[0], preserveCorr);
            break;
          case "dp-sdg":
            res = applyDPSDG(rawData, epsilon[0], delta[0], synthSize[0], dpSgdClip[0]);
            break;
          default:
            throw new Error("Unknown SDG technique");
        }
      } else if (family === "crypto") {
        switch (cryptoTech) {
          case "he":
            res = applyHomomorphicEncryption(rawData, parseInt(heKeySize));
            break;
          case "smpc":
            res = applySMPC(rawData, smpcShares[0], smpcThreshold[0]);
            break;
          default:
            throw new Error("Unknown crypto technique");
        }
      } else {
        res = applyFederatedLearning(rawData, fedNodes[0], fedRounds[0], fedDP ? fedEps[0] : null, fedGenSynth);
      }

      setResult(res!);
      toast({ title: `${res!.technique} complete`, description: `${res!.processedCount} records processed in ${res!.executionMs}ms.` });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Processing failed.", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }, [family, sdcTech, dpTech, sdgTech, cryptoTech, fedTech, rawData, quasiIdentifiers, sensitiveAttr, targetCols, allCols, kVal, suppLimit, lVal, lMethod, lKBase, cRecursive, tVal, tKBase, swapFrac, microK, microDist, pramRetention, pramVariant, topPct, botPct, addNoise, noiseLevel, epsilon, delta, synthSize, preserveCorr, dpSgdClip, heKeySize, smpcShares, smpcThreshold, fedNodes, fedRounds, fedDP, fedEps, fedGenSynth, toast]);

  // ─── Shared column pickers ─────────────────────────────────────────────────
  const activeTechId =
    family === "sdc"       ? sdcTech :
    family === "dp"        ? dpTech  :
    family === "synthetic" ? sdgTech :
    family === "crypto"    ? cryptoTech :
    "fedavg";

  const techniqueNeedsQI = SDC_TECHNIQUES.find((t) => t.id === activeTechId)?.needsQI ?? false;
  const techniqueNeedsSA = SDC_TECHNIQUES.find((t) => t.id === activeTechId)?.needsSA ?? false;
  const techniqueNeedsTarget = ["rank-swapping", "microagg", "pram", "topbottom"].includes(activeTechId)
    || family === "dp" || (family === "synthetic" && sdgTech === "dp-sdg")
    || (family === "synthetic" && sdgTech === "stat-sdg");

  return (
    <DashboardLayout title="Privacy Enhancement" breadcrumbs={[{ label: "Privacy Enhancement" }]}>
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* ── LEFT PANEL ──────────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Dataset selector */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Dataset</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={selectedDataset} onValueChange={handleDatasetChange}>
                <SelectTrigger data-testid="select-dataset-privacy">
                  <SelectValue placeholder="Choose a dataset…" />
                </SelectTrigger>
                <SelectContent>
                  {datasets?.map((d) => (
                    <SelectItem key={d.id} value={d.id.toString()}>{d.originalName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedDS && (
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{selectedDS.rowCount} rows</Badge>
                  <Badge variant="outline">{allCols.length} cols</Badge>
                  {rawData.length === 0 && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</span>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Column configuration */}
          {selectedDS && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Column Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* QI columns */}
                {(techniqueNeedsQI || family === "sdc") && (
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wide">Quasi-Identifiers (QI)</Label>
                    <ScrollArea className="h-[110px] rounded-md border p-2">
                      <div className="space-y-1">
                        {allCols.map((col) => (
                          <div key={col} className="flex items-center gap-2 py-0.5">
                            <Checkbox
                              id={`qi-${col}`}
                              checked={quasiIdentifiers.includes(col)}
                              onCheckedChange={() => toggleQI(col)}
                            />
                            <label htmlFor={`qi-${col}`} className="text-xs cursor-pointer">{col}</label>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                {/* Sensitive attribute */}
                {(techniqueNeedsSA || family === "sdc") && (
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wide">Sensitive Attribute</Label>
                    <Select value={sensitiveAttr} onValueChange={setSensitiveAttr}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select attribute…" />
                      </SelectTrigger>
                      <SelectContent>
                        {allCols.map((col) => (
                          <SelectItem key={col} value={col}>{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Target columns for numeric perturbation */}
                {(techniqueNeedsTarget && family !== "sdc") && (
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wide">
                      Target Columns <span className="font-normal text-muted-foreground">(all = none selected)</span>
                    </Label>
                    <ScrollArea className="h-[110px] rounded-md border p-2">
                      <div className="space-y-1">
                        {allCols.map((col) => (
                          <div key={col} className="flex items-center gap-2 py-0.5">
                            <Checkbox
                              id={`tgt-${col}`}
                              checked={targetCols.includes(col)}
                              onCheckedChange={() => toggleTarget(col)}
                            />
                            <label htmlFor={`tgt-${col}`} className="text-xs cursor-pointer">{col}</label>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                {/* For SDC techniques needing target cols */}
                {(family === "sdc" && ["rank-swapping","microagg","pram","topbottom"].includes(sdcTech)) && (
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wide">
                      Target Columns <span className="font-normal text-muted-foreground">(all = none selected)</span>
                    </Label>
                    <ScrollArea className="h-[110px] rounded-md border p-2">
                      <div className="space-y-1">
                        {allCols.map((col) => (
                          <div key={col} className="flex items-center gap-2 py-0.5">
                            <Checkbox
                              id={`tgt2-${col}`}
                              checked={targetCols.includes(col)}
                              onCheckedChange={() => toggleTarget(col)}
                            />
                            <label htmlFor={`tgt2-${col}`} className="text-xs cursor-pointer">{col}</label>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── RIGHT PANEL ─────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <Tabs value={family} onValueChange={(v) => { setFamily(v as FamilyId); setResult(null); }}>
            <TabsList className="w-full h-auto flex flex-wrap gap-1 p-1">
              {FAMILIES.map((f) => (
                <TabsTrigger key={f.id} value={f.id} className="flex items-center gap-1.5 text-xs" data-testid={`family-tab-${f.id}`}>
                  <f.icon className={`h-3.5 w-3.5 ${f.color}`} />
                  <span className="hidden sm:inline">{f.label}</span>
                  <span className="sm:hidden">{f.label.split(" ")[0]}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {/* ══ FAMILY 1: SDC ══════════════════════════════════════════════ */}
            <TabsContent value="sdc" className="mt-4">
              <div className="grid gap-4 md:grid-cols-[200px_1fr]">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Technique</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TechList items={SDC_TECHNIQUES} selected={sdcTech} onSelect={(id) => { setSdcTech(id); setResult(null); }} />
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Shield className="h-4 w-4 text-blue-500" />
                        {SDC_TECHNIQUES.find((t) => t.id === sdcTech)?.label} Parameters
                      </CardTitle>
                      <CardDescription>{SDC_TECHNIQUES.find((t) => t.id === sdcTech)?.subtitle}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <FormulaBox id={sdcTech} />

                      {/* K-Anonymity */}
                      {sdcTech === "k-anonymity" && (<>
                        <SliderField label="K Value" value={kVal} onChange={setKVal} min={2} max={25} step={1} format={(v) => String(v)} helpText={`Each record hidden in a group of ≥ ${kVal[0]} identical QI tuples`} />
                        <SliderField label="Suppression Limit" value={suppLimit} onChange={setSuppLimit} min={0} max={30} step={1} format={(v) => `${v}%`} helpText="Maximum % of records to delete if they cannot form a group of size k" />
                      </>)}

                      {/* L-Diversity */}
                      {sdcTech === "l-diversity" && (<>
                        <SliderField label="L Value" value={lVal} onChange={setLVal} min={2} max={10} step={1} format={(v) => String(v)} helpText={`Each equivalence class must have ≥ ${lVal[0]} well-represented sensitive values`} />
                        <SliderField label="Underlying K" value={lKBase} onChange={setLKBase} min={2} max={15} step={1} format={(v) => String(v)} helpText="K-Anonymity base applied before checking l-diversity (k ≤ l recommended)" />
                        <div className="space-y-2">
                          <Label className="text-sm">Variant</Label>
                          <RadioGroup value={lMethod} onValueChange={(v) => setLMethod(v as typeof lMethod)} className="space-y-1">
                            {[["entropy","Entropy  −Σ p·log(p) ≥ log(l)"],["distinct","Distinct  |S_vals| ≥ l"],["recursive","Recursive  (c,l)-diversity"]].map(([v, label]) => (
                              <div key={v} className="flex items-center gap-2">
                                <RadioGroupItem value={v} id={`lm-${v}`} />
                                <label htmlFor={`lm-${v}`} className="text-xs cursor-pointer font-mono">{label}</label>
                              </div>
                            ))}
                          </RadioGroup>
                        </div>
                        {lMethod === "recursive" && (
                          <SliderField label="c (Recursive)" value={cRecursive} onChange={setCRecursive} min={0.1} max={1} step={0.05} format={(v) => v.toFixed(2)} helpText={`r₁ < c × (r₂ + r₃ + …). Smaller c = stricter constraint.`} />
                        )}
                      </>)}

                      {/* T-Closeness */}
                      {sdcTech === "t-closeness" && (<>
                        <SliderField label="T Threshold" value={tVal} onChange={setTVal} min={0.05} max={1} step={0.05} format={(v) => v.toFixed(2)} helpText={`EMD(local, global) ≤ ${tVal[0].toFixed(2)} — lower = stricter`} />
                        <SliderField label="Underlying K" value={tKBase} onChange={setTKBase} min={2} max={15} step={1} format={(v) => String(v)} helpText="K-Anonymity base applied before checking t-closeness" />
                      </>)}

                      {/* Rank Swapping */}
                      {sdcTech === "rank-swapping" && (
                        <SliderField label="Swap Fraction" value={swapFrac} onChange={setSwapFrac} min={0.02} max={0.5} step={0.01} format={(v) => `${(v * 100).toFixed(0)}%`} helpText={`Max rank distance p = ${Math.round(swapFrac[0] * (rawData.length || 100))} records. Larger = more privacy, more distortion.`} />
                      )}

                      {/* Microaggregation */}
                      {sdcTech === "microagg" && (<>
                        <SliderField label="Cluster Size (k)" value={microK} onChange={setMicroK} min={2} max={20} step={1} format={(v) => String(v)} helpText="Minimum cluster size for MDAV. Each cluster's values are replaced with the centroid." />
                        <div className="space-y-2">
                          <Label className="text-sm">Distance Metric</Label>
                          <RadioGroup value={microDist} onValueChange={(v) => setMicroDist(v as typeof microDist)} className="flex gap-4">
                            {[["euclidean","Euclidean (L2)"],["manhattan","Manhattan (L1)"]].map(([v, label]) => (
                              <div key={v} className="flex items-center gap-2">
                                <RadioGroupItem value={v} id={`md-${v}`} />
                                <label htmlFor={`md-${v}`} className="text-xs cursor-pointer">{label}</label>
                              </div>
                            ))}
                          </RadioGroup>
                        </div>
                      </>)}

                      {/* PRAM */}
                      {sdcTech === "pram" && (<>
                        <SliderField label="Retention Probability" value={pramRetention} onChange={setPramRetention} min={0.1} max={0.99} step={0.01} format={(v) => v.toFixed(2)} helpText={`P(keep original) = ${pramRetention[0].toFixed(2)}, P(perturb) = ${(1 - pramRetention[0]).toFixed(2)}`} />
                        <div className="space-y-2">
                          <Label className="text-sm">PRAM Variant</Label>
                          <RadioGroup value={pramVariant} onValueChange={(v) => setPramVariant(v as typeof pramVariant)} className="flex gap-4">
                            {[["simple","Simple PRAM"],["unbiased","Unbiased PRAM"]].map(([v, label]) => (
                              <div key={v} className="flex items-center gap-2">
                                <RadioGroupItem value={v} id={`pv-${v}`} />
                                <label htmlFor={`pv-${v}`} className="text-xs cursor-pointer">{label}</label>
                              </div>
                            ))}
                          </RadioGroup>
                          <p className="text-xs text-muted-foreground">Unbiased: post-processing correction to restore marginal distributions</p>
                        </div>
                      </>)}

                      {/* Top/Bottom Coding */}
                      {sdcTech === "topbottom" && (<>
                        <SliderField label="Top Percentile Cap" value={topPct} onChange={setTopPct} min={80} max={99} step={1} format={(v) => `${v}th`} helpText="Values above this percentile are capped" />
                        <SliderField label="Bottom Percentile Cap" value={botPct} onChange={setBotPct} min={1} max={20} step={1} format={(v) => `${v}th`} helpText="Values below this percentile are capped" />
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm">Add Gaussian Noise</Label>
                            <p className="text-xs text-muted-foreground">Inject N(0, λ²σ²) noise after coding</p>
                          </div>
                          <Switch checked={addNoise} onCheckedChange={setAddNoise} />
                        </div>
                        {addNoise && (
                          <SliderField label="Noise Level (λ)" value={noiseLevel} onChange={setNoiseLevel} min={0.01} max={0.5} step={0.01} format={(v) => v.toFixed(2)} helpText={`σ_noise = ${noiseLevel[0].toFixed(2)} × column_std`} />
                        )}
                      </>)}

                      <RunButton running={running} onRun={handleRun} disabled={!selectedDataset || rawData.length === 0} />
                    </CardContent>
                  </Card>
                  {result && <ResultCard result={result} />}
                </div>
              </div>
            </TabsContent>

            {/* ══ FAMILY 2: DIFFERENTIAL PRIVACY ═════════════════════════════ */}
            <TabsContent value="dp" className="mt-4">
              <div className="grid gap-4 md:grid-cols-[200px_1fr]">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Mechanism</CardTitle></CardHeader>
                  <CardContent>
                    <TechList items={DP_TECHNIQUES} selected={dpTech} onSelect={(id) => { setDpTech(id); setResult(null); }} />
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Lock className="h-4 w-4 text-purple-500" />
                        {DP_TECHNIQUES.find((t) => t.id === dpTech)?.label} Parameters
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <FormulaBox id={dpTech} />

                      <SliderField label="Privacy Budget (ε)" value={epsilon} onChange={setEpsilon} min={0.01} max={10} step={0.01} format={(v) => v.toFixed(2)} helpText={`ε = ${epsilon[0].toFixed(2)} — Lower = stronger privacy + more noise. ε < 1 = strong, ε > 5 = weak.`} />

                      {dpTech === "gaussian" && (
                        <div className="space-y-2">
                          <Label className="text-sm">Delta (δ)</Label>
                          <RadioGroup value={String(delta[0])} onValueChange={(v) => setDelta([parseFloat(v)])} className="flex flex-wrap gap-3">
                            {[["1e-5","1×10⁻⁵"],["1e-6","1×10⁻⁶"],["1e-7","1×10⁻⁷"],["1e-8","1×10⁻⁸"]].map(([v, label]) => (
                              <div key={v} className="flex items-center gap-1.5">
                                <RadioGroupItem value={v} id={`delta-${v}`} />
                                <label htmlFor={`delta-${v}`} className="text-xs font-mono cursor-pointer">{label}</label>
                              </div>
                            ))}
                          </RadioGroup>
                          <p className="text-xs text-muted-foreground">σ ≥ Δf·√(2 ln(1.25/δ))/ε = {(() => { const d = delta[0]; return (Math.sqrt(2 * Math.log(1.25 / d)) / epsilon[0]).toFixed(3); })()} × Δf</p>
                        </div>
                      )}

                      {dpTech === "exponential" && (
                        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                          <p className="font-semibold text-foreground">Categorical columns only</p>
                          <p>The Exponential Mechanism samples from all possible output values with probability ∝ exp(ε·u/2Δu). Select categorical target columns on the left.</p>
                        </div>
                      )}

                      <RunButton running={running} onRun={handleRun} disabled={!selectedDataset || rawData.length === 0} />
                    </CardContent>
                  </Card>
                  {result && <ResultCard result={result} />}
                </div>
              </div>
            </TabsContent>

            {/* ══ FAMILY 3: SYNTHETIC DATA ════════════════════════════════════ */}
            <TabsContent value="synthetic" className="mt-4">
              <div className="grid gap-4 md:grid-cols-[200px_1fr]">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Method</CardTitle></CardHeader>
                  <CardContent>
                    <TechList items={SDG_TECHNIQUES} selected={sdgTech} onSelect={(id) => { setSdgTech(id); setResult(null); }} />
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Sparkles className="h-4 w-4 text-emerald-500" />
                        {SDG_TECHNIQUES.find((t) => t.id === sdgTech)?.label} Parameters
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <FormulaBox id={sdgTech} />

                      <SliderField label="Output Size" value={synthSize} onChange={setSynthSize} min={25} max={200} step={5} format={(v) => `${v}%`} helpText={`Generate ${Math.round((rawData.length || 100) * synthSize[0] / 100)} records (${synthSize[0]}% of original)`} />

                      {sdgTech === "stat-sdg" && (
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-sm">Preserve Correlations</Label>
                            <p className="text-xs text-muted-foreground">Retain pairwise Pearson correlations during sampling</p>
                          </div>
                          <Switch checked={preserveCorr} onCheckedChange={setPreserveCorr} />
                        </div>
                      )}

                      {sdgTech === "dp-sdg" && (<>
                        <SliderField label="Privacy Budget (ε)" value={epsilon} onChange={setEpsilon} min={0.1} max={10} step={0.1} format={(v) => v.toFixed(1)} helpText="ε for DP-SGD gradient clipping noise calibration" />
                        <div className="space-y-2">
                          <Label className="text-sm">Delta (δ)</Label>
                          <RadioGroup value={String(delta[0])} onValueChange={(v) => setDelta([parseFloat(v)])} className="flex flex-wrap gap-3">
                            {[["1e-5","1×10⁻⁵"],["1e-6","1×10⁻⁶"]].map(([v, label]) => (
                              <div key={v} className="flex items-center gap-1.5">
                                <RadioGroupItem value={v} id={`sdg-delta-${v}`} />
                                <label htmlFor={`sdg-delta-${v}`} className="text-xs font-mono cursor-pointer">{label}</label>
                              </div>
                            ))}
                          </RadioGroup>
                        </div>
                        <SliderField label="Gradient Clipping Norm (C)" value={dpSgdClip} onChange={setDpSgdClip} min={0.1} max={5} step={0.1} format={(v) => v.toFixed(1)} helpText="Gradient clip threshold C. Noise σ ≥ C·√(2ln(1.25/δ))/ε" />
                      </>)}

                      <RunButton running={running} onRun={handleRun} disabled={!selectedDataset || rawData.length === 0} />
                    </CardContent>
                  </Card>
                  {result && <ResultCard result={result} />}
                </div>
              </div>
            </TabsContent>

            {/* ══ FAMILY 4: CRYPTOGRAPHIC PETs ═══════════════════════════════ */}
            <TabsContent value="crypto" className="mt-4">
              <div className="grid gap-4 md:grid-cols-[200px_1fr]">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Protocol</CardTitle></CardHeader>
                  <CardContent>
                    <TechList items={CRYPTO_TECHNIQUES} selected={cryptoTech} onSelect={(id) => { setCryptoTech(id); setResult(null); }} />
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Key className="h-4 w-4 text-amber-500" />
                        {CRYPTO_TECHNIQUES.find((t) => t.id === cryptoTech)?.label} Parameters
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <FormulaBox id={cryptoTech} />

                      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3">
                        <div className="flex gap-2">
                          <Server className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            <strong>Educational Simulation.</strong> This demonstrates the mathematical properties of the cryptographic protocol.
                            Production deployment requires server-side key infrastructure.
                          </p>
                        </div>
                      </div>

                      {cryptoTech === "he" && (
                        <div className="space-y-2">
                          <Label className="text-sm">Key Size</Label>
                          <RadioGroup value={heKeySize} onValueChange={setHeKeySize} className="flex gap-4">
                            {["512","1024","2048"].map((v) => (
                              <div key={v} className="flex items-center gap-1.5">
                                <RadioGroupItem value={v} id={`ks-${v}`} />
                                <label htmlFor={`ks-${v}`} className="text-xs font-mono cursor-pointer">{v}-bit</label>
                              </div>
                            ))}
                          </RadioGroup>
                          <p className="text-xs text-muted-foreground">Paillier: n = p·q, g = n+1. E(m) = gᵐ·rⁿ mod n²</p>
                        </div>
                      )}

                      {cryptoTech === "smpc" && (<>
                        <SliderField label="Number of Shares (k)" value={smpcShares} onChange={setSmpcShares} min={2} max={5} step={1} format={(v) => String(v)} helpText="Each value is split into k additive shares over Z_p" />
                        <SliderField label="Reconstruction Threshold (t)" value={smpcThreshold} onChange={(v) => setSmpcThreshold([Math.min(v[0], smpcShares[0])])} min={2} max={smpcShares[0]} step={1} format={(v) => String(v)} helpText={`t=${smpcThreshold[0]} of k=${smpcShares[0]} shares needed to reconstruct`} />
                      </>)}

                      <RunButton running={running} onRun={handleRun} disabled={!selectedDataset || rawData.length === 0} />
                    </CardContent>
                  </Card>
                  {result && <ResultCard result={result} />}
                </div>
              </div>
            </TabsContent>

            {/* ══ FAMILY 5: FEDERATED LEARNING ════════════════════════════════ */}
            <TabsContent value="federated" className="mt-4">
              <div className="grid gap-4 md:grid-cols-[200px_1fr]">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Protocol</CardTitle></CardHeader>
                  <CardContent>
                    <TechList items={FED_TECHNIQUES} selected={fedTech} onSelect={() => {}} />
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <GitMerge className="h-4 w-4 text-rose-500" />
                        FedAvg Parameters
                      </CardTitle>
                      <CardDescription>McMahan et al. 2017 — Federated Averaging with optional DP</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <FormulaBox id="fedavg" />

                      <SliderField label="Federated Nodes (K)" value={fedNodes} onChange={setFedNodes} min={2} max={10} step={1} format={(v) => String(v)} helpText={`Dataset split across ${fedNodes[0]} simulated clients. w = Σ (nₖ/n) wₖ`} />
                      <SliderField label="Communication Rounds (T)" value={fedRounds} onChange={setFedRounds} min={1} max={20} step={1} format={(v) => String(v)} helpText="Number of federated averaging rounds" />

                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm">Enable DP-FedAvg</Label>
                          <p className="text-xs text-muted-foreground">Add Gaussian noise to gradient aggregation</p>
                        </div>
                        <Switch checked={fedDP} onCheckedChange={setFedDP} />
                      </div>

                      {fedDP && (
                        <SliderField label="Privacy Budget (ε)" value={fedEps} onChange={setFedEps} min={0.1} max={10} step={0.1} format={(v) => v.toFixed(1)} helpText={`ε=${fedEps[0].toFixed(1)} for DP-FedAvg gradient noise (δ=1e-5)`} />
                      )}

                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm">Generate Synthetic Output</Label>
                          <p className="text-xs text-muted-foreground">Produce synthetic data from the aggregated model</p>
                        </div>
                        <Switch checked={fedGenSynth} onCheckedChange={setFedGenSynth} />
                      </div>

                      <RunButton running={running} onRun={handleRun} disabled={!selectedDataset || rawData.length === 0} />
                    </CardContent>
                  </Card>
                  {result && <ResultCard result={result} />}
                </div>
              </div>
            </TabsContent>

            {/* ══ ATTACK MITIGATION MATRIX ════════════════════════════════════ */}
            <TabsContent value="matrix" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Privacy Technique vs. Attack Mitigation Matrix
                  </CardTitle>
                  <CardDescription>
                    Based on the NIST-aligned blueprint. 15 techniques × 10 attack types.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Legend */}
                  <div className="flex flex-wrap gap-3 mb-4">
                    {(["Stops","Partial","Fails"] as MitigationLevel[]).map((level) => (
                      <div key={level} className="flex items-center gap-1.5">
                        <MitigationBadge level={level} />
                        <span className="text-xs text-muted-foreground">
                          {level === "Stops" ? "Fully mitigated" : level === "Partial" ? "Partially mitigated" : "Not mitigated"}
                        </span>
                      </div>
                    ))}
                  </div>

                  <ScrollArea className="w-full">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse min-w-[900px]">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left px-3 py-2 font-semibold w-[180px]">Technique</th>
                            <th className="text-left px-2 py-2 font-semibold text-muted-foreground text-xs w-[80px]">Family</th>
                            {ATTACK_COLUMNS.map((col) => (
                              <th key={col.key} className="px-2 py-2 font-semibold text-center whitespace-nowrap">{col.short}</th>
                            ))}
                            <th className="px-2 py-2 font-semibold text-center whitespace-nowrap">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ATTACK_MATRIX.map((row) => {
                            const counts = countMitigations(row);
                            const score = counts.stops + counts.partial * 0.5;
                            return (
                              <tr key={row.technique} className="border-b hover:bg-muted/30 transition-colors">
                                <td className="px-3 py-2 font-medium">{row.technique}</td>
                                <td className="px-2 py-2">
                                  <Badge variant="outline" className="text-[10px] py-0">{row.family}</Badge>
                                </td>
                                {ATTACK_COLUMNS.map((col) => (
                                  <td key={col.key} className="px-2 py-2 text-center">
                                    <MitigationBadge level={row.attacks[col.key]} />
                                  </td>
                                ))}
                                <td className="px-2 py-2 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(score / 10) * 100}%` }} />
                                    </div>
                                    <span className="text-[10px] font-mono">{score.toFixed(1)}</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </ScrollArea>

                  {/* Per-attack column summary */}
                  <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-3">
                    {ATTACK_COLUMNS.map((col) => {
                      const stopsCount = ATTACK_MATRIX.filter((r) => r.attacks[col.key] === "Stops").length;
                      const partialCount = ATTACK_MATRIX.filter((r) => r.attacks[col.key] === "Partial").length;
                      return (
                        <div key={col.key} className="rounded-lg border p-3">
                          <p className="text-xs font-semibold truncate">{col.label}</p>
                          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{stopsCount}</p>
                          <p className="text-xs text-muted-foreground">{stopsCount} fully stop · {partialCount} partial</p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
}

// ─── Helper: Slider field ─────────────────────────────────────────────────────
function SliderField({ label, value, onChange, min, max, step, format, helpText }: {
  label: string; value: number[]; onChange: (v: number[]) => void;
  min: number; max: number; step: number;
  format: (v: number) => string; helpText?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <Badge variant="outline" className="font-mono text-xs">{format(value[0])}</Badge>
      </div>
      <Slider value={value} onValueChange={onChange} min={min} max={max} step={step} />
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
    </div>
  );
}

// ─── Helper: Run button ───────────────────────────────────────────────────────
function RunButton({ running, onRun, disabled }: { running: boolean; onRun: () => void; disabled: boolean }) {
  return (
    <Button className="w-full" onClick={onRun} disabled={running || disabled} data-testid="button-apply-privacy">
      {running ? (
        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing…</>
      ) : (
        <><Play className="mr-2 h-4 w-4" />Apply Technique</>
      )}
    </Button>
  );
}

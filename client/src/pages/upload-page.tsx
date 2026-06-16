import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  Trash2,
  Loader2,
  Info,
  Database,
  Users,
  Shield,
  TrendingUp,
  Wrench,
  CheckCircle2,
  X,
  Table2,
  Eye,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Dataset } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const poppins: React.CSSProperties = { fontFamily: "'Poppins', sans-serif" };

const GUIDELINES = [
  {
    icon: Database,
    title: "File Requirements",
    color: "text-blue-600",
    bg: "bg-blue-50",
    items: ["CSV, XLSX, XLS, JSON", "Max file size: 100 MB", "Min 10 rows recommended", "Headers required"],
  },
  {
    icon: Shield,
    title: "Quasi-Identifiers",
    color: "text-violet-600",
    bg: "bg-violet-50",
    items: ["Age, Gender, Postal Code", "State, Occupation", "Education Level, Salary", "Can re-identify when combined"],
  },
  {
    icon: Users,
    title: "Direct Identifiers",
    color: "text-rose-600",
    bg: "bg-rose-50",
    items: ["Remove: Name, ID, Email", "Remove: Phone, Address", "Keep: Anonymised ID only", "Already removed by NSO"],
  },
  {
    icon: TrendingUp,
    title: "Data Quality",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    items: ["Minimise missing values", "Check for outliers", "Consistent formatting", "Valid data types"],
  },
];

function QualityBar({ score }: { score: number | null }) {
  if (!score) return <span className="text-slate-400 text-sm">—</span>;
  const pct = Math.round(score * 100);
  const color = score >= 0.8 ? "bg-emerald-500" : score >= 0.6 ? "bg-amber-500" : "bg-rose-500";
  const textColor = score >= 0.8 ? "text-emerald-600" : score >= 0.6 ? "text-amber-600" : "text-rose-600";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-sm font-semibold ${textColor}`}>{pct}%</span>
    </div>
  );
}

export default function UploadPage() {
  const { toast } = useToast();
  const [uploadProgress, setUploadProgress] = useState(0);
  const [datasetPreviews, setDatasetPreviews] = useState<Record<number, { columns: string[]; rows: any[] }>>({});
  const [viewDataset, setViewDataset] = useState<Dataset | null>(null);
  const [fixResults, setFixResults] = useState<Record<number, string[]>>({});
  const [isFixing, setIsFixing] = useState<Record<number, boolean>>({});
  const [perfectOpen, setPerfectOpen] = useState(false);

  const { data: datasets, isLoading } = useQuery<Dataset[]>({
    queryKey: ["/api/datasets"],
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/data/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/datasets"] });
      setUploadProgress(100);
      toast({ title: "Upload successful", description: "Your dataset has been uploaded and processed." });
      setTimeout(() => setUploadProgress(0), 2000);
    },
    onError: (e: Error) => {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
      setUploadProgress(0);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/datasets/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/datasets"] });
      toast({ title: "Dataset deleted", description: "The dataset has been removed." });
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const onDrop = useCallback((files: File[]) => {
    if (files[0]) { setUploadProgress(30); uploadMutation.mutate(files[0]); }
  }, [uploadMutation]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
      "application/json": [".json"],
    },
    maxFiles: 1,
    disabled: uploadMutation.isPending,
  });

  const openFullView = async (dataset: Dataset) => {
    if (!datasetPreviews[dataset.id]) {
      try {
        const res = await fetch(`/api/data/${dataset.id}/preview`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setDatasetPreviews(p => ({ ...p, [dataset.id]: data }));
        }
      } catch {
        toast({ title: "Failed to load data", variant: "destructive" });
        return;
      }
    }
    setViewDataset(dataset);
  };

  const handleAutoFix = async (dataset: Dataset) => {
    if (dataset.qualityScore && dataset.qualityScore >= 0.95) { setPerfectOpen(true); return; }
    setIsFixing(p => ({ ...p, [dataset.id]: true }));
    try {
      const res = await fetch(`/api/data/${dataset.id}/autofix`, { method: "POST", credentials: "include" });
      if (res.ok) {
        const result = await res.json();
        setFixResults(p => ({ ...p, [dataset.id]: result.fixes || ["Data cleaning completed"] }));
        setDatasetPreviews(p => { const u = { ...p }; delete u[dataset.id]; return u; });
        queryClient.invalidateQueries({ queryKey: ["/api/datasets"] });
        toast({ title: "Auto Fix completed", description: "Dataset has been automatically repaired." });
      }
    } catch {
      toast({ title: "Auto Fix failed", variant: "destructive" });
    } finally {
      setIsFixing(p => ({ ...p, [dataset.id]: false }));
    }
  };

  const formatBytes = (b: number) => {
    if (!b) return "0 B";
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return (b / Math.pow(1024, i)).toFixed(1) + " " + ["B","KB","MB","GB"][i];
  };

  const formatDate = (d: string | Date | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const previewData = viewDataset ? datasetPreviews[viewDataset.id] : null;

  return (
    <DashboardLayout title="Data Upload" breadcrumbs={[{ label: "Data Upload" }]}>
      <div className="space-y-10" style={poppins}>

        {/* ── Upload Zone ── */}
        <section>
          <p className="text-base text-slate-500 mb-5 font-medium" style={poppins}>
            Upload your NSO microdata file. It will be automatically analysed for quasi-identifiers and re-identification risk.
          </p>

          <div
            {...getRootProps()}
            data-testid="dropzone-upload"
            className={[
              "relative border-2 border-dashed rounded-2xl transition-all duration-200 cursor-pointer select-none",
              "flex flex-col items-center justify-center gap-5 py-16 px-8",
              isDragActive
                ? "border-blue-500 bg-blue-50/60"
                : "border-slate-200 hover:border-blue-400 hover:bg-slate-50/60",
              uploadMutation.isPending ? "pointer-events-none opacity-60" : "",
            ].join(" ")}
          >
            <input {...getInputProps()} data-testid="input-file-upload" />

            {uploadMutation.isPending ? (
              <Loader2 className="h-14 w-14 text-blue-500 animate-spin" />
            ) : (
              <div className={`h-20 w-20 rounded-2xl flex items-center justify-center ${isDragActive ? "bg-blue-100" : "bg-slate-100"}`}>
                <Upload className={`h-9 w-9 ${isDragActive ? "text-blue-600" : "text-slate-500"}`} />
              </div>
            )}

            <div className="text-center">
              <p className="text-xl font-semibold text-slate-800" style={poppins}>
                {uploadMutation.isPending ? "Uploading…" : isDragActive ? "Drop file here" : "Drop your file here"}
              </p>
              {!uploadMutation.isPending && !isDragActive && (
                <p className="text-base text-slate-400 mt-1 font-medium" style={poppins}>
                  or <span className="text-blue-600 underline underline-offset-2">click to browse</span> from your computer
                </p>
              )}
            </div>

            <div className="flex gap-2 flex-wrap justify-center">
              {["CSV", "XLSX", "XLS", "JSON"].map(f => (
                <span key={f} className="px-3 py-1 rounded-md bg-slate-100 text-slate-600 text-sm font-semibold tracking-wide" style={poppins}>{f}</span>
              ))}
            </div>

            {uploadProgress > 0 && (
              <div className="absolute bottom-5 left-8 right-8">
                <Progress value={uploadProgress} className="h-1.5" />
                <p className="text-xs text-center text-slate-400 mt-1.5" style={poppins}>
                  {uploadProgress < 100 ? "Processing…" : "Complete!"}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ── Guidelines ── */}
        <section>
          <h2 className="text-lg font-semibold text-slate-700 mb-4" style={poppins}>Upload Guidelines</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {GUIDELINES.map(({ icon: Icon, title, color, bg, items }) => (
              <div key={title} className="border border-slate-100 rounded-xl p-5 bg-white dark:bg-slate-900">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`h-9 w-9 rounded-lg ${bg} flex items-center justify-center`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                  <span className="text-[15px] font-semibold text-slate-800" style={poppins}>{title}</span>
                </div>
                <ul className="space-y-1.5">
                  {items.map(item => (
                    <li key={item} className="text-[13px] text-slate-500 font-medium flex items-start gap-1.5" style={poppins}>
                      <span className="mt-0.5 text-slate-300">·</span>{item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ── Uploaded Datasets ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-700" style={poppins}>Your Uploaded Datasets</h2>
            {datasets && datasets.length > 0 && (
              <span className="text-sm text-slate-400 font-medium" style={poppins}>
                {datasets.length} file{datasets.length !== 1 ? "s" : ""} uploaded
              </span>
            )}
          </div>

          <div className="border border-slate-100 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
              </div>
            ) : !datasets?.length ? (
              <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-5">
                  <FileSpreadsheet className="h-8 w-8 text-slate-400" />
                </div>
                <p className="text-lg font-semibold text-slate-700" style={poppins}>No datasets yet</p>
                <p className="text-sm text-slate-400 mt-2 font-medium max-w-xs" style={poppins}>
                  Upload your first NSO microdata file above to begin privacy assessment.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full" style={poppins}>
                  <thead>
                    <tr className="border-b border-slate-100">
                      {["File Name", "Format", "Size", "Rows", "Cols", "Quality", "Uploaded", ""].map(h => (
                        <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap" style={poppins}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {datasets.map(ds => (
                      <tr
                        key={ds.id}
                        data-testid={`row-dataset-${ds.id}`}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        {/* File name — click to open full view */}
                        <td className="px-5 py-4">
                          <button
                            onClick={() => openFullView(ds)}
                            className="flex items-center gap-2.5 text-left group"
                          >
                            <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                              <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                            </div>
                            <span className="text-[14px] font-semibold text-slate-800 group-hover:text-blue-600 transition-colors truncate max-w-[180px]" style={poppins}>
                              {ds.originalName}
                            </span>
                          </button>
                        </td>
                        <td className="px-5 py-4">
                          <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-xs font-semibold tracking-wide" style={poppins}>
                            {ds.format.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-500 font-medium whitespace-nowrap" style={poppins}>{formatBytes(ds.size)}</td>
                        <td className="px-5 py-4 text-sm font-semibold text-slate-700" style={poppins}>{ds.rowCount.toLocaleString()}</td>
                        <td className="px-5 py-4 text-sm font-semibold text-slate-700" style={poppins}>{ds.columns?.length || 0}</td>
                        <td className="px-5 py-4"><QualityBar score={ds.qualityScore} /></td>
                        <td className="px-5 py-4 text-sm text-slate-400 font-medium whitespace-nowrap" style={poppins}>{formatDate(ds.uploadedAt)}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openFullView(ds)}
                              title="View full data"
                              className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleAutoFix(ds)}
                              disabled={!!(isFixing[ds.id] || fixResults[ds.id])}
                              title="Auto-fix issues"
                              className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-40"
                            >
                              {isFixing[ds.id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                            </button>
                            <button
                              onClick={() => deleteMutation.mutate(ds.id)}
                              disabled={deleteMutation.isPending}
                              title="Delete dataset"
                              data-testid={`button-delete-${ds.id}`}
                              className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Auto-fix results */}
          {Object.entries(fixResults).map(([id, fixes]) => (
            <div key={id} className="mt-3 flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-100">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-emerald-700" style={poppins}>Auto Fix Completed</p>
                <ul className="mt-1.5 space-y-0.5">
                  {fixes.map((f, i) => (
                    <li key={i} className="text-sm text-emerald-600 font-medium" style={poppins}>· {f}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </section>
      </div>

      {/* ── Full Data View Dialog ── */}
      <Dialog open={!!viewDataset} onOpenChange={(o) => !o && setViewDataset(null)}>
        <DialogContent
          className="max-w-[92vw] w-[92vw] max-h-[90vh] flex flex-col p-0 gap-0 rounded-2xl overflow-hidden"
          style={poppins}
        >
          <DialogHeader className="px-7 py-5 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Table2 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold text-slate-900" style={poppins}>
                  {viewDataset?.originalName}
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-400 font-medium mt-0.5" style={poppins}>
                  {viewDataset?.rowCount.toLocaleString()} rows · {viewDataset?.columns?.length} columns · {formatBytes(viewDataset?.size ?? 0)}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Stats strip */}
          {viewDataset && (
            <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 shrink-0">
              {[
                { label: "Quality Score", value: viewDataset.qualityScore ? `${Math.round(viewDataset.qualityScore * 100)}%` : "—" },
                { label: "Completeness", value: viewDataset.completenessScore ? `${Math.round(viewDataset.completenessScore * 100)}%` : "—" },
                { label: "Total Rows", value: viewDataset.rowCount.toLocaleString() },
              ].map(({ label, value }) => (
                <div key={label} className="px-7 py-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider" style={poppins}>{label}</p>
                  <p className="text-2xl font-semibold text-slate-800 mt-1" style={poppins}>{value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Data table */}
          <div className="flex-1 overflow-auto">
            {previewData ? (
              <table className="w-full text-sm" style={poppins}>
                <thead className="sticky top-0 bg-slate-50 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-12 border-b border-r border-slate-100" style={poppins}>#</th>
                    {previewData.columns.map(col => (
                      <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider min-w-[130px] border-b border-slate-100 whitespace-nowrap" style={poppins}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {previewData.rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-2.5 text-xs text-slate-300 font-medium border-r border-slate-100 w-12" style={poppins}>{idx + 1}</td>
                      {previewData.columns.map(col => (
                        <td key={col} className="px-4 py-2.5 text-[13px] text-slate-600 font-medium font-mono whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis" style={{ fontFamily: "'JetBrains Mono', 'Fira Mono', monospace" }}>
                          {String(row[col] ?? "—")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
              </div>
            )}
          </div>

          {previewData && (
            <div className="px-7 py-3 border-t border-slate-100 bg-slate-50 shrink-0">
              <p className="text-xs text-slate-400 font-medium" style={poppins}>
                Showing {previewData.rows.length} of {viewDataset?.rowCount.toLocaleString()} rows
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Perfect dataset dialog ── */}
      <Dialog open={perfectOpen} onOpenChange={setPerfectOpen}>
        <DialogContent className="max-w-sm rounded-2xl" style={poppins}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold" style={poppins}>
              <CheckCircle className="h-6 w-6 text-emerald-500" />
              Dataset is Perfect!
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500 pt-2 font-medium" style={poppins}>
              This dataset already has a quality score of 95%+ and doesn't require any fixes. It's ready for risk assessment.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end pt-2">
            <Button onClick={() => setPerfectOpen(false)} style={poppins}>Got it</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

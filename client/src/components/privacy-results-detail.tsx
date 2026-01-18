import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { CheckCircle, AlertCircle, TrendingDown, Users, Shield, Zap, Filter, Eye, Layers, Info, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface DetailedResult {
  technique: string;
  recordsSuppressed: number;
  totalRecords: number;
  informationLoss: number;
  equivalenceClasses?: number;
  avgGroupSize?: number;
  minGroupSize?: number;
  maxGroupSize?: number;
  privacyRisk?: number;
  diverseClasses?: number;
  violatingClasses?: number;
  avgDiversity?: number;
  satisfyingClasses?: number;
  avgDistance?: number;
  maxDistance?: number;
  parameters?: any;
  processedData?: any[];
}

export function PrivacyResultsDetail({ result }: { result: DetailedResult }) {
  const { toast } = useToast();
  const recordsRetained = result.totalRecords - result.recordsSuppressed;
  const retentionRate = ((recordsRetained / result.totalRecords) * 100).toFixed(1);

  const downloadCSV = () => {
    if (!result.processedData) return;
    const csv = Papa.unparse(result.processedData);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `enhanced_data_${result.technique}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({
      title: "Success",
      description: "CSV file downloaded successfully",
    });
  };

  const downloadExcel = () => {
    if (!result.processedData) return;
    const ws = XLSX.utils.json_to_sheet(result.processedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Enhanced Data");
    XLSX.writeFile(wb, `enhanced_data_${result.technique}.xlsx`);
    toast({
      title: "Success",
      description: "Excel file downloaded successfully",
    });
  };

  const renderFileAccess = () => {
    if (!result.processedData || result.processedData.length === 0) return null;
    const allData = result.processedData;
    const columns = Object.keys(allData[0]);

    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Enhanced File Access
              </CardTitle>
              <CardDescription className="text-xs">View or download the complete enhanced dataset</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Eye className="h-4 w-4" />
                  Full Data View
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                  <DialogTitle>Enhanced Dataset (Full View)</DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-auto rounded-md border mt-4">
                  <table className="w-full text-[11px] font-mono">
                    <thead className="sticky top-0 bg-background z-10">
                      <tr className="border-b bg-muted/50">
                        {columns.map(col => (
                          <th key={col} className="p-2 text-left font-semibold text-muted-foreground uppercase tracking-wider">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allData.map((row, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                          {columns.map(col => (
                            <td key={col} className="p-2 whitespace-nowrap">
                              {String(row[col]).includes('*') || row[col] === null ? (
                                <span className="text-amber-600 font-bold">{String(row[col]) || 'NULL'}</span>
                              ) : (
                                <span className="text-foreground">{String(row[col])}</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DialogContent>
            </Dialog>

            <Button variant="outline" size="sm" className="gap-2" onClick={downloadCSV}>
              <Download className="h-4 w-4" />
              Download CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={downloadExcel}>
              <Download className="h-4 w-4" />
              Download Excel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderDataPreview = () => {
    if (!result.processedData || result.processedData.length === 0) return null;

    const previewData = result.processedData.slice(0, 5);
    const columns = Object.keys(previewData[0]);

    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Enhanced Data Preview
              </CardTitle>
              <CardDescription className="text-xs">Actual sample of the anonymized dataset</CardDescription>
            </div>
            <Badge variant="secondary" className="text-[10px]">{result.processedData.length} records generated</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto bg-muted/20">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="border-b bg-muted/50">
                  {columns.map(col => (
                    <th key={col} className="p-2 text-left font-semibold text-muted-foreground uppercase tracking-wider">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.map((row, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                    {columns.map(col => (
                      <td key={col} className="p-2 whitespace-nowrap">
                        {String(row[col]).includes('*') || row[col] === null ? (
                          <span className="text-amber-600 font-bold">{String(row[col]) || 'NULL'}</span>
                        ) : (
                          <span className="text-foreground">{String(row[col])}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-4 p-4 rounded-lg bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/20">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-md">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-200">Enhancement Breakdown</h4>
                <p className="text-xs leading-relaxed text-blue-800 dark:text-blue-300/80">
                  {result.technique === 'k-anonymity' && 
                    `QUASI-IDENTIFIER MASKING: Attributes like zip code, age, or gender were generalized or suppressed. The data above shows '${previewData[0] ? Object.keys(previewData[0]).filter(k => String(previewData[0][k]).includes('*'))[0] : 'QI'}' values replaced with '*' to ensure no single individual stands out from a crowd of ${result.parameters?.kValue || 5}.`}
                  {result.technique === 'l-diversity' && 
                    `SENSITIVE ATTRIBUTE DIVERSIFICATION: We ensured that for every combination of identity traits, the sensitive field '${result.parameters?.sensitiveAttribute}' contains at least ${result.parameters?.lValue} different possibilities. This prevents 'Homogeneity Attacks' where an attacker knows you're in a group but could otherwise guess your status.`}
                  {result.technique === 'differential-privacy' && 
                    `NOISE INJECTION (LAPLACE): Statistical noise was mathematically added to numeric values. This means the specific values in the table above are 'perturbed'—they are close to the truth but contain a random offset (ε=${result.parameters?.epsilon}) that makes it impossible to reverse-engineer any specific person's raw data.`}
                  {result.technique === 'synthetic-data' && 
                    `STATISTICAL REPLICATION: None of the records above existed in your original file. They are 'synthetic twins' that maintain the same averages, correlations, and trends as your real data but carry zero risk of exposing real people.`}
                  {result.technique === 't-closeness' && 
                    `DISTRIBUTION ALIGNMENT: The spread of sensitive values in each group was forced to match the global average. This stops 'Skewness Attacks' where an attacker learns something new just by seeing how much a specific group differs from the general population.`}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderKAnonymityDetails = () => {
    const minS = result.minGroupSize || result.parameters?.minGroupSize || result.parameters?.kValue || 0;
    const avgS = result.avgGroupSize || result.parameters?.avgGroupSize || 0;
    const maxS = result.maxGroupSize || result.parameters?.maxGroupSize || 0;
    
    const groupDistData = [
      { name: 'Min Size', value: minS },
      { name: 'Avg Size', value: avgS },
      { name: 'Max Size', value: maxS },
    ];
    
    // Calculate safety score
    const safetyScore = result.privacyRisk !== undefined && result.privacyRisk > 1 
      ? result.privacyRisk 
      : (minS > 1 ? (100 * (1 - 1 / minS)) : (minS / (result.parameters?.kValue || 5)) * 100);
    
    console.log("[PrivacyResultsDetail] Render K-Anonymity Details", {
      minS,
      avgS,
      maxS,
      privacyRisk: result.privacyRisk,
      calculatedSafetyScore: safetyScore,
      kValue: result.parameters?.kValue
    });

    return (
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-sm">Group Sizes</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={groupDistData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} /></BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Identity Protection</CardTitle></CardHeader>
            <CardContent className="flex items-center justify-center relative h-[200px]">
              <div className="text-center">
                <p className="text-4xl font-black text-green-600">{safetyScore.toFixed(0)}%</p>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Safety Score</p>
                <div className="mt-4 text-left space-y-2">
                  <div className="flex items-center gap-2 text-[10px]">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span>Re-identification risk minimized</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span>Minimum group size: {minS}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        {renderDataPreview()}
        {renderFileAccess()}
      </div>
    );
  };

  const renderLDiversityDetails = () => {
    console.log("L-Diversity Result Object:", result);
    const params = result.parameters as any;
    console.log("L-Diversity Parameters:", params);
    
    // Fallback logic to find metrics in various possible locations
    const minD = (result as any).minDiversity ?? params?.minDiversity ?? 0;
    const avgD = (result as any).avgDiversity ?? params?.avgDiversity ?? 0;
    const maxD = (result as any).maxDiversity ?? params?.maxDiversity ?? 0;
    const targetD = params?.lValue ?? 0;
    const score = (result as any).privacyRisk ?? params?.privacyRisk ?? 0;
    const recordsGenerated = result.processedData?.length || 0;
    const recordsSuppressed = result.recordsSuppressed || 0;
    const informationLoss = result.informationLoss || 0;
    
    console.log("L-Diversity Parsed Values:", { minD, avgD, maxD, targetD, score, recordsGenerated, recordsSuppressed });

    const diversityDistData = [
      { name: 'Min Diversity', value: minD },
      { name: 'Avg Diversity', value: avgD },
      { name: 'Max Diversity', value: maxD },
    ];

    return (
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-sm">Diversity Analysis</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={diversityDistData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Compliance Summary</CardTitle></CardHeader>
            <CardContent className="flex items-center justify-center relative h-[200px]">
              <div className="text-center">
                <p className="text-4xl font-black text-purple-600">{score.toFixed(0)}%</p>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Diversity Score</p>
                <div className="mt-4 text-left space-y-2">
                  <div className="flex items-center gap-2 text-[10px]">
                    <CheckCircle className="h-3 w-3 text-purple-500" />
                    <span>Attribute homogeneity minimized</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <CheckCircle className="h-3 w-3 text-purple-500" />
                    <span>Target L-Value: {targetD}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <Badge variant="secondary" className="text-[9px]">{result.diverseClasses} Groups Protected</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        {renderDataPreview()}
        {renderFileAccess()}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-green-500 hover:bg-green-600 text-white border-0 py-1">Success</Badge>
              <h2 className="text-lg font-bold tracking-tight">Enhancement Finalized</h2>
            </div>
            <p className="text-xs text-muted-foreground">The data has been mathematically transformed using {result.technique.replace("-", " ")} logic.</p>
          </div>
          <div className="flex gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="default" size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700">
                  <Eye className="h-4 w-4" />
                  View Enhanced Data
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                  <DialogTitle>Enhanced Dataset (Full View)</DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-auto rounded-md border mt-4">
                  {result.processedData && result.processedData.length > 0 ? (
                    <table className="w-full text-[11px] font-mono">
                      <thead className="sticky top-0 bg-background z-10">
                        <tr className="border-b bg-muted/50">
                          {Object.keys(result.processedData[0]).map(col => (
                            <th key={col} className="p-2 text-left font-semibold text-muted-foreground uppercase tracking-wider">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.processedData.map((row, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                            {Object.keys(result.processedData![0]).map(col => (
                              <td key={col} className="p-2 whitespace-nowrap">
                                {String(row[col]).includes('*') || row[col] === null ? (
                                  <span className="text-amber-600 font-bold">{String(row[col]) || 'NULL'}</span>
                                ) : (
                                  <span className="text-foreground">{String(row[col])}</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">
                      No processed data available to display. All records may have been suppressed based on privacy constraints.
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="outline" size="sm" className="gap-2" onClick={downloadCSV}>
              <Download className="h-4 w-4" />
              Download
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <div className="p-3 bg-card border rounded-lg flex flex-col items-center">
          <Users className="h-4 w-4 text-blue-500 mb-1" />
          <span className="text-xl font-bold tracking-tighter">{recordsRetained}</span>
          <span className="text-[9px] text-muted-foreground uppercase font-bold">Output</span>
        </div>
        <div className="p-3 bg-card border rounded-lg flex flex-col items-center">
          <TrendingDown className="h-4 w-4 text-purple-500 mb-1" />
          <span className="text-xl font-bold tracking-tighter">{(result.informationLoss * 100).toFixed(1)}%</span>
          <span className="text-[9px] text-muted-foreground uppercase font-bold">Loss</span>
        </div>
        <div className="p-3 bg-card border rounded-lg flex flex-col items-center">
          <AlertCircle className="h-4 w-4 text-amber-500 mb-1" />
          <span className="text-xl font-bold tracking-tighter">{result.recordsSuppressed}</span>
          <span className="text-[9px] text-muted-foreground uppercase font-bold">Removed</span>
        </div>
        <div className="p-3 bg-card border rounded-lg flex flex-col items-center">
          <Shield className="h-4 w-4 text-green-500 mb-1" />
          <span className="text-xl font-bold tracking-tighter">{result.totalRecords}</span>
          <span className="text-[9px] text-muted-foreground uppercase font-bold">Input</span>
        </div>
      </div>

      {result.technique === "k-anonymity" ? renderKAnonymityDetails() : 
       result.technique === "l-diversity" ? renderLDiversityDetails() : (
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-sm">Summary Analysis</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Retention Rate</span><span className="font-bold">{retentionRate}%</span></div>
                <div className="w-full bg-muted rounded-full h-1.5"><div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${retentionRate}%` }}></div></div>
              </div>
            </CardContent>
          </Card>
          {renderDataPreview()}
          {renderFileAccess()}
        </div>
      )}
    </div>
  );
}

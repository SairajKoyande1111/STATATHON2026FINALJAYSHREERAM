import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Database,
  AlertTriangle,
  FileText,
  Shield,
  Upload,
  ArrowRight,
  TrendingUp,
  CheckCircle,
  Clock,
  Server,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

const activityData = [
  { day: "Mon", uploads: 4, assessments: 3, reports: 2 },
  { day: "Tue", uploads: 6, assessments: 5, reports: 3 },
  { day: "Wed", uploads: 3, assessments: 4, reports: 4 },
  { day: "Thu", uploads: 8, assessments: 6, reports: 5 },
  { day: "Fri", uploads: 5, assessments: 7, reports: 3 },
  { day: "Sat", uploads: 2, assessments: 2, reports: 1 },
  { day: "Sun", uploads: 1, assessments: 1, reports: 2 },
];

const riskDistribution = [
  { name: "Low Risk", value: 45, color: "hsl(var(--chart-4))" },
  { name: "Medium Risk", value: 35, color: "hsl(var(--chart-5))" },
  { name: "High Risk", value: 20, color: "hsl(var(--destructive))" },
];

const techniqueUsage = [
  { technique: "K-Anonymity", count: 28 },
  { technique: "L-Diversity", count: 18 },
  { technique: "T-Closeness", count: 12 },
  { technique: "Differential Privacy", count: 22 },
  { technique: "Synthetic Data", count: 8 },
];

export default function HomePage() {
  const { data: stats, isLoading } = useQuery<{
    datasets: number;
    assessments: number;
    reports: number;
    operations: number;
  }>({
    queryKey: ["/api/stats"],
  });

  return (
    <DashboardLayout title="Dashboard" breadcrumbs={[{ label: "Dashboard" }]}>
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
              <CardTitle className="text-sm font-medium">Total Datasets</CardTitle>
              <Database className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-3xl font-bold" data-testid="stat-datasets">
                    {stats?.datasets || 0}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <TrendingUp className="h-3 w-3 text-chart-4" />
                    +12% from last month
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
              <CardTitle className="text-sm font-medium">Risk Assessments</CardTitle>
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-3xl font-bold" data-testid="stat-assessments">
                    {stats?.assessments || 0}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <TrendingUp className="h-3 w-3 text-chart-4" />
                    +8% from last month
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
              <CardTitle className="text-sm font-medium">Reports Generated</CardTitle>
              <FileText className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-3xl font-bold" data-testid="stat-reports">
                    {stats?.reports || 0}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <TrendingUp className="h-3 w-3 text-chart-4" />
                    +15% from last month
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
              <CardTitle className="text-sm font-medium">Privacy Operations</CardTitle>
              <Shield className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-3xl font-bold" data-testid="stat-operations">
                    {stats?.operations || 0}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <TrendingUp className="h-3 w-3 text-chart-4" />
                    +22% from last month
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Weekly Activity</CardTitle>
              <CardDescription>Dataset uploads, assessments, and reports over the past week</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={activityData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="uploads"
                      stroke="hsl(var(--chart-1))"
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--chart-1))" }}
                      name="Uploads"
                    />
                    <Line
                      type="monotone"
                      dataKey="assessments"
                      stroke="hsl(var(--chart-2))"
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--chart-2))" }}
                      name="Assessments"
                    />
                    <Line
                      type="monotone"
                      dataKey="reports"
                      stroke="hsl(var(--chart-3))"
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--chart-3))" }}
                      name="Reports"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Risk Distribution</CardTitle>
              <CardDescription>Overall dataset risk levels</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={riskDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {riskDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-4 mt-4">
                {riskDistribution.map((item) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-xs text-muted-foreground">{item.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Privacy Techniques Usage</CardTitle>
              <CardDescription>Most frequently used anonymization methods</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={techniqueUsage} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" />
                    <YAxis dataKey="technique" type="category" width={120} className="text-xs" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks and shortcuts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/upload">
                <Button variant="outline" className="w-full justify-between" data-testid="quick-action-upload">
                  <span className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Upload New Dataset
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/risk">
                <Button variant="outline" className="w-full justify-between" data-testid="quick-action-assess">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Run Risk Assessment
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/privacy">
                <Button variant="outline" className="w-full justify-between" data-testid="quick-action-anonymize">
                  <span className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Apply Anonymization
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/reports">
                <Button variant="outline" className="w-full justify-between" data-testid="quick-action-report">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Generate Report
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>System Status</CardTitle>
            <CardDescription>Current system health and service status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30">
                <div className="p-2 rounded-full bg-chart-4/10">
                  <Server className="h-5 w-5 text-chart-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Application Server</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-chart-4 border-chart-4">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Operational
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30">
                <div className="p-2 rounded-full bg-chart-4/10">
                  <Database className="h-5 w-5 text-chart-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Database</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-chart-4 border-chart-4">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30">
                <div className="p-2 rounded-full bg-chart-4/10">
                  <Shield className="h-5 w-5 text-chart-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Security Services</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-chart-4 border-chart-4">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Active
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

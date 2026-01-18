import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PrivacyResultsDetail } from "@/components/privacy-results-detail";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface PrivacyResult {
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

export default function PrivacyResultsPage() {
  const [, navigate] = useLocation();
  const [result, setResult] = useState<PrivacyResult | null>(null);

  useEffect(() => {
    const storedResult = sessionStorage.getItem("privacyResult");
    if (storedResult) {
      setResult(JSON.parse(storedResult));
    }
  }, []);
  
  if (!result) {
    return (
      <DashboardLayout title="Results" breadcrumbs={[{ label: "Privacy Enhancement" }, { label: "Results" }]}>
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <p className="text-muted-foreground">No results to display</p>
          <Button onClick={() => navigate("/privacy")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Privacy Enhancement
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Privacy Enhancement Results" breadcrumbs={[{ label: "Privacy Enhancement" }, { label: "Results" }]}>
      <div className="space-y-4">
        <Button variant="outline" onClick={() => navigate("/privacy")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Privacy Enhancement
        </Button>
        <PrivacyResultsDetail result={result} />
      </div>
    </DashboardLayout>
  );
}

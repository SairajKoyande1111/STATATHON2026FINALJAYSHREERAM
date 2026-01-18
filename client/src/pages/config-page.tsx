import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Settings,
  Plus,
  Shield,
  Hospital,
  Landmark,
  GraduationCap,
  Building,
  Users,
  Sparkles,
  CheckCircle,
  Edit,
  Trash2,
  Loader2,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ConfigProfile } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";

const defaultProfiles = [
  {
    id: "low",
    name: "Low Privacy / High Utility",
    description: "Minimal privacy protection with maximum data utility. Suitable for non-sensitive data.",
    kValue: 2,
    lValue: 2,
    tValue: 0.8,
    epsilon: 5.0,
    suppressionLimit: 0.05,
    useCase: "Non-sensitive aggregate statistics",
    recommendedFor: ["Internal analytics", "Public statistics"],
    governmentClearance: "Unclassified",
    icon: Building,
    color: "text-chart-4",
  },
  {
    id: "medium",
    name: "Medium Privacy / Balanced",
    description: "Balanced privacy and utility for general purpose data protection.",
    kValue: 5,
    lValue: 3,
    tValue: 0.5,
    epsilon: 2.0,
    suppressionLimit: 0.1,
    useCase: "General business data",
    recommendedFor: ["Research data", "Survey results"],
    governmentClearance: "Confidential",
    icon: Shield,
    color: "text-chart-5",
  },
  {
    id: "high",
    name: "High Privacy / Secure",
    description: "Strong privacy guarantees for sensitive personal data.",
    kValue: 10,
    lValue: 5,
    tValue: 0.2,
    epsilon: 0.5,
    suppressionLimit: 0.2,
    useCase: "Sensitive personal data",
    recommendedFor: ["Healthcare data", "Financial records"],
    governmentClearance: "Secret",
    icon: Shield,
    color: "text-destructive",
  },
  {
    id: "healthcare",
    name: "Healthcare Specialized",
    description: "HIPAA-compliant settings for medical and health data.",
    kValue: 10,
    lValue: 4,
    tValue: 0.3,
    epsilon: 1.0,
    suppressionLimit: 0.15,
    useCase: "Medical records and health data",
    recommendedFor: ["Hospitals", "Research institutions", "Insurance"],
    governmentClearance: "Secret",
    icon: Hospital,
    color: "text-chart-1",
  },
  {
    id: "financial",
    name: "Financial Regulatory",
    description: "Compliance with financial data protection regulations.",
    kValue: 8,
    lValue: 4,
    tValue: 0.25,
    epsilon: 1.5,
    suppressionLimit: 0.12,
    useCase: "Banking and financial transactions",
    recommendedFor: ["Banks", "Insurance companies", "Fintech"],
    governmentClearance: "Secret",
    icon: Landmark,
    color: "text-chart-2",
  },
  {
    id: "education",
    name: "Education Research",
    description: "Settings for educational research and student data.",
    kValue: 5,
    lValue: 3,
    tValue: 0.4,
    epsilon: 2.5,
    suppressionLimit: 0.1,
    useCase: "Educational records and research",
    recommendedFor: ["Universities", "Research institutes", "Education boards"],
    governmentClearance: "Confidential",
    icon: GraduationCap,
    color: "text-chart-3",
  },
  {
    id: "public",
    name: "Public Statistics",
    description: "For publishing aggregate statistics to the public.",
    kValue: 11,
    lValue: 5,
    tValue: 0.15,
    epsilon: 0.8,
    suppressionLimit: 0.2,
    useCase: "Census and public data releases",
    recommendedFor: ["Government agencies", "Statistical bureaus"],
    governmentClearance: "Unclassified",
    icon: Users,
    color: "text-chart-4",
  },
  {
    id: "synthetic",
    name: "Synthetic Data Generation",
    description: "Settings optimized for synthetic data generation.",
    kValue: 5,
    lValue: 3,
    tValue: 0.5,
    epsilon: 3.0,
    suppressionLimit: 0.0,
    useCase: "Training data and testing",
    recommendedFor: ["ML development", "Software testing", "Data sharing"],
    governmentClearance: "Unclassified",
    icon: Sparkles,
    color: "text-chart-3",
  },
];

export default function ConfigPage() {
  const { toast } = useToast();
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newProfile, setNewProfile] = useState({
    name: "",
    description: "",
    kValue: 5,
    lValue: 3,
    tValue: 0.5,
    epsilon: 2.0,
    suppressionLimit: 0.1,
    useCase: "",
    governmentClearance: "Confidential",
  });

  const { data: customProfiles, isLoading } = useQuery<ConfigProfile[]>({
    queryKey: ["/api/config/profiles"],
  });

  const createMutation = useMutation({
    mutationFn: async (profile: any) => {
      const res = await apiRequest("POST", "/api/config/profiles", profile);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/config/profiles"] });
      setDialogOpen(false);
      setNewProfile({
        name: "",
        description: "",
        kValue: 5,
        lValue: 3,
        tValue: 0.5,
        epsilon: 2.0,
        suppressionLimit: 0.1,
        useCase: "",
        governmentClearance: "Confidential",
      });
      toast({
        title: "Profile created",
        description: "Your custom privacy profile has been saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Creation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/config/profiles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/config/profiles"] });
      toast({
        title: "Profile deleted",
        description: "The profile has been removed.",
      });
    },
  });

  const handleApplyProfile = (profile: typeof defaultProfiles[0]) => {
    setSelectedProfile(profile.id);
    toast({
      title: "Profile applied",
      description: `${profile.name} settings are now active.`,
    });
  };

  return (
    <DashboardLayout title="Configuration" breadcrumbs={[{ label: "Configuration" }]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Privacy Profiles</h2>
            <p className="text-sm text-muted-foreground">
              Pre-configured settings for different use cases and compliance requirements
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-profile">
                <Plus className="mr-2 h-4 w-4" />
                Create Profile
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Custom Profile</DialogTitle>
                <DialogDescription>
                  Define your own privacy configuration profile
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Profile Name</Label>
                  <Input
                    value={newProfile.name}
                    onChange={(e) => setNewProfile({ ...newProfile, name: e.target.value })}
                    placeholder="My Custom Profile"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={newProfile.description}
                    onChange={(e) => setNewProfile({ ...newProfile, description: e.target.value })}
                    placeholder="Describe the use case for this profile"
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>K-Anonymity Value: {newProfile.kValue}</Label>
                    <Slider
                      value={[newProfile.kValue]}
                      onValueChange={([v]) => setNewProfile({ ...newProfile, kValue: v })}
                      min={2}
                      max={20}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>L-Diversity Value: {newProfile.lValue}</Label>
                    <Slider
                      value={[newProfile.lValue]}
                      onValueChange={([v]) => setNewProfile({ ...newProfile, lValue: v })}
                      min={2}
                      max={10}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>T-Closeness: {newProfile.tValue.toFixed(2)}</Label>
                    <Slider
                      value={[newProfile.tValue]}
                      onValueChange={([v]) => setNewProfile({ ...newProfile, tValue: v })}
                      min={0.1}
                      max={1}
                      step={0.05}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Epsilon: {newProfile.epsilon.toFixed(1)}</Label>
                    <Slider
                      value={[newProfile.epsilon]}
                      onValueChange={([v]) => setNewProfile({ ...newProfile, epsilon: v })}
                      min={0.1}
                      max={10}
                      step={0.1}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createMutation.mutate(newProfile)}
                  disabled={createMutation.isPending || !newProfile.name}
                >
                  {createMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Create Profile
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {defaultProfiles.map((profile) => (
            <Card
              key={profile.id}
              className={`cursor-pointer transition-all ${
                selectedProfile === profile.id ? "ring-2 ring-primary" : ""
              }`}
              onClick={() => handleApplyProfile(profile)}
              data-testid={`card-profile-${profile.id}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className={`p-2 rounded-md bg-muted ${profile.color}`}>
                    <profile.icon className="h-5 w-5" />
                  </div>
                  {selectedProfile === profile.id && (
                    <CheckCircle className="h-5 w-5 text-primary" />
                  )}
                </div>
                <CardTitle className="text-base mt-3">{profile.name}</CardTitle>
                <CardDescription className="text-xs line-clamp-2">
                  {profile.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded bg-muted/50">
                    <p className="text-muted-foreground">K-Value</p>
                    <p className="font-semibold">{profile.kValue}</p>
                  </div>
                  <div className="p-2 rounded bg-muted/50">
                    <p className="text-muted-foreground">L-Value</p>
                    <p className="font-semibold">{profile.lValue}</p>
                  </div>
                  <div className="p-2 rounded bg-muted/50">
                    <p className="text-muted-foreground">T-Value</p>
                    <p className="font-semibold">{profile.tValue}</p>
                  </div>
                  <div className="p-2 rounded bg-muted/50">
                    <p className="text-muted-foreground">Epsilon</p>
                    <p className="font-semibold">{profile.epsilon}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {profile.recommendedFor.slice(0, 2).map((rec) => (
                    <Badge key={rec} variant="outline" className="text-xs">
                      {rec}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {customProfiles && customProfiles.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Custom Profiles</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {customProfiles.map((profile) => (
                <Card key={profile.id} data-testid={`card-custom-profile-${profile.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="p-2 rounded-md bg-primary/10 text-primary">
                        <Settings className="h-5 w-5" />
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(profile.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <CardTitle className="text-base mt-3">{profile.name}</CardTitle>
                    <CardDescription className="text-xs">
                      {profile.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded bg-muted/50">
                        <p className="text-muted-foreground">K-Value</p>
                        <p className="font-semibold">{profile.kValue}</p>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <p className="text-muted-foreground">Epsilon</p>
                        <p className="font-semibold">{profile.epsilon}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

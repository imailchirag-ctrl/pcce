"use client";

import { useState } from "react";
import { Activity, ArrowRight, CheckCircle2, Clock, Loader2, RotateCw, UserCheck, Users, XCircle } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge, Card, CardTitle, EmptyState } from "@/components/ui/primitives";
import { Heading, Metric, StatusBadge } from "@/components/workspace/shared";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace-provider";

const STAGES = [
  { id: "APPLIED", label: "Applied", tone: "primary" },
  { id: "REVIEWING", label: "Reviewing", tone: "warm" },
  { id: "SHORTLISTED", label: "Shortlisted", tone: "amber" },
  { id: "INTERVIEW", label: "Interview", tone: "amber" },
  { id: "OFFER", label: "Offer extended", tone: "green" },
  { id: "REJECTED", label: "Declined", tone: "coral" },
] as const;

export function RecruiterPipelinePage() {
  const { pipeline, updateApplicationStatus, refresh } = useWorkspace();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const apps = pipeline ?? [];
  const shortlistedCount = apps.filter((a) => a.status === "SHORTLISTED").length;
  const interviewCount = apps.filter((a) => a.status === "INTERVIEW").length;
  const offerCount = apps.filter((a) => a.status === "OFFER").length;

  const handleStatusChange = async (appId: string, nextStatus: string) => {
    setUpdatingId(appId);
    try {
      await updateApplicationStatus(appId, nextStatus);
      await refresh();
      window.dispatchEvent(
        new CustomEvent("skillbridge-toast", { detail: `Candidate moved to ${nextStatus} stage!` }),
      );
    } catch (err: any) {
      alert(err?.message || "Failed to update candidate stage.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <AppShell>
      <Heading
        eyebrow="Recruiter pipeline"
        title="Candidate application pipeline"
        detail="Review active applicants, evaluate credentials, and transition candidates through every hiring milestone."
        action={
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RotateCw size={13} className="mr-1.5" /> Refresh
          </Button>
        }
      />

      {/* 4 Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Metric
          label="Total applicants"
          value={String(apps.length)}
          caption="Active in all stages"
          icon={Users}
          tint="primary"
        />
        <Metric
          label="Shortlisted"
          value={String(shortlistedCount)}
          caption="Qualified by resume fit"
          icon={CheckCircle2}
          tint="orange"
        />
        <Metric
          label="Interviewing"
          value={String(interviewCount)}
          caption="Active interview rounds"
          icon={Activity}
          tint="brown"
        />
        <Metric
          label="Offers extended"
          value={String(offerCount)}
          caption="Final stage candidates"
          icon={UserCheck}
          tint="primary"
        />
      </div>

      {/* Pipeline Board / List */}
      <Card className="mt-5 p-5 sm:p-6">
        <CardTitle detail="Manage and advance applicants across each stage">
          Active candidates ({apps.length})
        </CardTitle>

        {apps.length > 0 ? (
          <div className="mt-4 space-y-3.5">
            {apps.map((app) => {
              const isUpdating = updatingId === app.id;

              return (
                <div
                  key={app.id}
                  className="rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition hover:bg-white"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#FFF5E5] border border-[#EDE6DA] text-xs font-bold text-[#75451F]">
                      {app.candidate_name?.slice(0, 2).toUpperCase() || "CA"}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-sm text-[#24211D] truncate">{app.candidate_name}</p>
                        <StatusBadge status={app.status} />
                      </div>
                      <p className="text-xs text-[#75451F] font-medium truncate">Applying for: {app.job_title}</p>
                      <p className="text-[10px] text-[#6F675C] mt-0.5">
                        {app.candidate_email} · Applied on {new Date(app.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Stage mover dropdown */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-semibold text-[#6F675C]">Stage:</span>
                    <div className="relative">
                      <select
                        className="input h-9 text-xs pr-8 py-1 bg-white font-semibold text-[#24211D]"
                        value={app.status}
                        onChange={(e) => void handleStatusChange(app.id, e.target.value)}
                        disabled={isUpdating}
                      >
                        {STAGES.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      {isUpdating && (
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                          <Loader2 size={12} className="animate-spin text-[#E99A32]" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState
              title="No applications in pipeline"
              detail="When candidates apply to your published positions, their profiles will appear here for review."
            />
          </div>
        )}
      </Card>
    </AppShell>
  );
}

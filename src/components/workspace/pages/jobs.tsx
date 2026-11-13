"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  Filter,
  Loader2,
  MapPin,
  RotateCw,
  Search,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge, Card, CardTitle, EmptyState, SkillPill } from "@/components/ui/primitives";
import { Heading, Metric } from "@/components/workspace/shared";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace-provider";

export function JobsPage() {
  const {
    jobs: jobList,
    savedJobIds,
    applications,
    matches,
    toggleSave,
    apply,
    refresh,
  } = useWorkspace();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "saved" | "matched">("all");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const allJobs = jobList ?? [];
  const matchMap = useMemo(() => {
    const map = new Map<string, number>();
    matches?.jobs?.forEach((m) => {
      map.set(m.id, m.match_percent);
    });
    return map;
  }, [matches]);

  const appliedJobIds = useMemo(() => {
    return new Set((applications ?? []).map((a) => a.job_id));
  }, [applications]);

  const filteredJobs = useMemo(() => {
    return allJobs.filter((job) => {
      const q = query.toLowerCase();
      const matchesQuery =
        !q ||
        job.title.toLowerCase().includes(q) ||
        job.company.toLowerCase().includes(q) ||
        job.required_skills?.some((s) => s.toLowerCase().includes(q));

      if (!matchesQuery) return false;

      if (filter === "saved") return savedJobIds.includes(job.id);
      if (filter === "matched") return (matchMap.get(job.id) || 0) >= 60;
      return true;
    });
  }, [allJobs, query, filter, savedJobIds, matchMap]);

  const handleToggleSave = async (jobId: string) => {
    setSavingId(jobId);
    try {
      await toggleSave(jobId);
    } catch (err: any) {
      console.error("Save error", err);
    } finally {
      setSavingId(null);
    }
  };

  const handleApply = async (jobId: string, title: string) => {
    setApplyingId(jobId);
    try {
      await apply(jobId);
      window.dispatchEvent(
        new CustomEvent("skillbridge-toast", { detail: `Application submitted for ${title}!` }),
      );
    } catch (err: any) {
      alert(err?.message || "Failed to submit application.");
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <AppShell>
      <Heading
        eyebrow="Job opportunities"
        title="Explore open positions"
        detail="Discover positions aligned with your validated capabilities and career ambitions."
        action={
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RotateCw size={13} className="mr-1.5" /> Refresh
          </Button>
        }
      />

      {/* 3 Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="Available roles"
          value={String(allJobs.length)}
          caption="Verified openings"
          icon={BriefcaseBusiness}
          tint="primary"
        />
        <Metric
          label="Saved positions"
          value={String(savedJobIds.length)}
          caption="Bookmarked for later review"
          icon={Bookmark}
          tint="orange"
        />
        <Metric
          label="Applications submitted"
          value={String(applications.length)}
          caption="Active in recruiter pipelines"
          icon={CheckCircle2}
          tint="brown"
        />
      </div>

      {/* Search and Filters Bar */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6F675C]" />
          <input
            className="input pl-10"
            placeholder="Search by role title, company, or required skill…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-[#EDE6DA] bg-white p-1">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filter === "all" ? "bg-[#FFF5E5] text-[#75451F]" : "text-[#6F675C] hover:text-[#24211D]"
            }`}
          >
            All roles ({allJobs.length})
          </button>
          <button
            onClick={() => setFilter("matched")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filter === "matched" ? "bg-[#FFF5E5] text-[#75451F]" : "text-[#6F675C] hover:text-[#24211D]"
            }`}
          >
            High match ({allJobs.filter((j) => (matchMap.get(j.id) || 0) >= 60).length})
          </button>
          <button
            onClick={() => setFilter("saved")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filter === "saved" ? "bg-[#FFF5E5] text-[#75451F]" : "text-[#6F675C] hover:text-[#24211D]"
            }`}
          >
            Saved ({savedJobIds.length})
          </button>
        </div>
      </div>

      {/* Jobs Listing */}
      <div className="mt-5 space-y-3.5">
        {filteredJobs.map((job) => {
          const isSaved = savedJobIds.includes(job.id);
          const hasApplied = appliedJobIds.has(job.id);
          const matchPercent = matchMap.get(job.id);
          const isSaving = savingId === job.id;
          const isApplying = applyingId === job.id;

          return (
            <div
              key={job.id}
              className="rounded-2xl border border-[#EDE6DA] bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-base text-[#24211D]">{job.title}</h3>
                    {matchPercent != null && (
                      <Badge tone={matchPercent >= 75 ? "green" : "primary"}>
                        {matchPercent}% match
                      </Badge>
                    )}
                    {job.employment_type && (
                      <Badge tone="gray">{job.employment_type}</Badge>
                    )}
                  </div>

                  <p className="mt-1 text-xs font-semibold text-[#75451F]">
                    {job.company} · {job.location || "Remote"}
                    {job.salary && ` · ${job.salary}`}
                  </p>

                  <p className="mt-2.5 text-xs text-[#6F675C] line-clamp-2 leading-relaxed">
                    {job.description}
                  </p>

                  {job.required_skills && job.required_skills.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {job.required_skills.map((skill) => (
                        <SkillPill key={skill} tone="default">
                          {skill}
                        </SkillPill>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex sm:flex-col gap-2 shrink-0 justify-end">
                  <Button
                    variant={isSaved ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => void handleToggleSave(job.id)}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Bookmark size={13} className={isSaved ? "fill-current" : ""} />
                    )}
                    <span>{isSaved ? "Saved" : "Save"}</span>
                  </Button>

                  <Button
                    size="sm"
                    disabled={hasApplied || isApplying}
                    onClick={() => void handleApply(job.id, job.title)}
                  >
                    {isApplying ? (
                      <><Loader2 size={13} className="animate-spin mr-1" /> Applying…</>
                    ) : hasApplied ? (
                      <><Check size={13} className="mr-1" /> Applied</>
                    ) : (
                      "Apply now"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}

        {filteredJobs.length === 0 && (
          <EmptyState
            title="No matching roles found"
            detail={query ? `No positions match the query "${query}".` : "No jobs in this category yet."}
            action={
              query ? (
                <Button size="sm" variant="outline" onClick={() => setQuery("")}>
                  Clear search
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    </AppShell>
  );
}

"use client";

import { useState } from "react";
import { ArrowRight, BriefcaseBusiness, Check, Loader2, Plus, RotateCw, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge, Card, CardTitle, EmptyState, SkillPill } from "@/components/ui/primitives";
import { Heading, StatusBadge } from "@/components/workspace/shared";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace-provider";

export function RecruiterJobsPage() {
  const { jobs: jobList, createJob, updateJobStatus, refresh } = useWorkspace();
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("Remote");
  const [description, setDescription] = useState("");
  const [skills, setSkills] = useState("");
  const [running, setRunning] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const jobs = jobList ?? [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunning(true);
    setErrorMsg("");
    try {
      await createJob({
        title,
        company: company || undefined,
        location: location || "Remote",
        description,
        required_skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        tags: skills.split(",").map((s) => s.trim()).filter(Boolean),
      });
      await refresh();
      setTitle("");
      setCompany("");
      setLocation("Remote");
      setDescription("");
      setSkills("");
      window.dispatchEvent(
        new CustomEvent("skillbridge-toast", { detail: "Job posting published successfully!" }),
      );
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to create job posting.");
    } finally {
      setRunning(false);
    }
  };

  const handleToggleStatus = async (jobId: string, currentStatus: string) => {
    setTogglingId(jobId);
    const nextStatus = currentStatus === "PUBLISHED" ? "CLOSED" : "PUBLISHED";
    try {
      await updateJobStatus(jobId, nextStatus as any);
      await refresh();
    } catch (err: any) {
      alert(err?.message || "Failed to update job status.");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <AppShell>
      <Heading
        eyebrow="Job management"
        title="Manage job postings"
        detail="Publish open positions, update candidate requirements, and toggle application statuses."
        action={
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RotateCw size={13} className="mr-1.5" /> Refresh
          </Button>
        }
      />

      {errorMsg && (
        <div role="alert" className="mb-4 rounded-xl border border-[#C62828]/25 bg-[#C62828]/10 p-3.5 text-xs font-medium text-[#C62828]">
          {errorMsg}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Create Job Form (1/3 width on desktop) */}
        <Card className="p-5 sm:p-6 lg:col-span-1">
          <CardTitle detail="Create a new opening for candidates">
            Post new position
          </CardTitle>

          <form onSubmit={handleCreate} className="mt-4 space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-[#24211D] mb-1">Job title</label>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Senior Backend Engineer"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#24211D] mb-1">Company / Team</label>
              <input
                className="input"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Acme Corp"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#24211D] mb-1">Location</label>
              <input
                className="input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. San Francisco or Remote"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#24211D] mb-1">Description</label>
              <textarea
                className="input h-28"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Role summary, key responsibilities, and qualifications…"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#24211D] mb-1">
                Required skills (comma-separated)
              </label>
              <input
                className="input"
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                placeholder="Python, PostgreSQL, Docker, Redis"
                required
              />
            </div>

            <Button type="submit" className="w-full mt-2" disabled={running}>
              {running ? (
                <><Loader2 size={14} className="animate-spin mr-1.5" /> Publishing job…</>
              ) : (
                <><Plus size={15} className="mr-1" /> Publish opening</>
              )}
            </Button>
          </form>
        </Card>

        {/* Posted Jobs List (2/3 width on desktop) */}
        <Card className="p-5 sm:p-6 lg:col-span-2">
          <CardTitle detail={`Manage your ${jobs.length} listed job postings`}>
            Active listings ({jobs.length})
          </CardTitle>

          {jobs.length > 0 ? (
            <div className="mt-4 space-y-3.5">
              {jobs.map((job) => {
                const isToggling = togglingId === job.id;
                const isPublished = job.status === "PUBLISHED";

                return (
                  <div
                    key={job.id}
                    className="rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] p-4 transition-all hover:bg-white"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-2.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-[#24211D]">{job.title}</h3>
                          <StatusBadge status={job.status || "PUBLISHED"} />
                        </div>
                        <p className="mt-0.5 text-xs text-[#6F675C]">
                          {job.company || "Your organization"} · {job.location || "Remote"}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant={isPublished ? "outline" : "default"}
                          size="sm"
                          onClick={() => void handleToggleStatus(job.id, job.status || "PUBLISHED")}
                          disabled={isToggling}
                        >
                          {isToggling ? (
                            <Loader2 size={12} className="animate-spin mr-1" />
                          ) : null}
                          {isPublished ? "Close position" : "Re-publish"}
                        </Button>
                      </div>
                    </div>

                    <p className="text-xs text-[#6F675C] line-clamp-2 mb-3 leading-relaxed">
                      {job.description}
                    </p>

                    {job.required_skills && job.required_skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#EDE6DA]/60">
                        {job.required_skills.map((s) => (
                          <SkillPill key={s} tone="default">
                            {s}
                          </SkillPill>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState
                title="No job postings yet"
                detail="Use the form on the left to publish your first opening and start receiving candidate applications."
              />
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

"use client";

import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CheckCircle2, Clock, Users, Activity, RotateCw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge, Card, CardTitle, EmptyState } from "@/components/ui/primitives";
import { Heading, Metric, StatusBadge } from "@/components/workspace/shared";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace-provider";

export function RecruiterOverviewPage() {
  const { recruiter, pipeline, jobs, refresh } = useWorkspace();

  const jobList = jobs ?? recruiter?.jobs ?? [];
  const pipelineList = pipeline ?? [];
  const totalApplicants = pipelineList.length;
  const inInterviewCount = pipelineList.filter((a) => a.status === "INTERVIEW" || a.status === "SHORTLISTED").length;

  return (
    <AppShell>
      <Heading
        eyebrow="Recruiter workspace"
        title="Recruitment overview"
        detail="Manage your job postings, discover qualified candidates, and track applicants through your hiring pipeline."
        action={
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RotateCw size={13} className="mr-1.5" /> Refresh
          </Button>
        }
      />

      {/* 4 Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Active job postings"
          value={String(jobList.length)}
          caption="Published roles accepting candidates"
          icon={BriefcaseBusiness}
          tint="primary"
        />
        <Metric
          label="Total applicants"
          value={String(totalApplicants)}
          caption="Active candidates in pipeline"
          icon={Users}
          tint="orange"
        />
        <Metric
          label="In review / interview"
          value={String(inInterviewCount)}
          caption="Shortlisted for evaluations"
          icon={Activity}
          tint="brown"
        />
        <Metric
          label="Offers extended"
          value={String(pipelineList.filter((a) => a.status === "OFFER").length)}
          caption="Final stage candidates"
          icon={CheckCircle2}
          tint="primary"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {/* Recent Jobs (1/3 width) */}
        <Card className="p-5 sm:p-6">
          <CardTitle
            detail="Your latest postings"
            action={
              <Link href="/recruiter/jobs" className="text-xs font-bold text-[#75451F] hover:text-[#E99A32] flex items-center gap-1">
                Manage <ArrowRight size={12} />
              </Link>
            }
          >
            Job postings
          </CardTitle>

          <div className="mt-3 space-y-3">
            {jobList.slice(0, 5).map((job) => (
              <div
                key={job.id}
                className="rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] p-3 flex items-center justify-between"
              >
                <div className="min-w-0">
                  <p className="font-bold text-xs text-[#24211D] truncate">{job.title}</p>
                  <p className="text-[10px] text-[#6F675C] truncate">{job.company || "Your organization"}</p>
                </div>
                <StatusBadge status={job.status || "PUBLISHED"} />
              </div>
            ))}

            {jobList.length === 0 && (
              <p className="py-6 text-center text-xs text-[#6F675C]">No jobs posted yet.</p>
            )}
          </div>

          <Link href="/recruiter/jobs" className="block mt-4">
            <Button size="sm" className="w-full">
              Post a new job <ArrowRight size={13} />
            </Button>
          </Link>
        </Card>

        {/* Pipeline Preview (2/3 width) */}
        <Card className="p-5 sm:p-6 lg:col-span-2">
          <CardTitle
            detail="Recent candidate applications"
            action={
              <Link href="/recruiter/pipeline" className="text-xs font-bold text-[#75451F] hover:text-[#E99A32] flex items-center gap-1">
                Open full pipeline <ArrowRight size={12} />
              </Link>
            }
          >
            Hiring pipeline activity
          </CardTitle>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#EDE6DA] text-[11px] font-bold uppercase tracking-wider text-[#6F675C]">
                  <th className="pb-2.5 font-bold">Candidate</th>
                  <th className="pb-2.5 font-bold">Position</th>
                  <th className="pb-2.5 font-bold">Current Stage</th>
                  <th className="pb-2.5 font-bold text-right">Applied</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDE6DA]/70">
                {pipelineList.slice(0, 6).map((app) => (
                  <tr key={app.id} className="hover:bg-[#FFF5E5]/30 transition-colors">
                    <td className="py-3 font-bold text-[#24211D]">{app.candidate_name}</td>
                    <td className="py-3 text-[#6F675C]">{app.job_title}</td>
                    <td className="py-3">
                      <StatusBadge status={app.status} />
                    </td>
                    <td className="py-3 text-right text-[#6F675C]">
                      {new Date(app.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {pipelineList.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-xs text-[#6F675C]">
                      No active applications received yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

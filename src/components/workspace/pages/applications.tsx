"use client";

import Link from "next/link";
import { ArrowRight, Bookmark, BriefcaseBusiness, CheckCircle2, Clock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge, Card, CardTitle, EmptyState } from "@/components/ui/primitives";
import { Heading, Metric } from "@/components/workspace/shared";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace-provider";

export function ApplicationsPage() {
  const { applications, refresh } = useWorkspace();

  const items = applications ?? [];
  const reviewingCount = items.filter((a) => a.status === "REVIEWING" || a.status === "INTERVIEW" || a.status === "SHORTLISTED").length;
  const offersCount = items.filter((a) => a.status === "OFFER").length;

  return (
    <AppShell>
      <Heading
        eyebrow="Application tracking"
        title="Your job applications"
        detail="Track all positions you've applied to and follow their progress through each recruiter review stage."
        action={
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            Refresh
          </Button>
        }
      />

      {/* 3 Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="Total submitted"
          value={String(items.length)}
          caption="Total tracked applications"
          icon={Bookmark}
          tint="primary"
        />
        <Metric
          label="In active review"
          value={String(reviewingCount)}
          caption="Shortlisted or scheduled interviews"
          icon={Clock}
          tint="orange"
        />
        <Metric
          label="Offers extended"
          value={String(offersCount)}
          caption="Final stage offers received"
          icon={CheckCircle2}
          tint="brown"
        />
      </div>

      {items.length > 0 ? (
        <Card className="mt-5 p-5 sm:p-6">
          <CardTitle detail="Full list of your submitted job applications and active statuses">
            Application history
          </CardTitle>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#EDE6DA] text-[11px] font-bold uppercase tracking-wider text-[#6F675C]">
                  <th className="pb-2.5 font-bold">Position</th>
                  <th className="pb-2.5 font-bold">Company</th>
                  <th className="pb-2.5 font-bold">Status</th>
                  <th className="pb-2.5 font-bold text-right">Applied Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDE6DA]/70">
                {items.map((app, i) => {
                  const statusNormalized = (app.status || "APPLIED").toUpperCase();
                  const badgeTone =
                    statusNormalized === "OFFER" || statusNormalized === "SHORTLISTED"
                      ? "green"
                      : statusNormalized === "REJECTED" || statusNormalized === "CLOSED"
                        ? "coral"
                        : statusNormalized === "INTERVIEW" || statusNormalized === "REVIEWING"
                          ? "amber"
                          : "primary";

                  return (
                    <tr key={app.id || i} className="hover:bg-[#FFF5E5]/30 transition-colors">
                      <td className="py-3 font-bold text-[#24211D]">
                        {app.title || "Untitled position"}
                      </td>
                      <td className="py-3 text-[#6F675C] font-medium">{app.company || "—"}</td>
                      <td className="py-3">
                        <Badge tone={badgeTone}>
                          {app.status.replaceAll("_", " ").toLowerCase()}
                        </Badge>
                      </td>
                      <td className="py-3 text-right text-[#6F675C]">
                        {new Date(app.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="mt-5">
          <EmptyState
            title="No applications submitted yet"
            detail="Browse open positions tailored to your skill profile and apply directly from your workspace."
            action={
              <Link href="/jobs">
                <Button>
                  <BriefcaseBusiness size={14} className="mr-1.5" /> Explore jobs
                </Button>
              </Link>
            }
          />
        </div>
      )}
    </AppShell>
  );
}

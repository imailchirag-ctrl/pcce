"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  GraduationCap,
  MessageSquareText,
  RotateCw,
  Sparkles,
  Target,
  UploadCloud,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge, Card, CardTitle, EmptyState, Progress, Skeleton, SkillPill } from "@/components/ui/primitives";
import { Heading, Metric, ScoreRing } from "@/components/workspace/shared";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace-provider";

// Dynamically import Recharts to avoid SSR hydration mismatches and keep initial bundle light
const ResponsiveContainer = dynamic(
  () => import("recharts").then((mod) => mod.ResponsiveContainer),
  { ssr: false },
);
const AreaChart = dynamic(
  () => import("recharts").then((mod) => mod.AreaChart),
  { ssr: false },
);
const Area = dynamic(
  () => import("recharts").then((mod) => mod.Area),
  { ssr: false },
);
const PieChart = dynamic(
  () => import("recharts").then((mod) => mod.PieChart),
  { ssr: false },
);
const Pie = dynamic(
  () => import("recharts").then((mod) => mod.Pie),
  { ssr: false },
);
const Cell = dynamic(
  () => import("recharts").then((mod) => mod.Cell),
  { ssr: false },
);
const Tooltip = dynamic(
  () => import("recharts").then((mod) => mod.Tooltip),
  { ssr: false },
);
const XAxis = dynamic(
  () => import("recharts").then((mod) => mod.XAxis),
  { ssr: false },
);
const YAxis = dynamic(
  () => import("recharts").then((mod) => mod.YAxis),
  { ssr: false },
);
const CartesianGrid = dynamic(
  () => import("recharts").then((mod) => mod.CartesianGrid),
  { ssr: false },
);

export function DashboardPage() {
  const {
    user,
    dashboard,
    matches,
    roadmap,
    interviewHistory,
    notifications,
    unread,
    live,
    loading,
    error,
    refresh,
    loadModelStatus,
  } = useWorkspace();

  useEffect(() => {
    void loadModelStatus();
  }, [loadModelStatus]);

  // Loading State Skeleton
  if (loading && !dashboard) {
    return (
      <AppShell>
        <div className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-80 lg:col-span-2" />
            <Skeleton className="h-80" />
          </div>
        </div>
      </AppShell>
    );
  }

  // Error State with Retry
  if (error && !dashboard) {
    return (
      <AppShell>
        <div className="p-6">
          <EmptyState
            title="Unable to load dashboard data"
            detail={error}
            action={
              <Button onClick={() => void refresh()}>
                <RotateCw size={14} className="mr-1.5" /> Try again
              </Button>
            }
          />
        </div>
      </AppShell>
    );
  }

  // Fallback empty view if no dashboard data
  if (!dashboard) {
    return (
      <AppShell>
        <Heading
          eyebrow="Candidate career workspace"
          title="Your career workspace"
          detail="Get started by uploading your resume to extract skills and compute your readiness score."
        />
        <EmptyState
          title="No career data yet"
          detail="Upload your resume to discover your matched skills, roadmaps, and tailored job recommendations."
          action={
            <Link href="/resume">
              <Button>
                <UploadCloud size={15} className="mr-1.5" /> Upload resume
              </Button>
            </Link>
          }
        />
      </AppShell>
    );
  }

  const ready = dashboard.readiness?.score ?? 0;
  const roadmapItems = roadmap?.items ?? [];
  const roadmapPercent = dashboard.roadmap?.percent ?? 0;
  const roadmapDone = dashboard.roadmap?.completed ?? 0;
  const roadmapHours = dashboard.roadmap?.total_hours ?? 0;

  const counts = dashboard.applications?.counts ?? {};
  const appsTotal = dashboard.applications?.total ?? 0;
  const avgScore = dashboard.interviews?.average_score ?? null;

  const matchedJobs = matches?.jobs ?? [];
  const skillsTotal = Math.max(1, dashboard.skills.total || (dashboard.skills.matched + dashboard.skills.missing));
  const matchedPercent = Math.round((dashboard.skills.matched / skillsTotal) * 100);
  const partialPercent = Math.round(((dashboard.skills.partial || 0) / skillsTotal) * 100);
  const missingPercent = Math.round((dashboard.skills.missing / skillsTotal) * 100);

  // Pie chart application status palette
  const appStatusColors: Record<string, string> = {
    APPLIED: "#F4B942",
    REVIEWING: "#E99A32",
    SHORTLISTED: "#2E7D32",
    INTERVIEW: "#75451F",
    OFFER: "#2E7D32",
    REJECTED: "#C62828",
    WITHDRAWN: "#6F675C",
  };

  const appData = Object.entries(counts).map(([status, count]) => ({
    name: status.replaceAll("_", " "),
    value: count,
    color: appStatusColors[status] || "#F4B942",
  }));

  return (
    <AppShell>
      <Heading
        eyebrow="Candidate career workspace"
        title="Your dashboard at a glance"
        detail={`Welcome back, ${user?.name || "there"}. Here is your live career readiness, skill gap analysis, and matched jobs.`}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={live ? "primary" : "gray"}>
              <span className="mr-1.5 size-1.5 rounded-full bg-[#E99A32]" />
              {live ? "Live synced" : "Standby"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={loading}
            >
              <RotateCw size={13} className={loading ? "animate-spin" : ""} />
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        }
      />

      {/* 4 Stat Cards Row using approved tints */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Readiness score"
          value={`${ready}%`}
          caption="Weighted career fit"
          icon={Target}
          tint="primary"
        />
        <Metric
          label="Skills detected"
          value={String(dashboard.skills.total)}
          caption={dashboard.skills.missing > 0 ? `${dashboard.skills.missing} missing capabilities` : "All role requirements covered"}
          icon={BarChart3}
          tint="orange"
        />
        <Metric
          label="Mock interviews"
          value={String(dashboard.interviews?.total ?? 0)}
          caption={`${dashboard.interviews?.completed ?? 0} completed · avg ${avgScore !== null ? `${avgScore}%` : "—"}`}
          icon={MessageSquareText}
          tint="brown"
        />
        <Metric
          label="Applications"
          value={String(appsTotal)}
          caption={appsTotal > 0 ? `${appsTotal} active in pipeline` : "No job applications yet"}
          icon={BriefcaseBusiness}
          tint="primary"
        />
      </div>

      {/* Balanced Grid: 2/3 Skill Gap Card and 1/3 Roadmap Card */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3 items-start">
        {/* Skill Gap Card (2/3 width on desktop) */}
        <Card className="p-5 sm:p-6 lg:col-span-2">
          <CardTitle
            detail="Skill coverage against your target role"
            action={
              <Link href="/career">
                <Button variant="ghost" size="sm">
                  Deep comparison <ArrowRight size={13} />
                </Button>
              </Link>
            }
          >
            Skill gap analysis
          </CardTitle>

          {/* 3 Metric Mini-tiles */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[#EDE6DA] bg-[#FFF5E5]/70 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#75451F]">Matched</span>
                <span className="text-xs font-bold text-[#75451F]">{matchedPercent}%</span>
              </div>
              <p className="mt-1 text-2xl font-bold text-[#24211D]">{dashboard.skills.matched}</p>
              <div className="mt-2.5">
                <Progress value={matchedPercent} />
              </div>
            </div>

            <div className="rounded-xl border border-[#EDE6DA] bg-[#FFF5E5]/40 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#75451F]">Partial</span>
                <span className="text-xs font-bold text-[#75451F]">{partialPercent}%</span>
              </div>
              <p className="mt-1 text-2xl font-bold text-[#24211D]">{dashboard.skills.partial || 0}</p>
              <div className="mt-2.5">
                <Progress value={partialPercent} />
              </div>
            </div>

            <div className="rounded-xl border border-[#EDE6DA] bg-white p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#6F675C]">Missing</span>
                <span className="text-xs font-bold text-[#6F675C]">{missingPercent}%</span>
              </div>
              <p className="mt-1 text-2xl font-bold text-[#24211D]">{dashboard.skills.missing}</p>
              <div className="mt-2.5">
                <Progress value={missingPercent} />
              </div>
            </div>
          </div>

          {/* Skills by Category: natural flow, no vertical clipping */}
          {dashboard.skills.by_category && Object.keys(dashboard.skills.by_category).length > 0 ? (
            <div className="mt-6 border-t border-[#EDE6DA] pt-4">
              <p className="text-xs font-bold uppercase tracking-wider text-[#75451F] mb-3">
                Detected skills by category
              </p>
              <div className="grid gap-3.5 sm:grid-cols-2">
                {Object.entries(dashboard.skills.by_category).map(([category, skills]) => (
                  <div key={category} className="rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] p-3">
                    <p className="text-xs font-bold text-[#24211D] mb-2">{category}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {skills.map((s) => (
                        <SkillPill key={s} tone="default">
                          {s}
                        </SkillPill>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState
                title="No skills detected yet"
                detail="Upload your resume to extract validated skills and compare them against target roles."
                action={
                  <Link href="/resume">
                    <Button size="sm">
                      <UploadCloud size={14} className="mr-1.5" /> Upload resume
                    </Button>
                  </Link>
                }
              />
            </div>
          )}
        </Card>

        {/* Roadmap Progress Card (1/3 width on desktop) */}
        <Card className="p-5 sm:p-6">
          <CardTitle detail="Milestones toward closing gaps">Roadmap progress</CardTitle>
          <div className="py-2">
            <ScoreRing value={roadmapPercent} label="Completed" size={136} />
          </div>

          <div className="mt-4 space-y-2 rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] p-3.5 text-xs">
            <div className="flex justify-between">
              <span className="text-[#6F675C]">Total learning modules</span>
              <span className="font-bold text-[#24211D]">{roadmapItems.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6F675C]">Completed modules</span>
              <span className="font-bold text-[#75451F]">{roadmapDone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6F675C]">Estimated study hours</span>
              <span className="font-bold text-[#24211D]">{roadmapHours} hrs</span>
            </div>
          </div>

          {roadmapItems.length > 0 ? (
            <Link href="/learn" className="block mt-4">
              <Button size="sm" className="w-full">
                View full roadmap <ArrowRight size={14} />
              </Button>
            </Link>
          ) : (
            <Link href="/learn" className="block mt-4">
              <Button variant="secondary" size="sm" className="w-full">
                Generate roadmap <ArrowRight size={14} />
              </Button>
            </Link>
          )}
        </Card>
      </div>

      {/* Matched Jobs and Activity Row */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {/* Matched Jobs (2/3 width) */}
        <Card className="p-5 sm:p-6 lg:col-span-2">
          <CardTitle
            detail="Roles matching your current profile"
            action={
              <Link href="/jobs" className="text-xs font-bold text-[#75451F] hover:text-[#E99A32] flex items-center gap-1">
                Explore all jobs <ArrowRight size={13} />
              </Link>
            }
          >
            Matched jobs
          </CardTitle>

          {matchedJobs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#EDE6DA] text-[11px] font-bold uppercase tracking-wider text-[#6F675C]">
                    <th className="pb-2.5 font-bold">Role</th>
                    <th className="pb-2.5 font-bold">Company</th>
                    <th className="pb-2.5 font-bold">Match</th>
                    <th className="pb-2.5 font-bold">Missing skills</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EDE6DA]/70">
                  {matchedJobs.slice(0, 5).map((job) => (
                    <tr key={job.id} className="hover:bg-[#FFF5E5]/40 transition-colors">
                      <td className="py-3 font-bold text-[#24211D]">{job.title}</td>
                      <td className="py-3 text-[#6F675C]">{job.company}</td>
                      <td className="py-3">
                        <Badge tone={job.match_percent >= 75 ? "green" : "primary"}>
                          {job.match_percent}%
                        </Badge>
                      </td>
                      <td className="py-3 text-[#6F675C]">
                        {job.missing_skills?.slice(0, 3).join(", ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No matched jobs yet"
              detail="Upload your resume to discover positions tailored to your verified skills."
              action={
                <Link href="/resume">
                  <Button size="sm">
                    <Sparkles size={14} className="mr-1.5" /> Analyze resume
                  </Button>
                </Link>
              }
            />
          )}
        </Card>

        {/* Recent Activity (1/3 width) */}
        <Card className="p-5 sm:p-6">
          <CardTitle detail="Recent notifications & updates">Recent activity</CardTitle>
          <div className="space-y-3">
            {notifications.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-2.5 border-b border-[#EDE6DA]/60 pb-2.5 last:border-0 last:pb-0"
              >
                <span
                  className="mt-1.5 size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.read ? "#EDE6DA" : "#E99A32" }}
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#24211D]">{item.title}</p>
                  {item.detail && <p className="mt-0.5 text-[11px] leading-4 text-[#6F675C]">{item.detail}</p>}
                  <p className="mt-1 text-[10px] font-semibold text-[#75451F]">
                    {new Date(item.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
            {notifications.length === 0 && (
              <EmptyState
                title="All caught up"
                detail="Your recent applications, scores, and updates will appear here."
              />
            )}
          </div>
        </Card>
      </div>

      {/* Trends and Applications Charts Row */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* Readiness Trend Chart */}
        <Card className="p-5 sm:p-6">
          <CardTitle detail="Score progression over time">Readiness trend</CardTitle>
          <div className="h-60 w-full">
            {dashboard.readiness_trend && dashboard.readiness_trend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dashboard.readiness_trend.slice(-6).map((t, i) => ({ ...t, name: t.date || `W${i + 1}` }))}>
                  <defs>
                    <linearGradient id="warmGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F4B942" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#F4B942" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EDE6DA" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6F675C" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#6F675C" }} axisLine={false} tickLine={false} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      background: "#FFFFFF",
                      border: "1px solid #EDE6DA",
                      borderRadius: "10px",
                      color: "#24211D",
                      fontSize: "12px",
                      boxShadow: "0 4px 16px rgba(117,69,31,0.1)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="readiness"
                    stroke="#F4B942"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#warmGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                title="No trend data yet"
                detail="Complete resume analyses and practice interviews to view your progress curve."
              />
            )}
          </div>
        </Card>

        {/* Applications by Status Pie Chart */}
        <Card className="p-5 sm:p-6">
          <CardTitle detail="Active pipeline breakdown">Application status</CardTitle>
          <div className="h-60 w-full">
            {appData.length > 0 && appsTotal > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    contentStyle={{
                      background: "#FFFFFF",
                      border: "1px solid #EDE6DA",
                      borderRadius: "10px",
                      color: "#24211D",
                      fontSize: "12px",
                    }}
                  />
                  <Pie
                    data={appData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={45}
                    paddingAngle={3}
                  >
                    {appData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                title="No applications tracked"
                detail="Apply to matched positions to track your progress through interviews and offers."
                action={
                  <Link href="/jobs">
                    <Button size="sm">
                      <BriefcaseBusiness size={14} className="mr-1.5" /> Browse jobs
                    </Button>
                  </Link>
                }
              />
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

"use client";

import Link from "next/link";
import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import dynamic from "next/dynamic";
import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Check,
  FileText,
  Gamepad2,
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
import { CountUp } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
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
    notifications,
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

  const journey: JourneyStep[] = [
    { label: "Upload resume", href: "/resume", icon: FileText, done: dashboard.skills.total > 0 },
    { label: "Match a career", href: "/career", icon: Target, done: ready > 0 },
    { label: "Build roadmap", href: "/learn", icon: GraduationCap, done: roadmapItems.length > 0 },
    { label: "Practice interview", href: "/interviews", icon: MessageSquareText, done: (dashboard.interviews?.completed ?? 0) > 0 },
    { label: "Apply to a role", href: "/jobs", icon: BriefcaseBusiness, done: appsTotal > 0 },
  ];

  return (
    <AppShell>
      <WelcomeHero
        name={user?.name || "there"}
        readiness={ready}
        journey={journey}
        live={live}
        loading={loading}
        onRefresh={() => void refresh()}
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

      <QuestPromo />

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
            <div className="rounded-xl border border-[#EDE6DA] bg-[#FFF5E5]/70 p-3.5 transition hover:-translate-y-0.5 hover:border-[#F4B942]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#75451F]">Matched</span>
                <span className="text-xs font-bold text-[#75451F]">{matchedPercent}%</span>
              </div>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[#24211D]"><CountUp value={dashboard.skills.matched} /></p>
              <div className="mt-2.5">
                <Progress value={matchedPercent} />
              </div>
            </div>

            <div className="rounded-xl border border-[#EDE6DA] bg-[#FFF5E5]/40 p-3.5 transition hover:-translate-y-0.5 hover:border-[#F4B942]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#75451F]">Partial</span>
                <span className="text-xs font-bold text-[#75451F]">{partialPercent}%</span>
              </div>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[#24211D]"><CountUp value={dashboard.skills.partial || 0} /></p>
              <div className="mt-2.5">
                <Progress value={partialPercent} />
              </div>
            </div>

            <div className="rounded-xl border border-[#EDE6DA] bg-white p-3.5 transition hover:-translate-y-0.5 hover:border-[#F4B942]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#6F675C]">Missing</span>
                <span className="text-xs font-bold text-[#6F675C]">{missingPercent}%</span>
              </div>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[#24211D]"><CountUp value={dashboard.skills.missing} /></p>
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
                        <SkillPill key={s} tone="matched">
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
                    <tr key={job.id} className="group transition-colors hover:bg-[#FFF5E5]/60">
                      <td className="py-3 font-bold text-[#24211D]">
                        <Link href={`/jobs?q=${encodeURIComponent(job.title)}`} className="inline-flex items-center gap-1.5 group-hover:text-[#75451F]">
                          {job.title}
                          <ArrowRight size={12} className="-translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" />
                        </Link>
                      </td>
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

type JourneyStep = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  done: boolean;
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function WelcomeHero({
  name,
  readiness,
  journey,
  live,
  loading,
  onRefresh,
}: {
  name: string;
  readiness: number;
  journey: JourneyStep[];
  live: boolean;
  loading: boolean;
  onRefresh: () => void;
}) {
  const reduce = useReducedMotion();
  const doneCount = journey.filter((step) => step.done).length;
  const nextStep = journey.find((step) => !step.done);
  const firstName = name.split(" ")[0];

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#3A2512] via-[#5C3818] to-[#8A5422] p-6 text-white shadow-[0_24px_60px_-28px_rgba(117,69,31,0.75)] sm:p-8"
    >
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-[0.18] [background-image:radial-gradient(rgba(255,255,255,0.5)_1px,transparent_1px)]" />
      <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-[#F4B942]/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 left-1/3 size-64 rounded-full bg-[#E99A32]/20 blur-3xl" />

      <div className="relative grid items-center gap-7 lg:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#F4D9A6]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 normal-case tracking-normal">
              <span className={cn("size-1.5 rounded-full", live ? "live-dot bg-[#7CE38B]" : "bg-white/50")} />
              {live ? "Live synced" : "Standby"}
            </span>
            Candidate workspace
          </div>
          <h1 className="font-display mt-3 text-3xl font-bold tracking-tight sm:text-[38px] sm:leading-[1.1]">
            {greeting()}, <span className="bg-gradient-to-r from-[#FFE3A3] to-[#F4B942] bg-clip-text text-transparent">{firstName}</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/70">
            {nextStep
              ? `You're ${doneCount} of ${journey.length} steps into your career journey. Next up: ${nextStep.label.toLowerCase()}.`
              : "Every step of your journey is complete. Keep your scores fresh and keep applying."}
          </p>

          {/* Journey stepper */}
          <ol className="mt-6 flex flex-wrap items-center gap-y-3">
            {journey.map((step, index) => {
              const Icon = step.icon;
              const isNext = step === nextStep;
              return (
                <li key={step.href} className="flex items-center">
                  <Link
                    href={step.href}
                    title={step.label}
                    className={cn(
                      "group flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-xs font-semibold transition hover:-translate-y-0.5",
                      step.done
                        ? "border-[#F4B942]/40 bg-[#F4B942]/20 text-[#FFE3A3]"
                        : isNext
                          ? "border-white/40 bg-white text-[#5C3818] shadow-[0_0_0_4px_rgba(255,255,255,0.12)]"
                          : "border-white/15 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-6 place-items-center rounded-full",
                        step.done ? "bg-[#F4B942] text-[#3A2512]" : isNext ? "bg-[#F4B942] text-[#3A2512]" : "bg-white/10",
                      )}
                    >
                      {step.done ? <Check size={13} strokeWidth={3} /> : <Icon size={12} />}
                    </span>
                    {step.label}
                    {isNext && <ArrowRight size={12} className="transition group-hover:translate-x-0.5" />}
                  </Link>
                  {index < journey.length - 1 && (
                    <span className={cn("mx-1.5 h-px w-4 sm:w-6", step.done ? "bg-[#F4B942]/60" : "bg-white/15")} />
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex items-center gap-5 lg:flex-col lg:items-end">
          <div className="relative grid size-[132px] place-items-center rounded-full bg-white/[0.06] p-2 ring-1 ring-white/10">
            <HeroRing value={readiness} />
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-white/20 disabled:opacity-60"
          >
            <RotateCw size={13} className={loading ? "animate-spin" : ""} />
            {loading ? "Refreshing…" : "Refresh data"}
          </button>
        </div>
      </div>
    </motion.section>
  );
}

function HeroRing({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const r = 42;
  const circ = 2 * Math.PI * r;
  const bounded = Math.max(0, Math.min(100, value));
  return (
    <div className="relative size-full" role="img" aria-label={`Readiness score ${bounded}%`}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <defs>
          <linearGradient id="hero-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFE3A3" />
            <stop offset="100%" stopColor="#E99A32" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" />
        <motion.circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="url(#hero-ring)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={reduce ? false : { strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - bounded / 100) }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="font-display text-[28px] font-bold leading-none tabular-nums">
            <CountUp value={bounded} suffix="%" />
          </p>
          <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white/60">Readiness</p>
        </div>
      </div>
    </div>
  );
}

function QuestPromo() {
  return (
    <Link
      href="/career-quest"
      className="group relative mt-5 flex flex-col items-start gap-4 overflow-hidden rounded-2xl border border-[#F4B942]/50 bg-gradient-to-r from-[#FFF5E5] via-[#FFF9EE] to-[#FFEFD0] p-5 transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-20px_rgba(233,154,50,0.6)] sm:flex-row sm:items-center sm:p-6"
    >
      <span className="float-slow grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#F4B942] to-[#E99A32] text-[#3A2512] shadow-[0_10px_24px_-10px_rgba(233,154,50,0.9)]">
        <Gamepad2 size={26} />
      </span>
      <div className="flex-1">
        <p className="eyebrow">New · Career Quest</p>
        <p className="font-display mt-0.5 text-lg font-bold text-[#24211D]">Play a day as a Software Engineer</p>
        <p className="mt-0.5 text-xs text-[#6F675C]">Debug real APIs, handle an incident with an AI manager, earn XP and a readiness report.</p>
      </div>
      <span className="shine inline-flex items-center gap-2 rounded-xl bg-[#24211D] px-4 py-2.5 text-sm font-semibold text-white transition group-hover:bg-[#3A2512]">
        Play now <ArrowRight size={15} className="transition group-hover:translate-x-1" />
      </span>
    </Link>
  );
}

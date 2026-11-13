"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  Check,
  CircleAlert,
  Clock3,
  Database,
  ExternalLink,
  FileSearch,
  Flame,
  Globe2,
  GraduationCap,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Badge, Card, CardTitle, EmptyState, Progress, Skeleton } from "@/components/ui/primitives";
import { Heading, Metric, ScoreRing, formatDate, relativeTime } from "@/components/workspace/shared";
import { cn } from "@/lib/utils";
import {
  errorMessage,
  intelligenceApi,
  TIER_STYLE,
  type Comparison,
  type JdAnalysis,
  type MarketDashboard,
  type RefreshResult,
  type RoleRecommendation,
  type RoleRequirements,
} from "@/features/intelligence/api";
import { FieldLabel, InlineNote, LoopStrip, TierChip, inputClass, selectClass } from "@/features/intelligence/components";

const SCOPES = [
  { key: "market", label: "Market", detail: "Live + platform, no samples" },
  { key: "live", label: "Live feeds", detail: "Remotive + Arbeitnow only" },
  { key: "platform", label: "Platform jobs", detail: "Jobs posted inside SkillBridge" },
  { key: "mine", label: "My postings", detail: "Job descriptions you pasted" },
  { key: "sample", label: "Sample", detail: "Illustrative demo data" },
] as const;

const KIND_LABEL: Record<string, string> = {
  live: "Live feed",
  platform: "Platform job",
  user: "Pasted JD",
  sample: "Sample data",
};

function scopeMeta(scope: string) {
  return SCOPES.find((item) => item.key === scope) ?? SCOPES[0];
}

function skillName(dashboard: MarketDashboard, key: string): string {
  return dashboard.top_skills.find((item) => item.skill === key)?.display ?? key.replaceAll("_", " ");
}

export function MarketIntelPage() {
  const [dashboard, setDashboard] = useState<MarketDashboard | null>(null);
  const [scope, setScope] = useState<(typeof SCOPES)[number]["key"]>("market");
  const [loading, setLoading] = useState(true);
  const [scopeBusy, setScopeBusy] = useState(false);
  const [error, setError] = useState("");

  const [roles, setRoles] = useState<{ role_key: string; title: string }[]>([]);
  const [roleKey, setRoleKey] = useState("");
  const [roleData, setRoleData] = useState<{ requirements: RoleRequirements; comparison: Comparison } | null>(null);
  const [roleBusy, setRoleBusy] = useState(false);
  const [roleError, setRoleError] = useState("");

  const [recommendations, setRecommendations] = useState<RoleRecommendation[]>([]);
  const [recsBusy, setRecsBusy] = useState(true);

  const [refreshQuery, setRefreshQuery] = useState("software engineer");
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshResults, setRefreshResults] = useState<RefreshResult[]>([]);
  const [refreshNote, setRefreshNote] = useState("");

  const [jdTitle, setJdTitle] = useState("");
  const [jdText, setJdText] = useState("");
  const [jdBusy, setJdBusy] = useState(false);
  const [jdError, setJdError] = useState("");
  const [jd, setJd] = useState<JdAnalysis | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [nextDashboard, roleList, recs] = await Promise.all([
          intelligenceApi.dashboard("market"),
          intelligenceApi.roles(),
          intelligenceApi.recommendations(),
        ]);
        if (cancelled) return;
        setDashboard(nextDashboard);
        setRoles(roleList.roles);
        setRecommendations(recs.roles);
        setRoleKey((current) => current || roleList.roles[0]?.role_key || "");
      } catch (loadError) {
        if (!cancelled) setError(errorMessage(loadError, "Market intelligence could not load."));
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRecsBusy(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!roleKey) return;
    let cancelled = false;
    async function loadRole() {
      setRoleBusy(true);
      setRoleError("");
      try {
        const result = await intelligenceApi.role(roleKey);
        if (!cancelled) setRoleData(result);
      } catch (loadError) {
        if (!cancelled) setRoleError(errorMessage(loadError, "Role requirements could not load."));
      } finally {
        if (!cancelled) setRoleBusy(false);
      }
    }
    void loadRole();
    return () => {
      cancelled = true;
    };
  }, [roleKey]);

  const changeScope = useCallback(async (nextScope: (typeof SCOPES)[number]["key"]) => {
    setScope(nextScope);
    setScopeBusy(true);
    setError("");
    try {
      const nextDashboard = await intelligenceApi.dashboard(nextScope);
      setDashboard(nextDashboard);
    } catch (loadError) {
      setError(errorMessage(loadError, "That market view could not load."));
    } finally {
      setScopeBusy(false);
    }
  }, []);

  async function refreshLive() {
    setRefreshBusy(true);
    setRefreshNote("");
    setError("");
    try {
      const result = await intelligenceApi.refresh(refreshQuery.trim() || "software engineer", true);
      setRefreshResults(result.results);
      if (scope === "market") {
        setDashboard(result.dashboard);
      } else {
        const nextDashboard = await intelligenceApi.dashboard(scope);
        setDashboard(nextDashboard);
      }
      const ok = result.results.filter((item) => item.status === "ok").length;
      const failed = result.results.filter((item) => item.status === "failed").length;
      setRefreshNote(
        failed
          ? `${ok} provider(s) returned data; ${failed} failed. Existing cached postings are still shown and labelled below.`
          : `${ok} provider(s) refreshed. Provenance and counts now include the newest postings.`,
      );
    } catch (refreshError) {
      setError(errorMessage(refreshError, "Live refresh failed. Cached data is still available."));
    } finally {
      setRefreshBusy(false);
    }
  }

  async function analyzeJd(event: FormEvent) {
    event.preventDefault();
    if (jdText.trim().length < 60) {
      setJdError("Paste at least 60 characters of the job description.");
      return;
    }
    setJdBusy(true);
    setJdError("");
    setJd(null);
    try {
      const result = await intelligenceApi.analyzeJd(jdTitle.trim() || "Pasted job description", jdText.trim(), roleKey || undefined);
      setJd(result);
    } catch (jdaError) {
      setJdError(errorMessage(jdaError, "That job description could not be analyzed."));
    } finally {
      setJdBusy(false);
    }
  }

  const comparisonBySkill = useMemo(() => {
    const map = new Map<string, Comparison["requirements"][number]>();
    for (const row of roleData?.comparison.requirements ?? []) map.set(row.skill, row);
    return map;
  }, [roleData]);

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl space-y-5">
          <div className="skeleton h-24 rounded-3xl" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="skeleton h-28 rounded-2xl" />)}</div>
          <div className="grid gap-5 xl:grid-cols-3"><div className="skeleton h-80 rounded-2xl xl:col-span-2" /><div className="skeleton h-80 rounded-2xl" /></div>
          <span className="sr-only">Loading market intelligence…</span>
        </div>
      </AppShell>
    );
  }

  if (error && !dashboard) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl py-4">
          <EmptyState
            icon={TrendingUp}
            title="Market intelligence could not load"
            detail={error}
            action={<button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-[#75451F] px-4 py-2 text-xs font-semibold text-white">Try again</button>}
          />
        </div>
      </AppShell>
    );
  }

  if (!dashboard) return null;

  const meta = scopeMeta(dashboard.scope);
  const isSample = dashboard.scope === "sample";
  const providers = dashboard.provenance.providers;
  const topSkills = dashboard.top_skills.slice(0, 10);
  const maxShare = Math.max(...topSkills.map((item) => item.share), 1);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl">
        <LoopStrip active="market" />
        <Heading
          eyebrow="Market Intelligence · demand signals"
          title="What is the market actually asking for?"
          detail="Every number carries its source. Refresh live feeds, inspect provenance, and compare role requirements with the evidence in your twin."
          action={
            <Link href="/twin" className="inline-flex items-center gap-2 rounded-xl border border-[#EDE6DA] bg-white px-3.5 py-2 text-xs font-semibold text-[#75451F] transition hover:border-[#E3C894]">
              <Sparkles size={13} /> Compare my twin <ArrowRight size={13} />
            </Link>
          }
        />

        {error && <div className="mb-4"><InlineNote tone="error">{error}</InlineNote></div>}

        <div className="flex flex-wrap gap-1.5 rounded-2xl border border-[#EDE6DA] bg-[#FFFCF6] p-1.5">
          {SCOPES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => void changeScope(item.key)}
              disabled={scopeBusy}
              className={cn(
                "flex-1 rounded-xl px-3 py-2 text-left transition disabled:cursor-wait",
                dashboard.scope === item.key ? "bg-[#24211D] text-white shadow-sm" : "text-[#6F675C] hover:bg-white hover:text-[#24211D]",
              )}
              aria-pressed={dashboard.scope === item.key}
            >
              <span className="block text-[11px] font-bold">{item.label}</span>
              <span className={cn("block truncate text-[9px]", dashboard.scope === item.key ? "text-white/55" : "text-[#A89D8F]")}>{item.detail}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-[#EDE6DA] bg-white p-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-[11px] text-[#6F675C]">
            <Database size={14} className="text-[#75451F]" />
            <span className="font-semibold text-[#24211D]">{meta.label}</span>
            <span className="text-[#A89D8F]">· {meta.detail}</span>
            {isSample && <Badge tone="amber">Demo data</Badge>}
          </div>
          <form
            className="flex flex-1 gap-2 sm:justify-end"
            onSubmit={(event) => {
              event.preventDefault();
              void refreshLive();
            }}
          >
            <label className="relative min-w-0 flex-1 sm:max-w-[280px]">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#A89D8F]" />
              <span className="sr-only">Live job search query</span>
              <input
                value={refreshQuery}
                onChange={(event) => setRefreshQuery(event.target.value)}
                minLength={2}
                maxLength={60}
                placeholder="software engineer"
                className={cn(inputClass, "pl-8")}
              />
            </label>
            <button
              type="submit"
              disabled={refreshBusy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#75451F] px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-[#5D3518] disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw size={12} className={refreshBusy ? "animate-spin" : ""} /> {refreshBusy ? "Fetching…" : "Refresh live"}
            </button>
          </form>
        </div>
        {refreshNote && <div className="mt-2"><InlineNote tone="info">{refreshNote}</InlineNote></div>}
        {refreshResults.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {refreshResults.map((result) => (
              <span
                key={result.provider}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-medium",
                  result.status === "ok"
                    ? "border-[#2E7D32]/25 bg-[#2E7D32]/[0.06] text-[#2E7D32]"
                    : result.status === "failed"
                      ? "border-[#C62828]/20 bg-[#C62828]/[0.04] text-[#C62828]"
                      : "border-[#EDE6DA] bg-[#FFFCF6] text-[#6F675C]",
                )}
                title={result.error || undefined}
              >
                {result.status === "ok" ? <Check size={10} /> : result.status === "failed" ? <CircleAlert size={10} /> : <Clock3 size={10} />}
                {result.label} · {result.status} {result.status === "ok" ? `· +${result.new_postings}` : ""}
              </span>
            ))}
          </div>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={BriefcaseBusiness} label="Postings" value={String(dashboard.total_postings)} caption={`${meta.label} view · updated ${dashboard.provenance.sources[0] ? relativeTime(dashboard.provenance.sources[0].last) : "recently"}`} tint="primary" />
          <Metric icon={Flame} label="Top skill" value={topSkills[0]?.display ?? "—"} caption={topSkills[0] ? `Asked for in ${topSkills[0].share}% of postings.` : "Refresh to collect postings."} tint="orange" />
          <Metric icon={GraduationCap} label="Entry level" value={`${dashboard.entry_level.share}%`} caption={`${dashboard.entry_level.postings} postings open to early-career applicants.`} tint="brown" />
          <Metric icon={Globe2} label="Sources" value={String(dashboard.provenance.sources.length)} caption={`${providers.length} live providers configured.`} tint="primary" />
        </div>

        <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
          <Card className="rounded-3xl p-5 sm:p-6">
            <CardTitle detail={`Share of ${dashboard.total_postings} analyzed postings containing each skill.`} action={<BarChart3 size={19} className="text-[#E99A32]" />}>
              Most requested skills
            </CardTitle>
            {topSkills.length ? (
              <div className="space-y-2.5">
                {topSkills.map((skill, index) => (
                  <div key={skill.skill} className="group flex items-center gap-2.5">
                    <span className="w-4 text-right text-[9px] font-semibold text-[#B9AE9C]">{index + 1}</span>
                    <span className="w-28 truncate text-[11px] font-semibold text-[#24211D] sm:w-36" title={skill.display}>{skill.display}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#FFF5E5]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#F4B942] to-[#E99A32] transition-all duration-500 group-hover:from-[#E99A32] group-hover:to-[#D98521]"
                        style={{ width: `${Math.max(3, (skill.share / maxShare) * 100)}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-[10px] font-bold tabular-nums text-[#6F675C]">{skill.share}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Search} title="No postings in this view" detail="Refresh the live feeds or paste a job description to start building market evidence." />
            )}

            <div className="mt-6 grid gap-4 border-t border-[#F0EBE2] pt-5 sm:grid-cols-2">
              <div>
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A7F71]"><Users size={12} /> Entry-level signal</p>
                <div className="mt-2 rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] p-3">
                  <div className="flex items-end justify-between gap-2">
                    <p className="font-display text-2xl font-bold text-[#24211D]">{dashboard.entry_level.share}%</p>
                    <p className="pb-1 text-[9px] text-[#8A7F71]">{dashboard.entry_level.postings} postings</p>
                  </div>
                  <Progress value={dashboard.entry_level.share} className="mt-2 h-1.5" />
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {dashboard.entry_level.top_skills.slice(0, 5).map((skill) => <span key={skill.skill} className="rounded-md border border-[#EDE6DA] bg-white px-1.5 py-0.5 text-[9px] text-[#6F675C]">{skill.display}</span>)}
                  </div>
                </div>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A7F71]"><Layers size={12} /> Skill combinations</p>
                <div className="mt-2 space-y-1.5">
                  {dashboard.combinations.slice(0, 4).map((combo) => (
                    <div key={combo.skills.join("|")} className="flex items-center justify-between gap-2 rounded-lg border border-[#EDE6DA] bg-white px-2.5 py-1.5">
                      <span className="min-w-0 truncate text-[10px] text-[#4A443C]">{combo.skills.join(" + ")}</span>
                      <span className="shrink-0 text-[9px] font-semibold text-[#75451F]">{combo.share}%</span>
                    </div>
                  ))}
                  {dashboard.combinations.length === 0 && <p className="rounded-lg border border-dashed border-[#E3D8C5] px-2.5 py-3 text-[10px] text-[#8A7F71]">Pairs appear once at least two postings share skills.</p>}
                </div>
              </div>
            </div>
          </Card>

          <Card className="rounded-3xl p-5">
            <CardTitle detail="Numbers come from stored postings, never a hard-coded chart." action={<Database size={18} className="text-[#E99A32]" />}>
              Provenance
            </CardTitle>
            <div className="space-y-2">
              {dashboard.provenance.sources.map((source) => {
                const provider = providers.find((item) => item.key === source.provider);
                return (
                  <div key={`${source.data_kind}-${source.provider}`} className="rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold text-[#24211D]">{KIND_LABEL[source.data_kind] ?? source.data_kind} · {source.provider}</p>
                      <span className="text-[10px] font-bold tabular-nums text-[#75451F]">{source.n}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[9px] text-[#A89D8F]">
                      <span>last retrieved {formatDate(source.last)}</span>
                      {provider && <a href={provider.homepage} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-[#75451F] hover:underline">{provider.label} <ArrowUpRight size={9} /></a>}
                    </div>
                  </div>
                );
              })}
              {dashboard.provenance.sources.length === 0 && <p className="text-[10px] text-[#8A7F71]">No provenance records yet.</p>}
            </div>

            <p className="mt-4 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A7F71]"><Clock3 size={12} /> Recent fetches</p>
            <div className="mt-2 space-y-1.5">
              {dashboard.provenance.recent_fetches.slice(0, 4).map((fetch) => (
                <div key={`${fetch.fetched_at}-${fetch.provider}`} className="flex items-start justify-between gap-2 text-[9px]">
                  <span className="min-w-0">
                    <span className="block truncate text-[#4A443C]">{fetch.provider} · “{fetch.query}”</span>
                    <span className="text-[#A89D8F]">{relativeTime(fetch.fetched_at)} · {fetch.postings} postings</span>
                  </span>
                  <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 font-semibold", fetch.status === "ok" ? "bg-[#2E7D32]/10 text-[#2E7D32]" : "bg-[#C62828]/10 text-[#C62828]")}>{fetch.status}</span>
                </div>
              ))}
              {dashboard.provenance.recent_fetches.length === 0 && <p className="text-[10px] text-[#8A7F71]">No live fetches logged yet.</p>}
            </div>

            <div className="mt-4 rounded-xl border border-[#EDE6DA] bg-[#FFF5E5]/60 px-3 py-2.5">
              <p className="text-[9px] leading-4 text-[#75451F]">
                <b>{isSample ? "Demo data." : "Source-aware."}</b>{" "}
                {isSample
                  ? "This view is illustrative only — switch to Market or Live for real signals."
                  : "Sample rows are excluded from the market view and pasted JDs are only visible to you."}
              </p>
            </div>
          </Card>
        </div>

        <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
          <Card className="rounded-3xl p-5 sm:p-6">
            <CardTitle
              detail={roleData ? `${roleData.requirements.requirements.length} requirements · ${roleData.requirements.source === "market" ? `${roleData.requirements.postings_analyzed} postings` : "curated baseline"}` : "Loading requirements…"}
              action={<Target size={19} className="text-[#E99A32]" />}
            >
              Role requirements vs. your twin
            </CardTitle>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <select aria-label="Select a role" value={roleKey} onChange={(event) => setRoleKey(event.target.value)} className={cn(selectClass, "sm:max-w-[280px]")}>
                {roles.map((item) => <option key={item.role_key} value={item.role_key}>{item.title}</option>)}
              </select>
              {roleData && <span className="text-[10px] text-[#8A7F71]">Alignment is evidence-weighted: verified 100%, demonstrated 80%, claimed 35%.</span>}
            </div>
            {roleError && <div className="mb-3"><InlineNote tone="error">{roleError}</InlineNote></div>}
            {roleBusy && <div className="mb-3 flex items-center gap-2 text-[11px] text-[#8A7F71]"><Loader2 size={12} className="animate-spin" /> Loading role requirements…</div>}
            {roleData ? (
              <>
                {roleData.requirements.note && <div className="mb-3"><InlineNote tone="warning">{roleData.requirements.note}</InlineNote></div>}
                <div className="flex flex-col items-center gap-4 rounded-2xl border border-[#EDE6DA] bg-[#FFFCF6] p-3 sm:flex-row sm:p-4">
                  <ScoreRing value={roleData.comparison.alignment} label="Your fit" size={104} />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-lg font-bold text-[#24211D]">{roleData.requirements.title}</h3>
                    <p className="mt-0.5 text-[11px] leading-5 text-[#6F675C]">{roleData.requirements.summary}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[9px] text-[#8A7F71]">
                      <span className="rounded-full border border-[#EDE6DA] bg-white px-2 py-0.5">{roleData.comparison.method} matching</span>
                      <span className="rounded-full border border-[#EDE6DA] bg-white px-2 py-0.5">{roleData.requirements.source === "market" ? "Market-derived" : "Curated baseline"}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 overflow-hidden rounded-xl border border-[#EDE6DA]">
                  <div className="hidden grid-cols-[1.4fr_.7fr_.6fr_.8fr] gap-2 bg-[#FFF5E5] px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-[#8A7F71] sm:grid">
                    <span>Requirement</span><span>Demand</span><span>Tier</span><span>Your state</span>
                  </div>
                  <div className="max-h-[360px] divide-y divide-[#F0EBE2] overflow-y-auto">
                    {roleData.requirements.requirements.map((requirement) => {
                      const row = comparisonBySkill.get(requirement.skill);
                      return (
                        <div key={requirement.skill} className="grid gap-1.5 bg-white px-3 py-2.5 sm:grid-cols-[1.4fr_.7fr_.6fr_.8fr] sm:items-center sm:gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-semibold text-[#24211D]">{requirement.display} {requirement.essential && <span className="text-[#C62828]">*</span>}</p>
                            <p className="text-[9px] text-[#A89D8F]">{requirement.category}</p>
                          </div>
                          <span className="text-[10px] text-[#6F675C]">{requirement.share === null ? "Role profile" : `${requirement.share}%`}</span>
                          <span>{row ? <TierChip tier={row.state} /> : <span className="text-[9px] text-[#A89D8F]">—</span>}</span>
                          <div className="flex items-center gap-1.5">
                            {row && row.state !== "missing" && row.state !== "adjacent" ? (
                              <><div className="h-1.5 w-12 overflow-hidden rounded-full bg-[#F3E9D8]"><div className="h-full rounded-full" style={{ width: `${row.proficiency}%`, backgroundColor: TIER_STYLE[row.state].dot }} /></div><span className="text-[9px] text-[#6F675C]">{Math.round(row.proficiency)}</span></>
                            ) : row?.closest_skill ? (
                              <span className="text-[9px] text-[#A1743A]">Adjacent: {row.closest_skill}</span>
                            ) : (
                              <span className="text-[9px] text-[#C62828]">No evidence</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <p className="mt-2 text-[9px] text-[#A89D8F]">* Essential requirement. Comparison rows come from {roleData.comparison.role.title} and the same evidence ledger as your Digital Twin.</p>
              </>
            ) : (
              !roleBusy && <EmptyState icon={Target} title="Choose a role" detail="Select a role to compare its requirements with your proven skills." />
            )}
          </Card>

          <div className="space-y-5">
            <Card className="rounded-3xl p-5">
              <CardTitle detail="Where demand appears in the data." action={<Building2 size={18} className="text-[#E99A32]" />}>Role demand</CardTitle>
              {dashboard.roles.length ? (
                <div className="space-y-2.5">
                  {dashboard.roles.slice(0, 7).map((role) => (
                    <button key={role.role_key} type="button" onClick={() => setRoleKey(role.role_key)} className="flex w-full items-center gap-2 text-left group">
                      <span className="w-24 truncate text-[10px] font-medium text-[#4A443C] group-hover:text-[#75451F] sm:w-28" title={role.title}>{role.title}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#FFF5E5]">
                        <div className="h-full rounded-full bg-[#E99A32]/70" style={{ width: `${Math.max(4, (role.postings / Math.max(1, dashboard.roles[0].postings)) * 100)}%` }} />
                      </div>
                      <span className="w-7 text-right text-[9px] font-bold tabular-nums text-[#6F675C]">{role.postings}</span>
                    </button>
                  ))}
                </div>
              ) : <p className="text-[10px] text-[#8A7F71]">No role-classified postings in this view.</p>}
            </Card>

            <Card className="rounded-3xl p-5">
              <CardTitle detail="Emerging skills with thin current demand." action={<Activity size={18} className="text-[#E99A32]" />}>Frontier watchlist</CardTitle>
              <div className="space-y-2">
                {dashboard.frontier.slice(0, 7).map((skill) => (
                  <div key={skill.skill} className="flex items-center justify-between gap-2 rounded-lg border border-[#EDE6DA] bg-[#FFFCF6] px-2.5 py-2">
                    <span className="truncate text-[10px] font-medium text-[#4A443C]">{skill.display}</span>
                    <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold", skill.postings > 0 ? "bg-[#F4B942]/20 text-[#75451F]" : "bg-[#F0EBE2] text-[#A89D8F]")}>{skill.postings > 0 ? `${skill.postings} · ${skill.share}%` : "Watch"}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="rounded-3xl p-5">
              <CardTitle detail={dashboard.trend.available ? "Share of postings per day." : "Not enough history yet."} action={<TrendingUp size={18} className="text-[#E99A32]" />}>Demand trend</CardTitle>
              {dashboard.trend.available ? (
                <div className="space-y-2.5">
                  {(dashboard.trend.skills ?? []).slice(0, 4).map((skill) => {
                    const points = dashboard.trend.series.map((point) => Number(point[skill] ?? 0));
                    const latest = points[points.length - 1] ?? 0;
                    const max = Math.max(...points, 1);
                    return (
                      <div key={skill}>
                        <div className="flex items-center justify-between text-[9px]"><span className="font-medium text-[#4A443C]">{skillName(dashboard, skill)}</span><span className="font-bold text-[#75451F]">{latest}%</span></div>
                        <div className="mt-1 flex h-8 items-end gap-1">
                          {points.map((point, index) => (
                            <div key={`${skill}-${index}`} className="flex-1 rounded-t-sm bg-gradient-to-t from-[#E99A32] to-[#F4B942]" style={{ height: `${Math.max(8, (point / max) * 100)}%` }} title={`${dashboard.trend.days[index]}: ${point}%`} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-[9px] text-[#A89D8F]">{dashboard.trend.days[0]} → {dashboard.trend.days[dashboard.trend.days.length - 1]}</p>
                </div>
              ) : (
                <InlineNote tone="info">{dashboard.trend.note || "Demand trends appear after at least two days of stored postings."}</InlineNote>
              )}
            </Card>
          </div>
        </div>

        <div className="mt-5 grid items-start gap-5 xl:grid-cols-2">
          <Card className="rounded-3xl p-5 sm:p-6">
            <CardTitle detail="Scored from your evidence, target role, market demand and exchange interests." action={<Sparkles size={19} className="text-[#E99A32]" />}>Role recommendations</CardTitle>
            {recsBusy ? (
              <div className="space-y-2">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-16 rounded-xl" />)}</div>
            ) : recommendations.length ? (
              <div className="space-y-2">
                {recommendations.map((role, index) => (
                  <div key={role.role_key} className="rounded-xl border border-[#EDE6DA] bg-white p-3 transition hover:border-[#E3C894]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-bold", index === 0 ? "bg-[#F4B942] text-[#3A2512]" : "bg-[#FFF5E5] text-[#75451F]")}>{index + 1}</span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-[#24211D]">{role.title}</p>
                          <p className="mt-0.5 text-[10px] leading-4 text-[#6F675C]">{role.reasons[0]}</p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-display text-base font-bold text-[#75451F]">{role.score}</p>
                        <p className="text-[8px] uppercase tracking-wider text-[#A89D8F]">score</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-[#FFF5E5] px-1.5 py-0.5 text-[9px] text-[#75451F]">{role.alignment}% aligned</span>
                      <span className="rounded-full bg-[#FFF5E5] px-1.5 py-0.5 text-[9px] text-[#75451F]">{role.market_share}% market</span>
                      {role.missing.slice(0, 3).map((item) => <span key={item} className="rounded-full border border-[#EDE6DA] px-1.5 py-0.5 text-[9px] text-[#8A7F71]">missing {item}</span>)}
                      <button type="button" onClick={() => setRoleKey(role.role_key)} className="ml-auto inline-flex items-center gap-0.5 text-[9px] font-semibold text-[#75451F] hover:underline">Compare <ArrowRight size={9} /></button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Sparkles} title="No recommendations yet" detail="Add skills to your twin or set a target role to generate evidence-backed role suggestions." />
            )}
          </Card>

          <Card className="rounded-3xl p-5 sm:p-6">
            <CardTitle detail="Paste a posting to extract skills and compare it privately." action={<FileSearch size={19} className="text-[#E99A32]" />}>Job description analyzer</CardTitle>
            <form onSubmit={(event) => void analyzeJd(event)} className="space-y-2.5">
              <div>
                <FieldLabel htmlFor="jd-title">Job title (optional)</FieldLabel>
                <input id="jd-title" value={jdTitle} onChange={(event) => setJdTitle(event.target.value)} maxLength={160} placeholder="Machine Learning Intern" className={inputClass} />
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor="jd-text">Job description</FieldLabel>
                  <span className="mb-1 text-[9px] text-[#A89D8F]">{jdText.trim().length}/30000 · min 60</span>
                </div>
                <textarea
                  id="jd-text"
                  value={jdText}
                  onChange={(event) => setJdText(event.target.value)}
                  rows={6}
                  maxLength={30000}
                  placeholder="Paste the responsibilities and requirements here…"
                  className={cn(inputClass, "resize-y leading-5")}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[9px] leading-4 text-[#A89D8F]">Stored privately; only extracted skills are kept.</p>
                <button type="submit" disabled={jdBusy || jdText.trim().length < 60} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#24211D] px-3.5 py-2 text-[11px] font-semibold text-white transition hover:bg-[#3A2512] disabled:cursor-not-allowed disabled:opacity-50">
                  {jdBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {jdBusy ? "Analyzing…" : "Analyze JD"}
                </button>
              </div>
            </form>
            {jdError && <div className="mt-3"><InlineNote tone="error">{jdError}</InlineNote></div>}

            {jd && (
              <div className="mt-4 rounded-2xl border border-[#EDE6DA] bg-[#FFFCF6] p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold text-[#24211D]">{jd.comparison.role.title}</p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-semibold text-[#75451F]">{jd.comparison.alignment}% aligned</span>
                </div>
                <p className="mt-1 text-[10px] leading-4 text-[#6F675C]">{jd.note}</p>
                <div className="mt-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-[#8A7F71]">Detected skills</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {jd.skills.map((skill) => {
                      const row = jd.comparison.requirements.find((item) => item.skill === skill.skill);
                      return (
                        <span key={skill.skill} className="inline-flex items-center gap-1 rounded-lg border border-[#EDE6DA] bg-white px-2 py-1 text-[10px] text-[#4A443C]" title={`${Math.round(skill.confidence * 100)}% confidence · ${skill.method}`}>
                          {skill.display}
                          {row && <TierChip tier={row.state} showDot={false} className="px-1 py-0 text-[8px]" />}
                        </span>
                      );
                    })}
                    {jd.skills.length === 0 && <span className="text-[10px] text-[#8A7F71]">No taxonomy skills detected in this text.</span>}
                  </div>
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-2 text-[9px]">
                  <div className="rounded-lg bg-white px-2 py-1.5"><span className="text-[#8A7F71]">Missing: </span><span className="font-semibold text-[#C62828]">{jd.comparison.groups.missing.length}</span></div>
                  <div className="rounded-lg bg-white px-2 py-1.5"><span className="text-[#8A7F71]">Unverified: </span><span className="font-semibold text-[#A1743A]">{jd.comparison.groups.claimed.length}</span></div>
                </div>
                {(jd.keywords.keywords?.length ?? 0) > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {jd.keywords.keywords?.slice(0, 8).map((keyword) => <span key={keyword.keyword} className="rounded-md border border-[#EDE6DA] bg-white px-1.5 py-0.5 text-[9px] text-[#6F675C]">{keyword.keyword}</span>)}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        <Card className="mt-5 rounded-3xl p-5 sm:p-6">
          <CardTitle detail={`Newest rows in the ${meta.label.toLowerCase()} view.`} action={<CalendarClock size={19} className="text-[#E99A32]" />}>Recent postings</CardTitle>
          {dashboard.recent.length ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {dashboard.recent.map((posting, index) => (
                <div key={`${posting.title}-${index}`} className="flex min-w-0 flex-col rounded-xl border border-[#EDE6DA] bg-white p-3 transition hover:border-[#E3C894]">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-[11px] font-bold leading-4 text-[#24211D]">{posting.title}</p>
                    <span className="shrink-0 rounded-full bg-[#FFF5E5] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-[#75451F]">{KIND_LABEL[posting.data_kind] ?? posting.data_kind}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-[#8A7F71]">{posting.company || "Company not listed"} · {relativeTime(posting.retrieved_at)}</p>
                  <div className="mt-1.5 flex flex-1 flex-wrap gap-1">
                    {posting.skills.slice(0, 5).map((skill) => <span key={skill} className="rounded-md border border-[#EDE6DA] bg-[#FFFCF6] px-1.5 py-0.5 text-[9px] text-[#6F675C]">{skill}</span>)}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[9px] text-[#A89D8F]">{posting.provider}</span>
                    {posting.url ? (
                      <a href={posting.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-[#75451F] hover:underline">Open posting <ExternalLink size={9} /></a>
                    ) : <span className="text-[9px] text-[#A89D8F]">Stored text</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={BriefcaseBusiness}
              title="No postings in this view"
              detail={isSample ? "Sample data is empty. Refresh a live provider or switch the market scope." : "Run a live refresh above or paste a job description. Market metrics appear as soon as postings are stored."}
              action={<button type="button" onClick={() => void refreshLive()} disabled={refreshBusy} className="inline-flex items-center gap-1.5 rounded-xl bg-[#75451F] px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-60"><RefreshCw size={12} /> Refresh live data</button>}
            />
          )}
        </Card>
      </div>
    </AppShell>
  );
}


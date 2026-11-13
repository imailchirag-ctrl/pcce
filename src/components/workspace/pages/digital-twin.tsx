"use client";

import "@xyflow/react/dist/style.css";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  CalendarClock,
  Circle,
  CircleDashed,
  ExternalLink,
  GraduationCap,
  Layers,
  ListChecks,
  Loader2,
  MessageSquare,
  Network,
  RefreshCw,
  Route,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Wand2,
  X,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Card, CardTitle, EmptyState, Progress, SkillPill } from "@/components/ui/primitives";
import { AiNotice, Heading, Metric, ScoreRing, formatDate, relativeTime } from "@/components/workspace/shared";
import { cn } from "@/lib/utils";
import {
  errorMessage,
  intelligenceApi,
  TIER_STYLE,
  type ChatAnswer,
  type GraphNode,
  type Readiness,
  type SkillGraph,
  type Tier,
  type TimelineEvent,
  type Twin,
} from "@/features/intelligence/api";
import { InlineNote, LoopStrip, TierChip, inputClass, selectClass } from "@/features/intelligence/components";

const SkillGraphPanel = dynamic(
  () => import("@/features/intelligence/skill-graph").then((module) => module.SkillGraph),
  {
    ssr: false,
    loading: () => <div className="grid h-[560px] place-items-center rounded-2xl border border-[#EDE6DA] bg-[#FFFCF6] text-xs text-[#6F675C]">Drawing your skill graph…</div>,
  },
);

const DEFAULT_QUESTION = "Am I ready for an AI Engineer internship?";

const SUGGESTED_QUESTIONS = [
  "What have I actually proven?",
  "Which skills are still unverified?",
  "What should I learn next?",
  "Show me project evidence for machine learning",
];

const VERDICT_TONE: Record<Readiness["verdict"], { badge: string; label: string }> = {
  ready: { badge: "border-[#2E7D32]/30 bg-[#2E7D32]/10 text-[#2E7D32]", label: "Evidence supports applying" },
  close: { badge: "border-[#E99A32]/40 bg-[#E99A32]/15 text-[#75451F]", label: "Close the targeted gaps" },
  not_yet: { badge: "border-[#C62828]/25 bg-[#C62828]/10 text-[#C62828]", label: "Build evidence first" },
};

function asTier(value: string): Tier | "missing" {
  return value === "verified" || value === "demonstrated" || value === "claimed" ? value : "missing";
}

function SourceLink({ source }: { source: string }) {
  const label = source.replaceAll("_", " ");
  if (source === "career_quest") {
    return (
      <Link href="/career-quest" className="inline-flex items-center gap-0.5 font-semibold text-[#75451F] underline decoration-[#E99A32]/50 underline-offset-2 hover:decoration-[#E99A32]">
        {label} <ArrowUpRight size={10} />
      </Link>
    );
  }
  if (source === "team_project") {
    return (
      <Link href="/exchange" className="inline-flex items-center gap-0.5 font-semibold text-[#75451F] underline decoration-[#E99A32]/50 underline-offset-2 hover:decoration-[#E99A32]">
        {label} <ArrowUpRight size={10} />
      </Link>
    );
  }
  return <span className="font-semibold text-[#6F675C]">{label}</span>;
}

export function DigitalTwinPage() {
  const [twin, setTwin] = useState<Twin | null>(null);
  const [graph, setGraph] = useState<SkillGraph | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [roles, setRoles] = useState<{ role_key: string; title: string }[]>([]);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [graphBusy, setGraphBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | Tier | "missing">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const [readinessQuestion, setReadinessQuestion] = useState(DEFAULT_QUESTION);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [readinessBusy, setReadinessBusy] = useState(false);
  const [readinessError, setReadinessError] = useState("");

  const [chatQuestion, setChatQuestion] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState("");
  const [useLlm, setUseLlm] = useState(false);
  const [chat, setChat] = useState<{ question: string; answer: ChatAnswer }[]>([]);

  const loadReadiness = useCallback(async (question: string, roleKey?: string) => {
    setReadinessBusy(true);
    setReadinessError("");
    try {
      const result = await intelligenceApi.readiness(question.trim() || DEFAULT_QUESTION, roleKey || role || undefined);
      setReadiness(result);
    } catch (loadError) {
      setReadinessError(errorMessage(loadError, "Readiness could not be assessed."));
    } finally {
      setReadinessBusy(false);
    }
  }, [role]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [nextTwin, nextGraph, timeline, roleList] = await Promise.all([
          intelligenceApi.twin(),
          intelligenceApi.graph(),
          intelligenceApi.timeline(),
          intelligenceApi.roles(),
        ]);
        if (cancelled) return;
        setTwin(nextTwin);
        setGraph(nextGraph);
        setEvents(timeline.events);
        setRoles(roleList.roles);
        setRole(nextTwin.target_role || nextGraph.role.role_key);
        if (nextTwin.skills.length) {
          const result = await intelligenceApi.readiness(DEFAULT_QUESTION, nextTwin.target_role || nextGraph.role.role_key);
          if (!cancelled) setReadiness(result);
        }
      } catch (loadError) {
        if (!cancelled) setError(errorMessage(loadError, "Your Digital Twin could not load."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshTimeline = useCallback(async () => {
    const timeline = await intelligenceApi.timeline();
    setEvents(timeline.events);
  }, []);

  async function rebuild() {
    setRefreshing(true);
    setError("");
    setNotice("");
    try {
      const nextTwin = await intelligenceApi.rebuild();
      setTwin(nextTwin);
      const nextGraph = await intelligenceApi.graph(role || undefined);
      setGraph(nextGraph);
      await refreshTimeline();
      setNotice("Twin rebuilt from your stored evidence.");
    } catch (rebuildError) {
      setError(errorMessage(rebuildError, "The twin could not be rebuilt."));
    } finally {
      setRefreshing(false);
    }
  }

  async function changeRole(nextRole: string) {
    setRole(nextRole);
    setGraphBusy(true);
    setError("");
    try {
      const nextGraph = await intelligenceApi.graph(nextRole || undefined);
      setGraph(nextGraph);
      setSelectedId(null);
      setReadiness(null);
    } catch (roleError) {
      setError(errorMessage(roleError, "The graph could not be rebuilt for that role."));
    } finally {
      setGraphBusy(false);
    }
  }

  async function askReadiness(event: FormEvent) {
    event.preventDefault();
    await loadReadiness(readinessQuestion);
  }

  async function askChat(event: FormEvent) {
    event.preventDefault();
    const question = chatQuestion.trim();
    if (question.length < 2) return;
    setChatBusy(true);
    setChatError("");
    try {
      const answer = await intelligenceApi.chat(question, useLlm);
      setChat((items) => [{ question, answer }, ...items]);
      setChatQuestion("");
    } catch (chatFailure) {
      setChatError(errorMessage(chatFailure, "The grounded answer could not be generated."));
    } finally {
      setChatBusy(false);
    }
  }

  const categories = useMemo(
    () => Array.from(new Set((graph?.nodes ?? []).map((node) => node.category))).sort(),
    [graph],
  );

  const filteredNodes = useMemo(() => {
    return (graph?.nodes ?? []).filter((node) => {
      if (tierFilter !== "all" && node.status !== tierFilter) return false;
      if (categoryFilter !== "all" && node.category !== categoryFilter) return false;
      return true;
    });
  }, [graph, tierFilter, categoryFilter]);

  const selected = useMemo(
    () => (graph?.nodes ?? []).find((node) => node.id === selectedId) ?? null,
    [graph, selectedId],
  );

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl space-y-5">
          <div className="skeleton h-24 rounded-3xl" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => <div key={item} className="skeleton h-28 rounded-2xl" />)}
          </div>
          <div className="skeleton h-[560px] rounded-2xl" />
          <span className="sr-only">Loading your Digital Twin…</span>
        </div>
      </AppShell>
    );
  }

  if (error && !twin) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl py-4">
          <EmptyState
            icon={BrainCircuit}
            title="Your Digital Twin could not load"
            detail={error}
            action={
              <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-[#75451F] px-4 py-2 text-xs font-semibold text-white">
                Try again
              </button>
            }
          />
        </div>
      </AppShell>
    );
  }

  if (!twin) return null;

  const hasSkills = twin.skills.length > 0;
  const verdict = readiness ? VERDICT_TONE[readiness.verdict] : null;
  const targetRole = graph?.role.title ?? roles.find((item) => item.role_key === role)?.title ?? "your target role";

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl">
        <LoopStrip active="twin" />
        <Heading
          eyebrow="Digital Twin · evidence ledger"
          title="What can you actually prove?"
          detail="Every claim is ranked by evidence, not confidence. Resume mentions stay claimed until a test, a project contribution or a peer confirms them."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#EDE6DA] bg-[#FFFCF6] px-2.5 py-2 text-[11px] font-medium text-[#6F675C]">
                <CalendarClock size={13} className="text-[#75451F]" /> {twin.snapshots} snapshots
              </span>
              <button
                type="button"
                onClick={() => void rebuild()}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl bg-[#24211D] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#3A2512] disabled:cursor-wait disabled:opacity-60"
              >
                <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> {refreshing ? "Rebuilding…" : "Rebuild twin"}
              </button>
            </div>
          }
        />

        {error && <div className="mb-4"><InlineNote tone="error">{error}</InlineNote></div>}
        {notice && <div className="mb-4"><InlineNote tone="success">{notice}</InlineNote></div>}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={Layers} label="Total skills" value={String(twin.total)} caption="Across your resume, quests and projects." tint="brown" />
          <Metric icon={ShieldCheck} label="Verified" value={String(twin.counts.verified ?? 0)} caption="Backed by tests or a runner." tint="primary" />
          <Metric icon={Sparkles} label="Demonstrated" value={String(twin.counts.demonstrated ?? 0)} caption="Observed in assessed work or a confirmed contribution." tint="orange" />
          <Metric icon={CircleDashed} label="Claimed only" value={String(twin.counts.claimed ?? 0)} caption="Resume or profile mentions with no independent proof." tint="brown" />
        </div>

        {!hasSkills && (
          <div className="mt-5">
            <EmptyState
              icon={GraduationCap}
              title="No evidence yet"
              detail="Upload a resume to seed claims, then complete a Career Quest mission or a team project to upgrade them into demonstrated and verified skills."
              action={
                <div className="flex flex-wrap gap-2">
                  <Link href="/resume" className="inline-flex items-center gap-1.5 rounded-xl bg-[#75451F] px-3.5 py-2 text-xs font-semibold text-white">
                    Upload a resume <ArrowRight size={13} />
                  </Link>
                  <Link href="/career-quest" className="inline-flex items-center gap-1.5 rounded-xl border border-[#EDE6DA] bg-white px-3.5 py-2 text-xs font-semibold text-[#75451F]">
                    Try a quest
                  </Link>
                </div>
              }
            />
          </div>
        )}

        <section className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.65fr)]">
          <Card className="rounded-3xl p-4 sm:p-5">
            <CardTitle
              detail={`${filteredNodes.length} of ${graph?.nodes.length ?? 0} nodes · target role: ${targetRole}`}
              action={
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Target role"
                    value={role}
                    onChange={(event) => void changeRole(event.target.value)}
                    disabled={graphBusy}
                    className={cn(selectClass, "max-w-[190px]")}
                  >
                    {role && !roles.some((item) => item.role_key === role) && <option value={role}>{role}</option>}
                    {roles.map((item) => <option key={item.role_key} value={item.role_key}>{item.title}</option>)}
                  </select>
                </div>
              }
            >
              Skill evidence graph
            </CardTitle>

            <div className="mb-3 flex flex-col gap-2 sm:flex-row">
              <label className="relative flex-1">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#A89D8F]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Highlight a skill…"
                  aria-label="Highlight a skill in the graph"
                  className={cn(inputClass, "pl-8")}
                />
                {search && (
                  <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A89D8F] hover:text-[#75451F]">
                    <X size={13} />
                  </button>
                )}
              </label>
              <select aria-label="Filter by tier" value={tierFilter} onChange={(event) => setTierFilter(event.target.value as typeof tierFilter)} className={cn(selectClass, "sm:w-[148px]")}>
                <option value="all">All tiers</option>
                <option value="verified">Verified</option>
                <option value="demonstrated">Demonstrated</option>
                <option value="claimed">Claimed</option>
                <option value="missing">Missing</option>
              </select>
              <select aria-label="Filter by category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className={cn(selectClass, "sm:w-[160px]")}>
                <option value="all">All categories</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-[#6F675C]">
              {(["verified", "demonstrated", "claimed", "missing"] as const).map((key) => (
                <span key={key} className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ backgroundColor: TIER_STYLE[key].dot }} /> {TIER_STYLE[key].label}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5"><span className="h-px w-5 border-t-2 border-dashed border-[#E99A32]" /> Prerequisite</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-px w-5 bg-[#D8C8AE]" /> Related</span>
            </div>

            <div className={cn("relative", graphBusy && "opacity-60")}>
              <SkillGraphPanel
                nodes={filteredNodes}
                edges={graph?.edges ?? []}
                selectedId={selectedId}
                search={search}
                onSelect={setSelectedId}
              />
              {graphBusy && (
                <div className="absolute inset-0 grid place-items-center rounded-2xl bg-[#FFFCF6]/60">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#EDE6DA] bg-white px-3 py-1.5 text-xs font-medium text-[#75451F]">
                    <Loader2 size={13} className="animate-spin" /> Rebuilding graph…
                  </span>
                </div>
              )}
            </div>

            {(graph?.missing_prerequisites.length ?? 0) > 0 && (
              <div className="mt-3 rounded-xl border border-[#E99A32]/30 bg-[#FFF5E5] px-3.5 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A1743A]">Missing prerequisites</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {graph?.missing_prerequisites.map((item) => (
                    <span key={`${item.skill}-${item.needed_for}`} className="inline-flex items-center gap-1 rounded-lg border border-[#E99A32]/35 bg-white px-2 py-1 text-[10px] text-[#75451F]">
                      <CircleDashed size={10} /> {item.display} <span className="text-[#A89D8F]">for {item.needed_for}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <div className="space-y-5 xl:sticky xl:top-24">
            {selected ? (
              <SkillEvidencePanel node={selected} onClose={() => setSelectedId(null)} />
            ) : (
              <Card className="rounded-3xl p-5">
                <CardTitle detail="Click any node to inspect its evidence." action={<Network size={18} className="text-[#E99A32]" />}>
                  Evidence inspector
                </CardTitle>
                <div className="rounded-2xl border border-dashed border-[#E3D8C5] bg-[#FFFCF6] px-4 py-7 text-center">
                  <span className="mx-auto grid size-10 place-items-center rounded-xl bg-[#FFF5E5] text-[#75451F]"><Target size={18} /></span>
                  <p className="mt-3 text-xs font-semibold text-[#24211D]">Select a skill</p>
                  <p className="mx-auto mt-1 max-w-[220px] text-[11px] leading-5 text-[#6F675C]">
                    See the exact excerpt, source and date behind every status — or what is blocking a missing prerequisite.
                  </p>
                </div>
                <div className="mt-4 space-y-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A7F71]">Quick picks</p>
                  {(graph?.nodes ?? [])
                    .slice()
                    .sort((a, b) => Number(b.required) - Number(a.required) || b.proficiency - a.proficiency)
                    .slice(0, 4)
                    .map((node) => (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => setSelectedId(node.id)}
                        className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#EDE6DA] bg-white px-3 py-2 text-left transition hover:border-[#E3C894] hover:bg-[#FFFCF6]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[11px] font-semibold text-[#24211D]">{node.label}</span>
                          <span className="block text-[9px] text-[#8A7F71]">{node.category}</span>
                        </span>
                        <TierChip tier={node.status} />
                      </button>
                    ))}
                </div>
              </Card>
            )}

            <Card className="rounded-3xl p-5">
              <CardTitle detail="Where your evidence comes from." action={<Layers size={18} className="text-[#E99A32]" />}>
                Source coverage
              </CardTitle>
              <div className="space-y-2">
                {["resume", "resume_project", "career_quest", "team_project", "learning_milestone"].map((source) => {
                  const count = new Set(twin.skills.filter((skill) => skill.sources.includes(source)).map((skill) => skill.skill)).size;
                  return (
                    <div key={source} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 truncate text-[10px] capitalize text-[#6F675C]">{source.replaceAll("_", " ")}</span>
                      <Progress value={twin.total ? (count / twin.total) * 100 : 0} className="h-1.5 flex-1 bg-[#F3E9D8]" />
                      <span className="w-5 text-right text-[10px] font-semibold text-[#24211D]">{count}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] px-2 py-2.5">
                  <p className="font-display text-lg font-bold text-[#24211D]">{Math.round(twin.average_proficiency)}</p>
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-[#8A7F71]">Avg. proficiency</p>
                </div>
                <div className="rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] px-2 py-2.5">
                  <p className="font-display text-lg font-bold text-[#24211D]">{twin.has_resume ? "Yes" : "No"}</p>
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-[#8A7F71]">Resume on file</p>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)]">
          <Card className="rounded-3xl p-5 sm:p-6">
            <CardTitle detail="Grounded in evidence-weighted role alignment, never a generic quiz." action={<Wand2 size={19} className="text-[#E99A32]" />}>
              Readiness check
            </CardTitle>
            <form onSubmit={(event) => void askReadiness(event)} className="flex flex-col gap-2 sm:flex-row">
              <label className="flex-1">
                <span className="sr-only">Readiness question</span>
                <input
                  value={readinessQuestion}
                  onChange={(event) => setReadinessQuestion(event.target.value)}
                  placeholder={DEFAULT_QUESTION}
                  maxLength={400}
                  className={inputClass}
                />
              </label>
              <button
                type="submit"
                disabled={readinessBusy}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#75451F] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#5D3518] disabled:cursor-wait disabled:opacity-60"
              >
                {readinessBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Assess
              </button>
            </form>
            <AiNotice busy={readinessBusy ? "Comparing your evidence with role requirements" : null} error={readinessError} />

            {readiness ? (
              <div className="mt-5">
                <div className="flex flex-col items-center gap-5 sm:flex-row">
                  <div className="shrink-0">
                    <ScoreRing value={readiness.alignment} label="Alignment" size={128} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", verdict?.badge)}>{readiness.label}</span>
                    <p className="mt-2 text-sm font-bold text-[#24211D]">{readiness.comparison.role.title}</p>
                    <p className="mt-1 text-xs leading-5 text-[#6F675C]">{readiness.explanation[0]}</p>
                    {readiness.explanation[1] && <p className="mt-1 text-[11px] leading-5 text-[#8A7F71]">{readiness.explanation[1]}</p>}
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <ReadinessGroup title="Strengths" tone="green" items={readiness.strengths} empty="No proven skills yet." />
                  <ReadinessGroup title="Unverified claims" tone="amber" items={readiness.unverified_claims} empty="No unverified claims." />
                  <ReadinessGroup title="Missing" tone="coral" items={readiness.missing} empty="No missing requirements." />
                </div>

                {readiness.adjacent.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A7F71]">Adjacent strengths</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {readiness.adjacent.map((item) => <SkillPill key={item} tone="partial">{item}</SkillPill>)}
                    </div>
                  </div>
                )}

                {readiness.next_steps.length > 0 && (
                  <div className="mt-5">
                    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A7F71]"><Route size={12} /> Next best moves</p>
                    <div className="mt-2 space-y-2">
                      {readiness.next_steps.map((step) => (
                        <div key={`${step.action}-${step.skill}`} className="rounded-xl border border-[#EDE6DA] bg-white px-3.5 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-bold text-[#24211D]">{step.action === "verify" ? "Prove" : "Learn"} {step.display}</p>
                            <Link href={step.action === "verify" ? "/career-quest" : "/exchange"} className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#75451F] hover:underline">
                              {step.action === "verify" ? "Find an assessment" : "Find a peer"} <ArrowRight size={11} />
                            </Link>
                          </div>
                          <p className="mt-0.5 text-[11px] leading-5 text-[#6F675C]">{step.why}</p>
                          {step.missing_prerequisites.length > 0 && (
                            <p className="mt-1 text-[10px] text-[#A1743A]">First: {step.missing_prerequisites.join(" → ")}</p>
                          )}
                          {step.resource && (
                            <a href={step.resource.url} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-[#75451F] hover:underline">
                              {step.resource.provider} · {step.resource.title} <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-[#E3D8C5] bg-[#FFFCF6] px-4 py-7 text-center">
                <p className="text-xs font-semibold text-[#24211D]">Ask about a specific role</p>
                <p className="mx-auto mt-1 max-w-sm text-[11px] leading-5 text-[#6F675C]">
                  “Am I ready for a data analyst internship?” or “What am I missing for backend roles?” — the verdict uses the skills you can prove.
                </p>
              </div>
            )}
          </Card>

          <Card className="rounded-3xl p-5 sm:p-6">
            <CardTitle detail="Answers cite your twin; optional local Qwen only rewrites the wording." action={<MessageSquare size={19} className="text-[#E99A32]" />}>
              Ask your twin
            </CardTitle>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {SUGGESTED_QUESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => setChatQuestion(question)}
                  className="rounded-full border border-[#EDE6DA] bg-[#FFFCF6] px-2.5 py-1 text-[10px] font-medium text-[#6F675C] transition hover:border-[#E3C894] hover:text-[#75451F]"
                >
                  {question}
                </button>
              ))}
            </div>

            <form onSubmit={(event) => void askChat(event)}>
              <div className="flex gap-2">
                <label className="flex-1">
                  <span className="sr-only">Question for your twin</span>
                  <input
                    value={chatQuestion}
                    onChange={(event) => setChatQuestion(event.target.value)}
                    placeholder="What should I learn next?"
                    minLength={2}
                    maxLength={600}
                    className={inputClass}
                  />
                </label>
                <button
                  type="submit"
                  disabled={chatBusy || chatQuestion.trim().length < 2}
                  aria-label="Ask your twin"
                  className="grid size-[34px] shrink-0 place-items-center rounded-xl bg-[#24211D] text-white transition hover:bg-[#3A2512] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {chatBusy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
              <label className="mt-2.5 flex cursor-pointer items-start gap-2 rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={useLlm}
                  onChange={(event) => setUseLlm(event.target.checked)}
                  className="mt-0.5 size-3.5 accent-[#E99A32]"
                />
                <span>
                  <span className="block text-[11px] font-semibold text-[#24211D]">Phrase with local Qwen</span>
                  <span className="block text-[10px] leading-4 text-[#8A7F71]">Uses Ollama only if it is running. Every fact still comes from your twin, and invented skills are rejected.</span>
                </span>
              </label>
            </form>

            <AiNotice busy={chatBusy ? "Reading your evidence" : null} error={chatError} />

            <div className="mt-4 space-y-3">
              {chat.length === 0 && !chatBusy && (
                <div className="rounded-2xl border border-dashed border-[#E3D8C5] bg-[#FFFCF6] px-4 py-6 text-center">
                  <span className="mx-auto grid size-9 place-items-center rounded-xl bg-[#FFF5E5] text-[#75451F]"><BrainCircuit size={17} /></span>
                  <p className="mt-2 text-[11px] leading-5 text-[#6F675C]">Ask what is proven, what is only claimed, or what to do next. The answer is deterministic unless you switch on local phrasing.</p>
                </div>
              )}
              {chat.map((item, index) => (
                <div key={`${item.question}-${index}`} className="rounded-2xl border border-[#EDE6DA] bg-white p-3.5">
                  <p className="text-[11px] font-semibold text-[#24211D]">{item.question}</p>
                  <p className="mt-1.5 whitespace-pre-line text-[11px] leading-5 text-[#4A443C]">{item.answer.answer}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px] text-[#8A7F71]">
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#EDE6DA] bg-[#FFFCF6] px-2 py-0.5">
                      {item.answer.provider === "ollama" ? <Sparkles size={9} /> : <ShieldCheck size={9} />}
                      {item.answer.provider === "ollama" ? `Qwen${item.answer.model ? ` · ${item.answer.model}` : ""}` : "Grounded facts"}
                    </span>
                    <span className="capitalize">intent: {item.answer.intent.replaceAll("_", " ")}</span>
                  </div>
                  {item.answer.llm_note && <p className="mt-1.5 rounded-lg bg-[#FFF5E5] px-2 py-1 text-[9px] leading-4 text-[#A1743A]">{item.answer.llm_note}</p>}
                </div>
              ))}
            </div>
          </Card>
        </section>

        <Card className="mt-6 rounded-3xl p-5 sm:p-6">
          <CardTitle detail="Snapshots and the evidence events that changed your twin." action={<CalendarClock size={19} className="text-[#E99A32]" />}>
            Growth timeline
          </CardTitle>
          {events.length === 0 ? (
            <EmptyState icon={Route} title="No timeline yet" detail="Your growth history appears after the first twin snapshot, quest result or confirmed project contribution." />
          ) : (
            <ol className="relative space-y-0">
              {events.slice(0, 12).map((event, index) => {
                const detail = event.detail ?? {};
                const additions = detail.added ?? [];
                const upgrades = detail.upgraded ?? [];
                const skills = detail.skills ?? [];
                return (
                  <li key={`${event.at}-${index}`} className="relative flex gap-3 pb-4 last:pb-0">
                    {index < Math.min(events.length, 12) - 1 && <span className="absolute left-[11px] top-7 h-[calc(100%-18px)] w-px bg-[#EDE6DA]" />}
                    <span
                      className={cn(
                        "mt-0.5 grid size-[23px] shrink-0 place-items-center rounded-full border",
                        event.kind === "snapshot" ? "border-[#F4B942]/50 bg-[#FFF5E5] text-[#75451F]" : "border-[#2E7D32]/30 bg-[#2E7D32]/10 text-[#2E7D32]",
                      )}
                    >
                      {event.kind === "snapshot" ? <Circle size={8} fill="currentColor" /> : <ShieldCheck size={11} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p className="text-[11px] font-bold text-[#24211D]">{event.title}</p>
                        <span className="text-[9px] text-[#A89D8F]" title={formatDate(event.at)}>{relativeTime(event.at)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {additions.map((item) => <span key={`a-${item}`} className="rounded-md bg-[#FFF5E5] px-1.5 py-0.5 text-[9px] text-[#75451F]">+ {item}</span>)}
                        {upgrades.map((item) => <span key={`u-${item}`} className="rounded-md bg-[#2E7D32]/10 px-1.5 py-0.5 text-[9px] text-[#2E7D32]">↑ {item}</span>)}
                        {skills.map((item) => <span key={`s-${item}`} className="rounded-md border border-[#EDE6DA] px-1.5 py-0.5 text-[9px] text-[#6F675C]">{item}</span>)}
                      </div>
                      {detail.excerpt && <p className="mt-1 line-clamp-2 text-[10px] italic leading-4 text-[#8A7F71]">“{detail.excerpt}”</p>}
                      {detail.counts && (
                        <p className="mt-1 text-[9px] text-[#A89D8F]">
                          {detail.counts.verified ?? 0} verified · {detail.counts.demonstrated ?? 0} demonstrated · {detail.counts.claimed ?? 0} claimed
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

function ReadinessGroup({
  title,
  tone,
  items,
  empty,
}: {
  title: string;
  tone: "green" | "amber" | "coral";
  items: string[];
  empty: string;
}) {
  const tones = {
    green: "border-[#2E7D32]/20 bg-[#2E7D32]/[0.04]",
    amber: "border-[#E99A32]/25 bg-[#FFF5E5]/60",
    coral: "border-[#C62828]/15 bg-[#C62828]/[0.03]",
  };
  return (
    <div className={cn("rounded-xl border px-3 py-2.5", tones[tone])}>
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#6F675C]">{title} <span className="text-[#A89D8F]">{items.length}</span></p>
      {items.length ? (
        <ul className="mt-1.5 space-y-0.5">
          {items.slice(0, 5).map((item) => <li key={item} className="truncate text-[10px] leading-4 text-[#4A443C]">· {item}</li>)}
        </ul>
      ) : (
        <p className="mt-1.5 text-[10px] leading-4 text-[#A89D8F]">{empty}</p>
      )}
    </div>
  );
}

function SkillEvidencePanel({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  const missing = node.status === "missing";
  return (
    <Card className="rounded-3xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#A1743A]">Evidence inspector</p>
          <h2 className="mt-1 truncate font-display text-xl font-bold text-[#24211D]">{node.label}</h2>
          <p className="text-[10px] text-[#8A7F71]">{node.category} · {node.kind.replaceAll("_", " ")}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close evidence inspector" className="grid size-7 shrink-0 place-items-center rounded-lg border border-[#EDE6DA] text-[#8A7F71] hover:bg-[#FFF5E5] hover:text-[#75451F]">
          <X size={13} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TierChip tier={node.status} />
        {node.required && <span className="rounded-full border border-[#F4B942]/50 bg-[#F4B942]/15 px-2 py-0.5 text-[10px] font-semibold text-[#75451F]">Role requirement</span>}
      </div>

      {missing ? (
        <InlineNote tone="warning">
          No evidence yet. This is {node.kind === "required_missing" ? "required by the target role" : "a prerequisite for a skill you are building"}. Start with a focused project or quest, then rebuild your twin.
        </InlineNote>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] px-3 py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-[#8A7F71]">Proficiency</p>
              <p className="font-display text-xl font-bold text-[#24211D]">{Math.round(node.proficiency)}<span className="text-xs text-[#8A7F71]">/100</span></p>
              <Progress value={node.proficiency} className="mt-1 h-1.5" />
            </div>
            <div className="rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] px-3 py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-[#8A7F71]">Confidence</p>
              <p className="font-display text-xl font-bold text-[#24211D]">{Math.round(node.confidence * 100)}<span className="text-xs text-[#8A7F71]">%</span></p>
              <p className="mt-0.5 text-[9px] text-[#A89D8F]">{node.evidence.length} evidence item{node.evidence.length === 1 ? "" : "s"}</p>
            </div>
          </div>

          <p className="mt-3 flex items-center justify-between text-[10px] text-[#8A7F71]">
            <span>Last demonstrated</span>
            <span className="font-semibold text-[#6F675C]">{node.last_demonstrated_at ? formatDate(node.last_demonstrated_at) : "Not demonstrated"}</span>
          </p>

          <div className="mt-4">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A7F71]"><ListChecks size={12} /> Evidence chain</p>
            <div className="mt-2 space-y-2">
              {node.evidence.length === 0 && <p className="rounded-lg border border-dashed border-[#E3D8C5] px-3 py-3 text-[10px] text-[#8A7F71]">No stored excerpts for this skill.</p>}
              {node.evidence.map((item, index) => (
                <div key={`${item.source_type}-${index}`} className="rounded-xl border border-[#EDE6DA] bg-white px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <SourceLink source={item.source_type} />
                    <TierChip tier={asTier(item.tier)} />
                  </div>
                  {item.excerpt && <p className="mt-1.5 text-[10px] italic leading-4 text-[#4A443C]">“{item.excerpt}”</p>}
                  <p className="mt-1 text-[9px] text-[#A89D8F]">{formatDate(item.observed_at)} · strength {Math.round(item.strength * 100)}%</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

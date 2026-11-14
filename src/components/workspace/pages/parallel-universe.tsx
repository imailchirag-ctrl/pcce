"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowRight,
  Atom,
  BadgeCheck,
  BrainCircuit,
  CircleHelp,
  Compass,
  GitBranch,
  Loader2,
  MessageSquareText,
  Network,
  RotateCcw,
  Sparkles,
  Target,
  TriangleAlert,
  Waypoints,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { parallelUniverseApi, type DecisionScenario, type FutureSelf, type SelfProfile, type Simulation } from "@/features/parallel-universe/api";
import { cn } from "@/lib/utils";

const CareerUniverseGraph = dynamic(
  () => import("@/features/parallel-universe/career-universe-graph").then((module) => module.CareerUniverseGraph),
  { ssr: false, loading: () => <div className="grid h-[590px] place-items-center rounded-3xl border border-[#EDE6DA] bg-white text-sm text-[#6F675C]"><Loader2 className="mr-2 animate-spin" size={16} /> Opening the branching paths…</div> },
);

const TABS = [
  { id: "self", label: "Current self", icon: Compass },
  { id: "futures", label: "Three futures", icon: Sparkles },
  { id: "timeline", label: "Timelines", icon: Target },
  { id: "debate", label: "AI debate", icon: MessageSquareText },
  { id: "decision", label: "Decision lab", icon: Atom },
  { id: "multiverse", label: "Multiverse", icon: GitBranch },
  { id: "compare", label: "Compare paths", icon: Waypoints },
] as const;
type TabId = (typeof TABS)[number]["id"];

const PATH_COLORS: Record<string, { accent: string; tint: string; icon: typeof BrainCircuit }> = {
  "future-a": { accent: "#8B5CF6", tint: "#F5F0FF", icon: BrainCircuit },
  "future-b": { accent: "#0F766E", tint: "#E8F6F3", icon: Network },
  "future-c": { accent: "#D97706", tint: "#FFF4E1", icon: Sparkles },
};

function Block({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl border border-[#EDE6DA] bg-white p-4 sm:p-5", className)}><h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[#75451F]">{title}</h3><div className="mt-3">{children}</div></section>;
}

function TextList({ items, empty = "No evidence recorded yet." }: { items: string[]; empty?: string }) {
  if (!items.length) return <p className="text-xs leading-5 text-[#91877A]">{empty}</p>;
  return <ul className="space-y-2">{items.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2 text-xs leading-5 text-[#514A42]"><span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#E99A32]" />{item}</li>)}</ul>;
}

function SkillChips({ items, tone = "warm" }: { items: string[]; tone?: "warm" | "green" | "purple" }) {
  if (!items.length) return <span className="text-xs text-[#91877A]">None recorded</span>;
  const tones = { warm: "border-[#EDE6DA] bg-[#FFFCF6] text-[#75451F]", green: "border-[#BFE2D6] bg-[#E8F6F3] text-[#0F766E]", purple: "border-[#D7CBF5] bg-[#F5F0FF] text-[#6D45B5]" };
  return <div className="flex flex-wrap gap-1.5">{items.map((item, index) => <span key={`${item}-${index}`} className={cn("rounded-lg border px-2.5 py-1 text-[10px] font-semibold", tones[tone])}>{item}</span>)}</div>;
}

function FutureCard({ future, score, active, onClick }: { future: FutureSelf; score?: number; active?: boolean; onClick?: () => void }) {
  const theme = PATH_COLORS[future.id] ?? PATH_COLORS["future-c"];
  const Icon = theme.icon;
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn("group w-full rounded-[26px] border bg-white p-5 text-left shadow-[0_8px_28px_-24px_rgba(36,33,29,.4)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_42px_-28px_rgba(36,33,29,.45)] sm:p-6", active ? "ring-2 ring-offset-2" : "")} style={{ borderColor: `${theme.accent}45`, ...(active ? { outlineColor: theme.accent } : {}) }}>
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-12 place-items-center rounded-2xl" style={{ background: theme.tint, color: theme.accent }}><Icon size={22} /></span>
        {score !== undefined && <span className="rounded-full border border-[#EDE6DA] bg-[#FFFCF6] px-3 py-1 text-[10px] font-bold text-[#75451F]">heuristic fit {score}</span>}
      </div>
      <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: theme.accent }}>{future.archetype}</p>
      <h3 className="mt-1 font-display text-xl font-bold tracking-tight text-[#24211D]">{future.name}</h3>
      <p className="mt-1 text-xs font-semibold" style={{ color: theme.accent }}>{future.direction}</p>
      <p className="mt-4 min-h-[60px] text-xs leading-5 text-[#6F675C]">{future.personality}</p>
      <div className="mt-4"><SkillChips items={future.new_skills.slice(0, 4)} tone={future.id === "future-a" ? "purple" : future.id === "future-b" ? "green" : "warm"} /></div>
      {onClick && <span className="mt-5 inline-flex items-center gap-1 text-[11px] font-bold text-[#75451F]">Explore this path <ArrowRight size={13} /></span>}
    </button>
  );
}

function CurrentSelf({ profile }: { profile: SelfProfile | null }) {
  if (!profile) return <div className="rounded-3xl border border-dashed border-[#D8CDBD] bg-white p-8 text-sm text-[#6F675C]">Current profile analysis is still loading.</div>;
  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-[#EDE6DA] bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#A06B2C]">Evidence snapshot · {profile.display_name}</p><h2 className="mt-1 font-display text-2xl font-bold text-[#24211D]">Your starting point</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-[#6F675C]">Only information stored in your SkillBridge account is shown. Claims, demonstrations and verification remain separate.</p></div>
          {profile.career_goal && <span className="rounded-full border border-[#F0D69D] bg-[#FFF5E5] px-3 py-1.5 text-[11px] font-semibold text-[#75451F]">Goal · {profile.career_goal}</span>}
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Verified", value: profile.verified_skills.length, hint: "Assessment or trusted evidence", color: "#256346" },
            { label: "Demonstrated", value: profile.demonstrated_skills.length, hint: "Projects or completed activity", color: "#0F766E" },
            { label: "Claimed", value: profile.claimed_skills.length, hint: "Resume or profile statements", color: "#9A631D" },
          ].map((metric) => <div key={metric.label} className="rounded-2xl bg-[#FFFCF6] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: metric.color }}>{metric.label}</p><p className="mt-1 font-display text-3xl font-bold text-[#24211D]">{metric.value}</p><p className="mt-1 text-[10px] text-[#6F675C]">{metric.hint}</p></div>)}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Block title="Education"><TextList items={profile.education} /></Block>
        <Block title="Interests and career signals"><TextList items={[...profile.interests, ...(profile.headline ? [profile.headline] : [])]} /></Block>
        <Block title="Skills with insufficient evidence"><TextList items={profile.skills_with_insufficient_evidence.map((item) => `${item.name} — ${item.reason}`)} empty="No self-reported-only skills were found." /></Block>
        <Block title="Project evidence"><TextList items={profile.projects} empty="No resume project details were available." /></Block>
        <Block title="Mock interviews"><p className="text-xs leading-5 text-[#514A42]">{profile.mock_interviews.completed ? `${profile.mock_interviews.completed} completed · average score ${profile.mock_interviews.average_score}/100` : "No completed mock interview scores are stored."}</p>{profile.mock_interviews.scores.length > 0 && <div className="mt-3"><SkillChips items={profile.mock_interviews.scores.map((item) => `${item.role}: ${item.score}/100`)} /></div>}</Block>
        <Block title="Career Quest and coding evidence"><p className="text-xs leading-5 text-[#514A42]">{profile.career_quest.runs} Career Quest run(s) · {profile.career_quest.coding_attempts} coding attempt(s){profile.career_quest.average_coding_score !== null ? ` · average ${profile.career_quest.average_coding_score}/100` : ""}</p><div className="mt-3"><SkillChips items={profile.career_quest.skill_evidence.map((item) => `${item.skill_key} ${item.score}/100`)} tone="green" /></div></Block>
      </div>
      <div className="rounded-2xl border border-[#EDE6DA] bg-[#FFF8EA] p-4 text-xs leading-5 text-[#6B4A1F]">
        <div className="flex items-start gap-2"><CircleHelp size={16} className="mt-0.5 shrink-0" /><p><strong>Source notes.</strong> Digital Twin has {profile.digital_twin.evidence_records} evidence record(s). {profile.github_url ? "A GitHub profile URL is saved, but repository activity has not been imported." : "No GitHub profile URL is saved."} {profile.github_repository_data_available ? "Repository information is available." : "GitHub repository details are not available to this simulation."}</p></div>
        {profile.experience_gaps.length > 0 && <ul className="mt-3 space-y-1 pl-6">{profile.experience_gaps.map((item) => <li key={item} className="list-disc">{item}</li>)}</ul>}
      </div>
    </div>
  );
}

function FutureDetail({ future, comparison }: { future: FutureSelf; comparison?: Simulation["comparison"]["paths"][number] }) {
  const theme = PATH_COLORS[future.id] ?? PATH_COLORS["future-c"];
  return (
    <div className="grid gap-4 lg:grid-cols-[1.05fr_.95fr]">
      <div className="space-y-4">
        <Block title="Why this path may fit"><p className="text-sm leading-6 text-[#514A42]">{future.why_it_fits}</p>{future.supporting_evidence.length > 0 && <div className="mt-4 space-y-2">{future.supporting_evidence.map((item, index) => <div key={`${item.type}-${index}`} className="rounded-xl bg-[#FFFCF6] px-3 py-2"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#A06B2C]">{item.type} · {item.status}</p><p className="mt-1 text-xs leading-5 text-[#514A42]">{item.text}</p></div>)}</div>}</Block>
        <Block title="Career strategy"><p className="text-xs leading-5 text-[#514A42]">{future.career_strategy}</p></Block>
        <Block title="Hypothetical technical strengths"><TextList items={future.technical_strengths} /></Block>
        <Block title="Skills this path builds on"><SkillChips items={future.existing_skills} tone="green" /></Block>
      </div>
      <div className="space-y-4">
        <Block title="Skills to develop"><SkillChips items={future.new_skills} tone={future.id === "future-a" ? "purple" : future.id === "future-b" ? "green" : "warm"} /></Block>
        <Block title="Suggested future projects"><TextList items={future.suggested_projects} /></Block>
        <Block title="Potential weaknesses"><TextList items={future.weaknesses} /></Block>
        <Block title="Risks and uncertainty"><TextList items={future.risks} /></Block>
        {comparison && <div className="rounded-2xl p-4" style={{ background: theme.tint }}><p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: theme.accent }}>What the comparison says</p><p className="mt-2 text-xs font-semibold text-[#24211D]">{comparison.supported_skills.length} skill(s) with recorded evidence · {comparison.missing_competencies.length} competency gap(s)</p><p className="mt-1 text-[11px] text-[#6F675C]">About {comparison.learning_effort_hours} learning and project hours in this scenario.</p></div>}
      </div>
    </div>
  );
}

export function ParallelUniversePage() {
  const [profile, setProfile] = useState<SelfProfile | null>(null);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [sessions, setSessions] = useState<{ id: string; provider: string; model: string | null; created_at: string; future_names: string[]; has_debate: boolean }[]>([]);
  const [tab, setTab] = useState<TabId>("self");
  const [selectedFutureId, setSelectedFutureId] = useState("future-a");
  const [profileLoading, setProfileLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [debateBusy, setDebateBusy] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionText, setDecisionText] = useState("");
  const [latestScenario, setLatestScenario] = useState<DecisionScenario | null>(null);
  const [error, setError] = useState("");
  const [selectedNode, setSelectedNode] = useState<{ title: string; subtitle: string; detail: string; skills: string[]; projects: string[]; missing: string[]; decision?: string } | null>(null);

  const refreshSessions = useCallback(async () => {
    const result = await parallelUniverseApi.sessions();
    setSessions(result.sessions);
    return result.sessions;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError("");
      try {
        const [self, history] = await Promise.all([parallelUniverseApi.profile(), parallelUniverseApi.sessions()]);
        if (cancelled) return;
        setProfile(self);
        setSessions(history.sessions);
        if (history.sessions[0]) {
          const latest = await parallelUniverseApi.session(history.sessions[0].id);
          if (!cancelled) {
            setSimulation(latest);
            setLatestScenario(latest.scenarios?.[0] ?? null);
          }
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Your profile could not be loaded.");
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const selectedFuture = useMemo(() => simulation?.futures.find((item) => item.id === selectedFutureId) ?? simulation?.futures[0] ?? null, [simulation, selectedFutureId]);
  const selectedComparison = useMemo(() => simulation?.comparison.paths.find((item) => item.future_id === selectedFuture?.id), [simulation, selectedFuture]);

  async function createSimulation() {
    setBusy(true);
    setError("");
    setLatestScenario(null);
    try {
      const next = await parallelUniverseApi.create();
      next.scenarios = [];
      setSimulation(next);
      setSelectedFutureId(next.futures[0]?.id ?? "future-a");
      setTab("futures");
      await refreshSessions();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "The three futures could not be generated.");
    } finally {
      setBusy(false);
    }
  }

  async function openSession(id: string) {
    setBusy(true);
    setError("");
    try {
      const next = await parallelUniverseApi.session(id);
      setSimulation(next);
      setSelectedFutureId(next.futures[0]?.id ?? "future-a");
      setLatestScenario(next.scenarios?.[0] ?? null);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "That simulation could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  async function startDebate() {
    if (!simulation) return;
    setDebateBusy(true);
    setError("");
    try {
      const debate = await parallelUniverseApi.debate(simulation.id);
      setSimulation((current) => current ? { ...current, debate } : current);
    } catch (debateError) {
      setError(debateError instanceof Error ? debateError.message : "The debate could not be generated.");
    } finally {
      setDebateBusy(false);
    }
  }

  async function submitDecision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!simulation || decisionText.trim().length < 3) return;
    setDecisionBusy(true);
    setError("");
    try {
      const scenario = await parallelUniverseApi.decide(simulation.id, decisionText.trim());
      setLatestScenario(scenario);
      setSimulation((current) => current ? { ...current, scenarios: [scenario, ...(current.scenarios ?? [])] } : current);
      setDecisionText("");
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "That decision could not be simulated.");
    } finally {
      setDecisionBusy(false);
    }
  }

  function selectFuture(id: string) {
    setSelectedFutureId(id);
    setTab("timeline");
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-[1500px] space-y-6 px-4 pb-12 pt-5 sm:px-7 lg:px-9">
        <section className="relative isolate overflow-hidden rounded-[30px] bg-[#17142B] px-5 py-7 text-white shadow-[0_24px_70px_-36px_rgba(38,24,74,.55)] sm:px-8 sm:py-9 lg:px-11">
          <div className="absolute -right-10 -top-24 -z-10 size-[370px] rounded-full bg-violet-500/20 blur-[90px]" />
          <div className="absolute -bottom-44 left-[38%] -z-10 size-[340px] rounded-full bg-amber-400/20 blur-[90px]" />
          <div className="absolute right-[6%] top-1/2 hidden h-[2px] w-[36%] rotate-[-14deg] bg-gradient-to-r from-violet-400/0 via-violet-300/60 to-amber-300/0 lg:block" />
          <div className="grid gap-7 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-violet-200"><span className="live-dot size-1.5 rounded-full bg-violet-300" /> SkillBridge · parallel universe</p>
              <h1 className="mt-5 max-w-3xl font-display text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl">Meet the three versions of your future.</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/70">Your future isn’t one path. Explore three versions of yourself—shaped by the skills, projects and evidence you have today.</p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => void createSimulation()} disabled={busy || profileLoading} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#F4B942] px-5 py-3 text-xs font-extrabold tracking-wide text-[#30220E] shadow-[0_10px_30px_-16px_rgba(244,185,66,.8)] hover:-translate-y-0.5 hover:bg-[#F8CA65] disabled:cursor-not-allowed disabled:opacity-60">
                  {busy ? <><Loader2 className="animate-spin" size={16} /> Building your futures…</> : <>{simulation ? "GENERATE A NEW SIMULATION" : "ENTER MY PARALLEL UNIVERSE"}<ArrowRight size={16} /></>}
                </button>
                {simulation && <span className="text-[10px] text-white/55">A new session saves a fresh evidence snapshot.</span>}
              </div>
            </div>
            <div className="relative mx-auto h-[210px] w-full max-w-[470px] sm:h-[250px]" aria-hidden="true">
              <div className="absolute left-[7%] top-1/2 grid size-[58px] -translate-y-1/2 place-items-center rounded-2xl border border-white/20 bg-white/10 text-amber-200 shadow-[0_0_40px_rgba(244,185,66,.18)]"><Compass size={24} /></div>
              <div className="absolute left-[22%] top-1/2 h-px w-[22%] bg-gradient-to-r from-amber-300/80 to-white/30" />
              <div className="absolute left-[42%] top-[19%] h-[62%] w-px bg-gradient-to-b from-violet-300/80 via-white/30 to-amber-300/80" />
              <div className="absolute left-[42%] top-[19%] h-px w-[25%] bg-gradient-to-r from-violet-300/70 to-white/20" />
              <div className="absolute left-[42%] top-1/2 h-px w-[25%] bg-gradient-to-r from-teal-300/70 to-white/20" />
              <div className="absolute bottom-[19%] left-[42%] h-px w-[25%] bg-gradient-to-r from-amber-300/70 to-white/20" />
              {[{ y: "top-[7%]", icon: BrainCircuit, label: "AI engineer", tone: "border-violet-300/30 bg-violet-400/15 text-violet-100" }, { y: "top-1/2 -translate-y-1/2", icon: Network, label: "systems architect", tone: "border-teal-300/30 bg-teal-400/15 text-teal-100" }, { y: "bottom-[7%]", icon: Sparkles, label: "product innovator", tone: "border-amber-300/30 bg-amber-400/15 text-amber-100" }].map((branch) => {
                const Icon = branch.icon;
                return <div key={branch.label} className={cn("absolute right-[2%] flex min-w-[150px] items-center gap-2 rounded-2xl border px-3 py-2.5 backdrop-blur", branch.y, branch.tone)}><span className="grid size-8 place-items-center rounded-xl bg-black/10"><Icon size={16} /></span><span className="text-[10px] font-bold uppercase tracking-[0.08em]">{branch.label}</span></div>;
              })}
              <div className="absolute left-[39.5%] top-[17%] size-2.5 rounded-full bg-violet-300 shadow-[0_0_20px_5px_rgba(196,181,253,.5)]" />
              <div className="absolute left-[39.5%] top-[48%] size-2.5 rounded-full bg-teal-300 shadow-[0_0_20px_5px_rgba(94,234,212,.4)]" />
              <div className="absolute bottom-[17%] left-[39.5%] size-2.5 rounded-full bg-amber-300 shadow-[0_0_20px_5px_rgba(252,211,77,.4)]" />
            </div>
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-4 text-[10px] text-white/55"><span className="inline-flex items-center gap-1.5"><BadgeCheck size={13} className="text-emerald-300" /> Built from your authenticated evidence</span><span className="inline-flex items-center gap-1.5"><CircleHelp size={13} className="text-amber-200" /> Simulations, not predictions</span><span className="inline-flex items-center gap-1.5"><RotateCcw size={13} className="text-violet-200" /> Hypothetical choices never change real progress</span></div>
        </section>

        {error && <div role="alert" className="flex items-start gap-2 rounded-2xl border border-[#C62828]/20 bg-[#C62828]/5 px-4 py-3 text-xs text-[#9B2929]"><TriangleAlert size={16} className="mt-0.5 shrink-0" />{error}</div>}
        {simulation?.ai_note && <div className="rounded-2xl border border-[#E8C77D] bg-[#FFF5E5] px-4 py-3 text-xs leading-5 text-[#75451F]">{simulation.ai_note}</div>}

        {sessions.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#EDE6DA] bg-white px-4 py-3">
          <p className="text-xs font-semibold text-[#514A42]">Saved simulations <span className="ml-1 rounded-full bg-[#FFF5E5] px-2 py-0.5 text-[10px] text-[#75451F]">{sessions.length}</span></p>
          <select aria-label="Open a saved simulation" value={simulation?.id ?? ""} onChange={(event) => void openSession(event.target.value)} className="max-w-full rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] px-3 py-2 text-xs text-[#514A42]">
            {sessions.map((item) => <option key={item.id} value={item.id}>{new Date(item.created_at).toLocaleString()} · {item.future_names.join(" / ")}</option>)}
          </select>
        </div>}

        <nav className="sticky top-[72px] z-20 -mx-4 flex gap-1 overflow-x-auto border-y border-[#EDE6DA] bg-[#FFFCF6]/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:px-2" aria-label="Parallel universe sections">
          {TABS.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined} className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-semibold transition", tab === id ? "bg-[#24211D] text-white shadow-sm" : "text-[#6F675C] hover:bg-white hover:text-[#24211D]")}><Icon size={13} />{label}</button>)}
        </nav>

        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.18 }} className="min-h-[400px]">
            {tab === "self" && <div className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#A06B2C]">01 · current self analysis</p><h2 className="mt-1 font-display text-2xl font-bold text-[#24211D]">What your evidence says today</h2></div><span className="rounded-full border border-[#EDE6DA] bg-white px-3 py-1 text-[10px] font-semibold text-[#6F675C]">Authenticated profile · private to you</span></div>{profileLoading ? <div className="grid min-h-64 place-items-center rounded-3xl border border-[#EDE6DA] bg-white text-xs text-[#6F675C]"><Loader2 className="mr-2 animate-spin" size={16} />Reading your SkillBridge evidence…</div> : <CurrentSelf profile={simulation?.profile ?? profile} />}</div>}

            {tab === "futures" && <div className="space-y-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#A06B2C]">02 · generated possibilities</p><h2 className="mt-1 font-display text-2xl font-bold text-[#24211D]">Three different ways your skills could grow</h2><p className="mt-1 text-xs leading-5 text-[#6F675C]">Each one has a different strategy, strengths, risks, and learning curve.</p></div>{!simulation ? <PromptToGenerate busy={busy} onGenerate={() => void createSimulation()} /> : <><div className="grid gap-4 xl:grid-cols-3">{simulation.futures.map((future) => <FutureCard key={future.id} future={future} score={simulation.comparison.paths.find((item) => item.future_id === future.id)?.alignment_score} onClick={() => selectFuture(future.id)} />)}</div><div className="rounded-2xl border border-[#EDE6DA] bg-white p-4 text-xs leading-5 text-[#6F675C]">These are generated hypothetical identities and career strategies. Their technical strengths describe the simulated person, not verified claims about you.</div></>}</div>}

            {tab === "timeline" && <div className="space-y-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#A06B2C]">03 · simulated milestones</p><h2 className="mt-1 font-display text-2xl font-bold text-[#24211D]">A timeline you can inspect, not a promise</h2></div>{simulation ? <><div className="flex gap-2 overflow-x-auto pb-1">{simulation.futures.map((future) => <button key={future.id} type="button" onClick={() => setSelectedFutureId(future.id)} className={cn("shrink-0 rounded-xl border px-3 py-2 text-[10px] font-semibold", selectedFutureId === future.id ? "border-[#75451F] bg-[#FFF5E5] text-[#75451F]" : "border-[#EDE6DA] bg-white text-[#6F675C]")}>{future.name}</button>)}</div>{selectedFuture && <><FutureDetail future={selectedFuture} comparison={selectedComparison} /><TimelineView future={selectedFuture} scenario={latestScenario} /></>}</> : <PromptToGenerate busy={busy} onGenerate={() => void createSimulation()} />}</div>}

            {tab === "debate" && <div className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#A06B2C]">04 · signature feature</p><h2 className="mt-1 font-display text-2xl font-bold text-[#24211D]">Three future selves. One honest debate.</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-[#6F675C]">Distinct agents challenge one another, reference your evidence, surface trade-offs, and leave you with a useful next experiment.</p></div>{simulation && <button type="button" onClick={() => void startDebate()} disabled={debateBusy} className="inline-flex items-center gap-2 rounded-xl bg-[#24211D] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{debateBusy ? <><Loader2 className="animate-spin" size={14} />Agents are taking turns…</> : <><MessageSquareText size={14} />{simulation.debate ? "Run debate again" : "Start AI debate"}</>}</button>}</div>{!simulation ? <PromptToGenerate busy={busy} onGenerate={() => void createSimulation()} /> : simulation.debate ? <DebateView simulation={simulation} /> : <div className="rounded-3xl border border-dashed border-[#D8CDBD] bg-white p-8 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#F5F0FF] text-violet-600"><MessageSquareText size={22} /></div><h3 className="mt-4 font-display text-lg font-bold text-[#24211D]">The arena is ready</h3><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-[#6F675C]">The three agents will make one concise, structured turn each and return a grounded summary.</p></div>}</div>}

            {tab === "decision" && <div className="space-y-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#A06B2C]">05 · hypothetical decision simulator</p><h2 className="mt-1 font-display text-2xl font-bold text-[#24211D]">Try a decision before you commit</h2><p className="mt-1 text-xs leading-5 text-[#6F675C]">See which paths gain from it, what it costs, and how it might reshape a hypothetical timeline.</p></div>{!simulation ? <PromptToGenerate busy={busy} onGenerate={() => void createSimulation()} /> : <><form onSubmit={(event) => void submitDecision(event)} className="rounded-3xl border border-[#EDE6DA] bg-white p-4 sm:p-5"><label htmlFor="decision" className="text-xs font-bold text-[#24211D]">Your hypothetical choice</label><div className="mt-2 flex flex-col gap-2 sm:flex-row"><input id="decision" value={decisionText} onChange={(event) => setDecisionText(event.target.value)} maxLength={220} placeholder="e.g. Build one full-stack app over the next month" className="input flex-1" /><button type="submit" disabled={decisionBusy || decisionText.trim().length < 3} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#75451F] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{decisionBusy ? <><Loader2 className="animate-spin" size={14} />Simulating…</> : <>Compare this choice <ArrowRight size={14} /></>}</button></div><div className="mt-3 flex flex-wrap gap-2">{["Learn machine learning for a month", "Build a full-stack application", "Focus on system design", "Join a hackathon", "Make an open-source contribution"].map((choice) => <button key={choice} type="button" onClick={() => setDecisionText(choice)} className="rounded-full border border-[#EDE6DA] px-2.5 py-1 text-[10px] text-[#6F675C] hover:border-[#E99A32] hover:text-[#75451F]">{choice}</button>)}</div></form>
                  {latestScenario ? <ScenarioView scenario={latestScenario} simulation={simulation} /> : <div className="rounded-2xl border border-dashed border-[#D8CDBD] bg-white p-6 text-xs text-[#6F675C]">Choose a decision to see the path-by-path impact. Actual skills and progress will not change.</div>}
                  {(simulation.scenarios?.length ?? 0) > 1 && <div><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#75451F]">Earlier scenario revisions</p><div className="flex flex-wrap gap-2">{simulation.scenarios?.slice(1).map((scenario) => <button key={scenario.scenario_id} type="button" onClick={() => setLatestScenario(scenario)} className="rounded-xl border border-[#EDE6DA] bg-white px-3 py-2 text-[10px] font-medium text-[#6F675C]">{scenario.decision}</button>)}</div></div>}
                </>}</div>}

            {tab === "multiverse" && <div className="space-y-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#A06B2C]">06 · career multiverse</p><h2 className="mt-1 font-display text-2xl font-bold text-[#24211D]">One starting point. Three branching experiments.</h2><p className="mt-1 text-xs leading-5 text-[#6F675C]">Select a node to inspect the milestone, required skills, project evidence and missing competencies.</p></div>{!simulation ? <PromptToGenerate busy={busy} onGenerate={() => void createSimulation()} /> : <><CareerUniverseGraph simulation={{ ...simulation, scenarios: simulation.scenarios ?? [] }} onSelect={(node) => setSelectedNode(node)} />{selectedNode && <div className="grid gap-4 rounded-3xl border border-[#EDE6DA] bg-white p-5 md:grid-cols-[1fr_1fr]"><div><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#A06B2C]">{selectedNode.subtitle}</p><h3 className="mt-1 font-display text-lg font-bold text-[#24211D]">{selectedNode.title}</h3><p className="mt-2 text-xs leading-5 text-[#6F675C]">{selectedNode.detail}</p>{selectedNode.decision && <p className="mt-3 rounded-xl bg-[#FFF5E5] p-3 text-[10px] font-semibold text-[#75451F]">Hypothetical decision · {selectedNode.decision}</p>}</div><div className="space-y-3"><div><p className="mb-2 text-[9px] font-bold uppercase tracking-[0.14em] text-[#0F766E]">Skills</p><SkillChips items={selectedNode.skills} tone="green" /></div><div><p className="mb-2 text-[9px] font-bold uppercase tracking-[0.14em] text-[#75451F]">Projects</p><TextList items={selectedNode.projects} empty="No project suggestion on this node." /></div><div><p className="mb-2 text-[9px] font-bold uppercase tracking-[0.14em] text-[#9A631D]">Missing competencies</p><TextList items={selectedNode.missing} empty="No missing skills were identified by the heuristic comparison." /></div></div></div>}</>}</div>}

            {tab === "compare" && <div className="space-y-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#A06B2C]">07 · future comparison engine</p><h2 className="mt-1 font-display text-2xl font-bold text-[#24211D]">Compare the trade-offs, keep your options open</h2><p className="mt-1 text-xs leading-5 text-[#6F675C]">Scores are transparent heuristics based on current evidence. They are not scientifically validated predictions.</p></div>{!simulation ? <PromptToGenerate busy={busy} onGenerate={() => void createSimulation()} /> : <><div className="grid gap-4 xl:grid-cols-3">{simulation.futures.map((future) => <ComparisonCard key={future.id} future={future} comparison={simulation.comparison.paths.find((item) => item.future_id === future.id)} />)}</div><div className="rounded-3xl border border-[#EDE6DA] bg-white p-5"><p className="text-xs font-bold text-[#24211D]">How to read these scores</p><p className="mt-2 text-xs leading-5 text-[#6F675C]">{simulation.comparison.method}</p><p className="mt-2 text-[10px] text-[#91877A]">Embedding model: {simulation.comparison.embedding_model}. Scores describe the evidence available now and should be reconsidered as your profile grows.</p></div><div className="rounded-2xl border border-[#F0D69D] bg-[#FFF8EA] p-4 text-xs leading-5 text-[#75451F]"><strong>Try before choosing.</strong> A small project that tests two directions can create stronger evidence than picking a permanent identity today.</div></>}</div>}
          </motion.div>
        </AnimatePresence>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#EDE6DA] pt-4 text-[10px] text-[#91877A]"><span>AI Parallel Universe · private career scenario tool</span><span className="inline-flex items-center gap-1"><BadgeCheck size={12} /> Evidence first · hypothetical always</span></footer>
      </main>
    </AppShell>
  );
}

function PromptToGenerate({ busy, onGenerate }: { busy: boolean; onGenerate: () => void }) {
  return <div className="grid min-h-[300px] place-items-center rounded-3xl border border-dashed border-[#D8CDBD] bg-white p-8 text-center"><div><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#FFF5E5] text-[#75451F]"><Sparkles size={25} /></span><h3 className="mt-4 font-display text-lg font-bold text-[#24211D]">Start with your real profile</h3><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-[#6F675C]">Generate three hypothetical paths from the evidence already stored in your SkillBridge account. Missing data stays visible.</p><button type="button" disabled={busy} onClick={onGenerate} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#75451F] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy ? <><Loader2 size={14} className="animate-spin" />Generating from your evidence…</> : <>Generate three futures <ArrowRight size={14} /></>}</button></div></div>;
}

function TimelineView({ future, scenario }: { future: FutureSelf; scenario: DecisionScenario | null }) {
  const phases = [{ key: "six_months", label: "6 months", marker: "NEAR HORIZON" }, { key: "one_year", label: "1 year", marker: "BUILD DEPTH" }, { key: "three_years", label: "3 years", marker: "POSSIBLE SPECIALIZATION" }] as const;
  const colors = PATH_COLORS[future.id] ?? PATH_COLORS["future-c"];
  const decisionImpact = scenario?.outcomes.find((item) => item.future_id === future.id);
  return <div className="relative grid gap-3 lg:grid-cols-3">{phases.map(({ key, label, marker }, index) => {
    const milestone = future.milestones[key];
    return <article key={key} className="relative rounded-3xl border border-[#EDE6DA] bg-white p-5">
      <div className="flex items-center justify-between"><span className="rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em]" style={{ background: colors.tint, color: colors.accent }}>{marker}</span><span className="font-display text-sm font-bold text-[#24211D]">{label}</span></div>
      <h3 className="mt-5 font-display text-lg font-bold leading-6 text-[#24211D]">{milestone.target}</h3>
      <p className="mt-2 text-xs leading-5 text-[#6F675C]">{milestone.action}</p>
      <div className="mt-4 space-y-3 border-t border-[#F1ECE5] pt-4">
        <div><p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#75451F]">Required skills</p><SkillChips items={milestone.required_skills} /></div>
        <div className="rounded-xl bg-[#FFFCF6] p-3"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#75451F]">Evidence to collect</p><p className="mt-1 text-[11px] leading-5 text-[#514A42]">{milestone.evidence}</p></div>
        <div className="grid grid-cols-2 gap-2 text-[10px]"><div className="rounded-xl bg-[#F8F5F0] p-2.5"><p className="text-[#91877A]">Estimated effort</p><p className="mt-0.5 font-bold text-[#514A42]">~{milestone.effort_hours} hours</p></div><div className="rounded-xl bg-[#F8F5F0] p-2.5"><p className="text-[#91877A]">Depends on</p><p className="mt-0.5 line-clamp-2 font-semibold text-[#514A42]">{milestone.dependencies.join(" · ")}</p></div></div>
        {decisionImpact && <div className="rounded-xl border border-[#E5D5FB] bg-[#F8F4FF] p-3"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-violet-700">Hypothetical revision · {scenario?.decision}</p><p className="mt-1 text-[11px] leading-5 text-[#514A42]">{decisionImpact.timeline_update}</p></div>}
      </div>
      {index < 2 && <ArrowDownRight className="absolute -bottom-5 left-1/2 z-10 hidden text-[#C7B69F] lg:block" size={18} />}
    </article>;
  })}</div>;
}

function DebateView({ simulation }: { simulation: Simulation }) {
  const debate = simulation.debate;
  if (!debate) return null;
  return <div className="space-y-5"><div className="grid gap-4 xl:grid-cols-3">{debate.turns.map((turn) => {
    const theme = PATH_COLORS[turn.future_id] ?? PATH_COLORS["future-c"];
    const future = simulation.futures.find((item) => item.id === turn.future_id);
    const Icon = theme.icon;
    return <article key={turn.future_id} className="relative overflow-hidden rounded-3xl border bg-white p-5" style={{ borderColor: `${theme.accent}45` }}><div className="absolute right-0 top-0 h-1 w-full" style={{ background: theme.accent }} /><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl" style={{ background: theme.tint, color: theme.accent }}><Icon size={18} /></span><div><p className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: theme.accent }}>{future?.archetype}</p><h3 className="text-sm font-bold text-[#24211D]">{turn.agent_name}</h3></div></div><p className="mt-4 text-xs leading-6 text-[#514A42]">“{turn.argument}”</p><div className="mt-4 rounded-xl bg-[#FFFCF6] p-3"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#75451F]">Challenge to the others</p><p className="mt-1 text-[11px] leading-5 text-[#514A42]">{turn.challenge}</p></div><div className="mt-3 flex gap-2 border-t border-[#F1ECE5] pt-3"><CircleHelp size={14} className="mt-0.5 shrink-0 text-[#A06B2C]" /><p className="text-[11px] font-semibold leading-5 text-[#75451F]">{turn.question}</p></div></article>;
  })}</div><div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]"><Block title="Where they disagree"><TextList items={debate.summary.disagreements} /></Block><Block title="Trade-offs they see"><TextList items={[...debate.summary.best_arguments, ...debate.summary.tradeoffs]} /></Block></div><div className="rounded-3xl bg-[#24211D] p-5 text-white sm:p-6"><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#F4B942]">A useful next experiment</p><p className="mt-2 max-w-4xl font-display text-lg font-semibold leading-7">{debate.summary.next_action}</p><div className="mt-4 flex flex-wrap gap-2">{debate.summary.uncertainties.map((item, index) => <span key={`${item}-${index}`} className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[10px] leading-4 text-white/70">{item}</span>)}</div></div><p className="text-right text-[9px] text-[#91877A]">{debate.provider === "ollama" ? `Generated locally with ${debate.model}` : "Evidence-grounded fallback · local model unavailable"}</p></div>;
}

function ScenarioView({ scenario, simulation }: { scenario: DecisionScenario; simulation: Simulation }) {
  return <div className="space-y-4"><div className="rounded-2xl bg-[#24211D] p-4 text-white"><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#F4B942]">Decision simulation · not real progress</p><p className="mt-1 font-display text-lg font-bold">“{scenario.decision}”</p><p className="mt-2 text-xs leading-5 text-white/65">{scenario.opportunity_cost}</p></div><div className="grid gap-3 xl:grid-cols-3">{simulation.futures.map((future) => {
    const outcome = scenario.outcomes.find((item) => item.future_id === future.id);
    if (!outcome) return null;
    const theme = PATH_COLORS[future.id] ?? PATH_COLORS["future-c"];
    return <article key={future.id} className="rounded-2xl border border-[#EDE6DA] bg-white p-4"><div className="flex items-center justify-between gap-2"><div><p className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: theme.accent }}>{future.archetype}</p><h3 className="mt-0.5 text-sm font-bold text-[#24211D]">{future.name}</h3></div><span className={cn("rounded-full px-2 py-1 text-[9px] font-bold capitalize", outcome.stance === "supports" ? "bg-[#E8F6F3] text-[#0F766E]" : outcome.stance === "questions" ? "bg-[#FFF5E5] text-[#9A631D]" : "bg-[#F3F0EA] text-[#6F675C]")}>{outcome.stance}</span></div><div className="mt-4 flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-[#F1ECE5]"><div className="h-full rounded-full" style={{ width: `${outcome.scenario_alignment}%`, background: theme.accent }} /></div><span className="text-[10px] font-bold text-[#514A42]">{outcome.baseline_alignment} → {outcome.scenario_alignment}<span className={outcome.alignment_delta >= 0 ? " text-[#0F766E]" : " text-[#A33D2F]"}> ({outcome.alignment_delta >= 0 ? "+" : ""}{outcome.alignment_delta})</span></span></div><p className="mt-3 text-[11px] leading-5 text-[#514A42]">{outcome.tradeoff}</p><div className="mt-3"><p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#75451F]">Skills affected</p><SkillChips items={outcome.skills_developed} /></div><div className="mt-3 rounded-xl bg-[#FFFCF6] p-3"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#75451F]">Hypothetical timeline update · {outcome.impact} impact</p><p className="mt-1 text-[11px] leading-5 text-[#514A42]">{outcome.timeline_update}</p></div></article>;
  })}</div><div className="rounded-2xl border border-[#F0D69D] bg-[#FFF8EA] p-4 text-[11px] leading-5 text-[#75451F]"><p><strong>Review point:</strong> {scenario.review_point}</p><p className="mt-1">This revision changes only the saved scenario view. The original path comparison and your actual SkillBridge evidence remain unchanged.</p></div><p className="text-right text-[9px] text-[#91877A]">Original baseline: {simulation.comparison.paths.map((item) => `${simulation.futures.find((future) => future.id === item.future_id)?.archetype} ${item.alignment_score}`).join(" · ")}</p></div>;
}

function ComparisonCard({ future, comparison }: { future: FutureSelf; comparison?: Simulation["comparison"]["paths"][number] }) {
  if (!comparison) return null;
  const theme = PATH_COLORS[future.id] ?? PATH_COLORS["future-c"];
  const components = [["Current evidence", comparison.score_components.current_evidence], ["Interests", comparison.score_components.semantic_interest_fit], ["Career goal", comparison.score_components.career_goal_fit], ["Projects", comparison.score_components.project_semantic_fit]] as const;
  return <article className="rounded-3xl border border-[#EDE6DA] bg-white p-5 sm:p-6"><div className="flex items-center justify-between"><span className="rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em]" style={{ background: theme.tint, color: theme.accent }}>{future.archetype}</span><span className="text-[10px] text-[#91877A]">Heuristic · not predictive</span></div><h3 className="mt-4 font-display text-lg font-bold text-[#24211D]">{future.name}</h3><p className="mt-0.5 text-[11px] text-[#6F675C]">{future.direction}</p><div className="mt-5 flex items-end justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#91877A]">Alignment indicator</p><p className="font-display text-4xl font-bold" style={{ color: theme.accent }}>{comparison.alignment_score}<span className="text-lg">/100</span></p></div><div className="grid size-[76px] place-items-center rounded-full border-[6px]" style={{ borderColor: `${theme.accent}33`, background: `conic-gradient(${theme.accent} ${comparison.alignment_score * 3.6}deg, #F2EEE8 0deg)` }}><div className="grid size-[54px] place-items-center rounded-full bg-white text-[11px] font-bold text-[#514A42]">{comparison.learning_effort_hours}h</div></div></div><div className="mt-4 space-y-2">{components.map(([label, value]) => <div key={label}><div className="mb-1 flex justify-between text-[9px]"><span className="text-[#6F675C]">{label}</span><span className="font-bold text-[#514A42]">{value}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#F1ECE5]"><div className="h-full rounded-full" style={{ width: `${value}%`, background: theme.accent }} /></div></div>)}</div><div className="mt-5 space-y-3 border-t border-[#F1ECE5] pt-4"><div><p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#0F766E]">Transferable evidence</p><SkillChips items={comparison.supported_skills} tone="green" /></div><div><p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#9A631D]">Competencies to build</p><SkillChips items={comparison.missing_competencies} /></div><div><p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#75451F]">Potential opportunities</p><TextList items={comparison.opportunities} /></div><div><p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#A33D2F]">Risks</p><TextList items={comparison.risks} /></div></div></article>;
}

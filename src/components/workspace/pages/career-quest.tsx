"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Award,
  BarChart3,
  Bell,
  Bot,
  Braces,
  Building2,
  CalendarClock,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Code2,
  Flame,
  LockKeyhole,
  MessageCircle,
  Play,
  Rocket,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { Badge, Progress } from "@/components/ui/primitives";
import { CountUp } from "@/components/ui/motion";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { careerQuestApi } from "@/features/career-quest/api";
import type {
  DifficultyKey,
  MissionCompletion,
  QuestCatalog,
  QuestMission,
  QuestProgression,
  QuestReport,
  QuestRun,
  QuestRunSummary,
} from "@/features/career-quest/types";

const CareerQuestCodeEditor = dynamic(
  () => import("@/features/career-quest/code-editor").then((module) => module.CareerQuestCodeEditor),
  { ssr: false, loading: () => <div className="grid h-[390px] place-items-center rounded-xl bg-[#1E1E1E] text-sm text-white/60">Loading Python editor…</div> },
);

const difficultyOrder: DifficultyKey[] = ["beginner", "intermediate", "advanced"];
const achievementNames: Record<string, { title: string; detail: string }> = {
  first_mission: { title: "First commit", detail: "Completed your first mission." },
  clean_execution: { title: "Green build", detail: "Passed every server-side test in a mission." },
  incident_responder: { title: "Incident responder", detail: "Completed the production incident mission." },
  boss_cleared: { title: "Release captain", detail: "Made the final release-readiness call." },
  career_quest_complete: { title: "Quest complete", detail: "Finished the Software Engineer mission arc." },
};

function introStorageKey(runId: string): string {
  return `skillbridge:career-quest:intro:${runId}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Career Quest could not load this update. Try again.";
}

function asRunId(pathname: string | null): string | null {
  const match = pathname?.match(/^\/career-quest\/run\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function xpForNextLevel(progression: QuestProgression | null): number {
  if (!progression) return 0;
  return Math.min(100, Math.round((progression.xp_into_level / Math.max(1, progression.xp_into_level + progression.xp_to_next_level)) * 100));
}

export function CareerQuestPage() {
  const pathname = usePathname();
  const router = useRouter();
  const routeRunId = asRunId(pathname);
  const [catalog, setCatalog] = useState<QuestCatalog | null>(null);
  const [progression, setProgression] = useState<QuestProgression | null>(null);
  const [runs, setRuns] = useState<QuestRunSummary[]>([]);
  const [run, setRun] = useState<QuestRun | null>(null);
  const [report, setReport] = useState<QuestReport | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyKey>("beginner");
  const [submitting, setSubmitting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showIntro, setShowIntro] = useState(false);
  const [missionResult, setMissionResult] = useState<MissionCompletion | null>(null);
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refreshRun = useCallback(async (runId: string) => {
    const nextRun = await careerQuestApi.run(runId);
    setRun(nextRun);
    return nextRun;
  }, []);

  const refreshDashboard = useCallback(async () => {
    const [nextCatalog, nextProgression, runList] = await Promise.all([
      careerQuestApi.catalog(),
      careerQuestApi.progression(),
      careerQuestApi.runs(),
    ]);
    setCatalog(nextCatalog);
    setProgression(nextProgression);
    setRuns(runList.runs);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [nextCatalog, nextProgression, runList] = await Promise.all([
          careerQuestApi.catalog(),
          careerQuestApi.progression(),
          careerQuestApi.runs(),
        ]);
        if (cancelled) return;
        setCatalog(nextCatalog);
        setProgression(nextProgression);
        setRuns(runList.runs);
        if (routeRunId) {
          const nextRun = await careerQuestApi.run(routeRunId);
          if (cancelled) return;
          setRun(nextRun);
          const untouched = !nextRun.interactions.some((item) => item.actor === "player") && nextRun.attempts.length === 0;
          if (
            nextRun.status === "IN_PROGRESS" &&
            nextRun.progress.completed === 0 &&
            untouched &&
            !window.sessionStorage.getItem(introStorageKey(nextRun.id))
          ) {
            setShowIntro(true);
          }
          if (nextRun.status === "COMPLETED") {
            const nextReport = await careerQuestApi.report(routeRunId);
            if (!cancelled) setReport(nextReport);
          }
        } else {
          setRun(null);
          setReport(null);
        }
      } catch (loadError) {
        if (!cancelled) setError(errorMessage(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [routeRunId]);

  useEffect(() => {
    if (!routeRunId) return;
    const source = new EventSource("/api/events");
    let debounce: number | undefined;
    source.addEventListener("change", (event) => {
      try {
        const message = JSON.parse((event as MessageEvent<string>).data) as { topic?: string; payload?: { run_id?: string } };
        if (!message.topic?.startsWith("career_quest.") || message.payload?.run_id !== routeRunId) return;
        if (debounce) window.clearTimeout(debounce);
        debounce = window.setTimeout(() => {
          void refreshRun(routeRunId).catch((refreshError) => setError(errorMessage(refreshError)));
          void careerQuestApi.progression().then(setProgression).catch((refreshError) => setError(errorMessage(refreshError)));
        }, 200);
      } catch {
        setError("A Career Quest update could not be read. The page will reconcile on the next refresh.");
      }
    });
    return () => {
      source.close();
      if (debounce) window.clearTimeout(debounce);
    };
  }, [routeRunId, refreshRun]);

  useEffect(() => {
    let timer: number;
    const tick = () => {
      setNow(Date.now());
      timer = window.setTimeout(tick, 1000);
    };
    timer = window.setTimeout(tick, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const currentMission = useMemo(
    () => run?.missions.find((mission) => mission.id === run.current_mission_id) ?? null,
    [run],
  );
  const missionInteractions = useMemo(
    () => (run && currentMission ? run.interactions.filter((item) => item.mission_id === currentMission.id) : []),
    [run, currentMission],
  );
  const selectedDecision = useMemo(
    () => missionInteractions.find((item) => item.type === "decision"),
    [missionInteractions],
  );
  const savedReflection = useMemo(
    () => missionInteractions.some((item) => item.type === "reflection"),
    [missionInteractions],
  );
  const missionAttempts = useMemo(
    () => (run && currentMission ? run.attempts.filter((item) => item.mission_id === currentMission.id) : []),
    [run, currentMission],
  );
  const latestVerifiedAttempt = useMemo(
    () => missionAttempts.find((attempt) => attempt.status === "COMPLETED" && attempt.score !== null) ?? null,
    [missionAttempts],
  );
  const latestAttempt = missionAttempts[0] ?? null;
  const pendingAttempt = useMemo(
    () => missionAttempts.find((attempt) => attempt.status === "QUEUED" || attempt.status === "RUNNING") ?? null,
    [missionAttempts],
  );

  useEffect(() => {
    if (!run || !pendingAttempt) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const response = await careerQuestApi.attempt(run.id, pendingAttempt.id);
        if (cancelled) return;
        if (response.attempt.status !== pendingAttempt.status) {
          await refreshRun(run.id);
          if (["UNAVAILABLE", "FAILED"].includes(response.attempt.status)) {
            setNotice(response.attempt.result?.feedback || "The isolated runner could not verify the submission.");
          }
        }
      } catch (pollError) {
        if (!cancelled) setError(errorMessage(pollError));
      }
    }, 1400);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [run, pendingAttempt, refreshRun]);

  async function startRun() {
    setStarting(true);
    setError("");
    try {
      const created = await careerQuestApi.start(difficulty);
      setRun(created);
      setReport(null);
      setMissionResult(null);
      window.sessionStorage.removeItem(introStorageKey(created.id));
      setShowIntro(true);
      await refreshDashboard();
      router.push(`/career-quest/run/${encodeURIComponent(created.id)}`);
    } catch (startError) {
      setError(errorMessage(startError));
    } finally {
      setStarting(false);
    }
  }

  async function saveInteraction(payload: { action: "decision" | "reflection" | "manager_message"; choices?: string[]; text?: string }) {
    if (!run || !currentMission) return;
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const updated = await careerQuestApi.interact(run.id, currentMission.id, payload);
      setRun(updated);
    } catch (interactionError) {
      setError(errorMessage(interactionError));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitCode(sourceCode: string) {
    if (!run || !currentMission) return;
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const response = await careerQuestApi.submit(run.id, currentMission.id, sourceCode);
      const updated = await refreshRun(run.id);
      if (response.attempt.status === "UNAVAILABLE") {
        setNotice(response.attempt.result?.feedback || "The isolated runner is unavailable. Your code was not scored.");
      } else if (!updated.attempts.some((item) => item.id === response.attempt.id)) {
        setError("The attempt was accepted but is not visible in the run snapshot yet. Refresh to reconcile it.");
      }
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  async function completeMission() {
    if (!run || !currentMission) return;
    setSubmitting(true);
    setError("");
    try {
      const result: MissionCompletion = await careerQuestApi.complete(run.id, currentMission.id);
      setRun(result.run);
      setProgression(result.progression);
      setMissionResult(result);
      setNotice(`Mission complete · +${result.xp_earned} XP`);
      if (result.report) setReport(result.report);
      await refreshDashboard();
    } catch (completeError) {
      setError(errorMessage(completeError));
    } finally {
      setSubmitting(false);
    }
  }

  async function abandonRun() {
    if (!run) return;
    setSubmitting(true);
    setError("");
    try {
      await careerQuestApi.abandon(run.id);
      setRun(null);
      router.push("/career-quest");
      await refreshDashboard();
    } catch (abandonError) {
      setError(errorMessage(abandonError));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl space-y-5">
          <div className="skeleton h-40 rounded-3xl" />
          <div className="grid gap-4 sm:grid-cols-3"><div className="skeleton h-28" /><div className="skeleton h-28" /><div className="skeleton h-28" /></div>
          <div className="skeleton h-96 rounded-3xl" />
          <span className="sr-only">Loading your Career Quest…</span>
        </div>
      </AppShell>
    );
  }

  if (error && !catalog) {
    return (
      <AppShell>
      <div className="mx-auto max-w-3xl py-4">
        <div className="rounded-2xl border border-[#F2C5BA] bg-white p-6">
          <p className="font-semibold text-[#842F23]">Career Quest could not load</p>
          <p className="mt-2 text-sm text-[#6F675C]">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-[#75451F] px-4 py-2 text-sm font-semibold text-white">Try again</button>
        </div>
      </div>
      </AppShell>
    );
  }

  if (routeRunId && !run) {
    return (
      <AppShell>
      <div className="mx-auto max-w-3xl py-4">
        <Link href="/career-quest" className="inline-flex items-center gap-2 text-sm font-semibold text-[#75451F]"><ArrowLeft size={15} /> Career Quest dashboard</Link>
        <div className="mt-5 rounded-2xl border border-[#EDE6DA] bg-white p-6">
          <p className="font-semibold text-[#24211D]">This quest could not be opened</p>
          <p className="mt-2 text-sm text-[#6F675C]">{error || "Refresh your run list and try again."}</p>
        </div>
      </div>
      </AppShell>
    );
  }

  if (routeRunId && run) {
    const enterOffice = () => {
      window.sessionStorage.setItem(introStorageKey(run.id), "seen");
      setShowIntro(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    if (showIntro && run.status === "IN_PROGRESS") {
      return <IntroCinematic run={run} onEnter={enterOffice} />;
    }
    if (run.status === "ABANDONED") {
      return <AppShell><AbandonedRun onBack={() => router.push("/career-quest")} /></AppShell>;
    }

    let content: React.ReactNode;
    if (run.status === "COMPLETED") {
      content = <FinalReport run={run} report={report} error={error} onBack={() => router.push("/career-quest")} />;
    } else if (!currentMission) {
      content = (
        <div className="mx-auto max-w-5xl py-4">
          <Link href="/career-quest" className="inline-flex items-center gap-2 text-sm font-semibold text-[#75451F]"><ArrowLeft size={16} /> Career Quest dashboard</Link>
          <div className="mt-5 rounded-2xl border border-[#EDE6DA] bg-white p-7 text-sm text-[#6F675C]">This run has no active mission.</div>
        </div>
      );
    } else {
      content = (
        <MissionWorkspace
          key={currentMission.id}
          run={run}
          mission={currentMission}
          interactions={missionInteractions}
          selectedDecision={Boolean(selectedDecision)}
          savedReflection={savedReflection}
          attempt={latestAttempt}
          verifiedAttempt={latestVerifiedAttempt}
          pendingAttempt={pendingAttempt}
          now={now}
          submitting={submitting}
          error={error}
          notice={notice}
          onDecision={(choices) => void saveInteraction({ action: "decision", choices })}
          onReflection={(text) => void saveInteraction({ action: "reflection", text })}
          onManagerMessage={(text) => void saveInteraction({ action: "manager_message", text })}
          onSubmitCode={(sourceCode) => void submitCode(sourceCode)}
          onComplete={() => void completeMission()}
          onAbandon={() => void abandonRun()}
          onDashboard={() => router.push("/career-quest")}
        />
      );
    }

    return (
      <AppShell>
        {content}
        <AnimatePresence>
          {missionResult && (
            <MissionDebriefModal
              result={missionResult}
              final={run.status === "COMPLETED"}
              onClose={() => setMissionResult(null)}
              onDashboard={() => {
                setMissionResult(null);
                router.push("/career-quest");
              }}
            />
          )}
        </AnimatePresence>
      </AppShell>
    );
  }

  const activeRun = runs.find((item) => item.status === "IN_PROGRESS");
  const softwareCareer = catalog?.careers.find((item) => item.key === "software_engineer");
  const achievements = progression?.achievements ?? [];
  const currentLevelProgress = xpForNextLevel(progression);
  const earnedKeys = new Set(achievements.map((item) => item.achievement_key));

  return (
    <AppShell>
    <div className="mx-auto w-full max-w-7xl">
      {/* Game hero */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-3xl bg-[#14110D] p-6 text-[#F7F0E3] shadow-[0_30px_70px_-34px_rgba(20,17,13,0.9)] sm:p-8"
      >
        <div className="pointer-events-none absolute inset-0 opacity-50" style={{ backgroundImage: "radial-gradient(circle at 12% 0%, rgba(244,185,66,.28), transparent 40%), radial-gradient(circle at 90% 100%, rgba(117,69,31,.55), transparent 45%)" }} />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)", backgroundSize: "44px 44px" }} />
        <Rocket size={160} strokeWidth={0.6} className="float-slow pointer-events-none absolute -bottom-12 left-[46%] hidden rotate-12 text-[#F4B942]/10 lg:block" />

        <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#F4B942]"><Sparkles size={14} /> SkillBridge simulation</div>
            <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Career <span className="bg-gradient-to-r from-[#FFE3A3] via-[#F4B942] to-[#E99A32] bg-clip-text text-transparent">Quest</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/65">Step into a real workday. Debug production code, make the calls, talk to your AI manager, and earn XP backed by verified test runs.</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {activeRun ? (
                <Link href={`/career-quest/run/${encodeURIComponent(activeRun.id)}`} className="shine inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#F4B942] to-[#E99A32] px-5 py-3 text-sm font-bold text-[#24211D] shadow-[0_12px_30px_-10px_rgba(244,185,66,0.7)] transition hover:-translate-y-0.5">
                  <Play size={15} fill="currentColor" /> Continue game <ArrowRight size={15} />
                </Link>
              ) : (
                <a href="#quest-setup" className="shine inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#F4B942] to-[#E99A32] px-5 py-3 text-sm font-bold text-[#24211D] shadow-[0_12px_30px_-10px_rgba(244,185,66,0.7)] transition hover:-translate-y-0.5">
                  <Play size={15} fill="currentColor" /> Choose your quest
                </a>
              )}
              <span className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3.5 py-3 text-xs text-white/70"><Clock3 size={14} /> About {catalog?.duration_minutes ?? 60} min · 4 missions</span>
            </div>
          </div>

          {/* Player card */}
          <div className="w-full rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur lg:w-[320px]">
            <div className="flex items-center gap-4">
              <div className="relative grid size-16 shrink-0 place-items-center">
                <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="5" />
                  <motion.circle cx="32" cy="32" r="28" fill="none" stroke="#F4B942" strokeWidth="5" strokeLinecap="round" strokeDasharray={2 * Math.PI * 28} initial={{ strokeDashoffset: 2 * Math.PI * 28 }} animate={{ strokeDashoffset: 2 * Math.PI * 28 * (1 - currentLevelProgress / 100) }} transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }} />
                </svg>
                <span className="font-display text-xl font-bold">{progression?.level ?? 1}</span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">Player level</p>
                <p className="flex items-center gap-1.5 font-display text-2xl font-bold"><Flame size={18} className="text-[#E99A32]" /><CountUp value={progression?.xp_total ?? 0} suffix=" XP" /></p>
                <p className="text-[11px] text-white/55">{progression?.xp_to_next_level ?? 100} XP to level {(progression?.level ?? 1) + 1}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                { label: "Missions", value: progression?.completed_missions ?? 0 },
                { label: "Badges", value: achievements.length },
                { label: "Runs", value: runs.length },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl bg-white/[0.06] px-2 py-2.5">
                  <p className="font-display text-lg font-bold"><CountUp value={stat.value} /></p>
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-white/45">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      {error && <InlineAlert tone="error" message={error} />}

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(310px,.65fr)]">
        <section id="quest-setup" className="surface scroll-mt-24 rounded-3xl p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="eyebrow">Step 1 · Choose a career</p>
              <h2 className="mt-1 font-display text-2xl font-bold text-[#24211D]">Pick your next workday</h2>
            </div>
            <Badge tone="gray">1 of {catalog?.careers.length ?? 6} playable</Badge>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {catalog?.careers.map((career, index) => {
              const Icon = careerIcons[career.key] ?? Code2;
              return (
                <motion.div
                  key={career.key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * index, duration: 0.35 }}
                  whileHover={career.available ? { y: -3 } : undefined}
                  className={cn(
                    "group relative overflow-hidden rounded-2xl border p-4 transition-shadow",
                    career.available
                      ? "border-[#F4B942] bg-gradient-to-br from-[#FFF9ED] to-[#FFF0D2] shadow-[0_10px_30px_-18px_rgba(233,154,50,0.8)] ring-2 ring-[#F4B942]/25 sm:col-span-2"
                      : "border-[#EDE6DA] bg-[#FFFCF6]",
                  )}
                >
                  {career.available && <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-[#2E7D32]/10 px-2 py-0.5 text-[10px] font-bold text-[#2E7D32]"><span className="live-dot size-1.5 rounded-full bg-[#2E7D32]" /> Playable</span>}
                  {!career.available && <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[#F0EBE2] px-2 py-0.5 text-[10px] font-semibold text-[#8A7F71]"><LockKeyhole size={11} /> Soon</span>}
                  <div className="flex items-center gap-3">
                    <span className={cn("grid size-11 place-items-center rounded-xl transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110", career.available ? "bg-gradient-to-br from-[#F4B942] to-[#E99A32] text-[#3A2512] shadow-[0_8px_18px_-8px_rgba(233,154,50,0.9)]" : "bg-[#EEE9E1] text-[#A39887]")}>
                      <Icon size={20} />
                    </span>
                    <div>
                      <h3 className={cn("font-semibold", career.available ? "text-[#24211D]" : "text-[#6F675C]")}>{career.title}</h3>
                      <p className="text-[11px] font-medium text-[#8A7F71]">{career.available ? "4 missions · final boss" : "Scenario in development · coming soon"}</p>
                    </div>
                  </div>
                  {career.available ? (
                    <>
                      <p className="mt-3 text-sm leading-6 text-[#4A443C]">{career.summary}</p>
                      {career.skills && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {career.skills.map((skill) => <span key={skill} className="rounded-lg border border-[#F4B942]/50 bg-white/70 px-2 py-0.5 text-[11px] font-medium text-[#75451F]">{skill}</span>)}
                        </div>
                      )}
                    </>
                  ) : null}
                </motion.div>
              );
            })}
          </div>

          <div className="mt-7 border-t border-[#F0EBE2] pt-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Step 2 · Difficulty</p>
                <h3 className="mt-1 text-base font-bold text-[#24211D]">How hard should today be?</h3>
                <p className="mt-0.5 text-xs text-[#8A7F71]">Difficulty changes the hidden test set and mission expectations.</p>
              </div>
            </div>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Difficulty">
              {difficultyOrder.map((key, index) => {
                const item = catalog?.difficulties[key];
                const active = difficulty === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setDifficulty(key)}
                    className={cn("relative rounded-2xl border p-4 text-left transition hover:-translate-y-0.5", active ? "border-[#E99A32] bg-[#FFF4DF] shadow-[0_10px_26px_-16px_rgba(233,154,50,0.9)]" : "border-[#EDE6DA] bg-white hover:border-[#D8C8AE]")}
                  >
                    {active && <motion.span layoutId="difficulty-check" className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-[#E99A32] text-white"><Check size={12} strokeWidth={3} /></motion.span>}
                    <span className="flex gap-0.5" aria-hidden="true">
                      {[0, 1, 2].map((star) => <Flame key={star} size={14} className={star <= index ? "text-[#E99A32]" : "text-[#E8DFD0]"} fill={star <= index ? "currentColor" : "none"} />)}
                    </span>
                    <span className="mt-2 block text-sm font-bold text-[#24211D]">{item?.label}</span>
                    <span className="mt-1 block text-[11px] leading-4 text-[#6F675C]">{item?.description}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#FFFCF6] p-4">
              <p className="max-w-md text-[11px] leading-5 text-[#8A7F71]">{catalog?.practice_notice}</p>
              <button
                type="button"
                onClick={() => void startRun()}
                disabled={starting || !softwareCareer?.available}
                className="shine inline-flex items-center gap-2 rounded-xl bg-[#24211D] px-5 py-3 text-sm font-bold text-white shadow-[0_12px_28px_-12px_rgba(36,33,29,0.8)] transition hover:-translate-y-0.5 hover:bg-[#3A2512] disabled:cursor-wait disabled:opacity-60"
              >
                <Play size={15} fill="currentColor" className="text-[#F4B942]" /> {starting ? "Preparing your team…" : activeRun ? "Start a new game" : "Start new game"} <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="surface rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <div><p className="eyebrow">Mission arc</p><h2 className="mt-1 text-lg font-bold text-[#24211D]">Your first day</h2></div>
              <Target size={19} className="text-[#E99A32]" />
            </div>
            <ol className="mt-4 space-y-0">
              {missionArc.map((item, index) => (
                <li key={item.title} className="relative flex gap-3 pb-4 last:pb-0">
                  {index < missionArc.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-24px)] w-px bg-gradient-to-b from-[#F4B942] to-[#EDE6DA]" />}
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold", index === missionArc.length - 1 ? "bg-[#24211D] text-[#F4B942]" : "bg-[#FFF0CE] text-[#75451F]")}>{index === missionArc.length - 1 ? <Trophy size={14} /> : index + 1}</span>
                  <span>
                    <span className="block text-xs font-bold text-[#24211D]">{item.title}</span>
                    <span className="block text-[11px] leading-4 text-[#8A7F71]">{item.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section className="surface rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <div><p className="eyebrow">Career progress</p><h2 className="mt-1 text-lg font-bold text-[#24211D]">Mission history</h2></div>
              <CalendarClock size={19} className="text-[#E99A32]" />
            </div>
            {runs.length ? (
              <div className="mt-4 space-y-3">
                {runs.slice(0, 4).map((item) => (
                  <Link href={`/career-quest/run/${encodeURIComponent(item.id)}`} key={item.id} className="group block rounded-2xl border border-[#EDE6DA] bg-white p-3 transition hover:-translate-y-0.5 hover:border-[#E3C894] hover:shadow-[0_10px_24px_-16px_rgba(117,69,31,0.5)]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-[#24211D]">{item.career_title}</p>
                        <p className="mt-1 text-[10px] capitalize text-[#8A7F71]">{item.difficulty} · {item.completed_missions}/{item.total_missions} missions</p>
                      </div>
                      <span className={cn("rounded-full px-2 py-1 text-[9px] font-bold", item.status === "IN_PROGRESS" ? "bg-[#FFF4DF] text-[#75451F]" : item.status === "COMPLETED" ? "bg-[#E8F2E7] text-[#37633B]" : "bg-[#F0EBE2] text-[#6F675C]")}>{item.status === "IN_PROGRESS" ? "In progress" : item.status === "COMPLETED" ? "Completed" : "Abandoned"}</span>
                    </div>
                    <Progress value={Math.round(item.completed_missions / Math.max(1, item.total_missions) * 100)} className="mt-2 h-1.5 bg-[#F3E9D8]" />
                    <p className="mt-2 flex items-center justify-between text-[10px] text-[#8A7F71]"><span>{item.current_mission_title || (item.status === "COMPLETED" ? "View performance report" : "Quest history")}</span><ChevronRight size={13} className="transition group-hover:translate-x-0.5" /></p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-[#D8C8AE] bg-[#FFFCF6] p-4 text-center">
                <p className="text-xs font-semibold text-[#24211D]">Your story starts here</p>
                <p className="mt-1 text-[11px] leading-5 text-[#8A7F71]">Complete your first mission to start building evidence and unlock the next scenario.</p>
              </div>
            )}
          </section>

          <section className="surface rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <div><p className="eyebrow">Achievement collection</p><h2 className="mt-1 text-lg font-bold text-[#24211D]">Badges <span className="text-sm font-semibold text-[#8A7F71]">{earnedKeys.size}/{Object.keys(achievementNames).length}</span></h2></div>
              <Award size={19} className="text-[#E99A32]" />
            </div>
            <div className="mt-4 grid grid-cols-5 gap-2">
              {Object.entries(achievementNames).map(([key, details]) => {
                const earned = earnedKeys.has(key);
                return (
                  <div key={key} className="group relative">
                    <div
                      tabIndex={0}
                      aria-label={`${details.title}: ${earned ? "earned" : "locked"}. ${details.detail}`}
                      className={cn(
                        "grid aspect-square place-items-center rounded-2xl border transition duration-300 group-hover:-translate-y-1 group-hover:rotate-3",
                        earned ? "border-[#F4B942] bg-gradient-to-br from-[#FFE3A3] to-[#F4B942] text-[#3A2512] shadow-[0_8px_20px_-10px_rgba(233,154,50,0.9)]" : "border-dashed border-[#E3D8C5] bg-[#FFFCF6] text-[#CFC4B2]",
                      )}
                    >
                      {earned ? <Trophy size={18} /> : <LockKeyhole size={15} />}
                    </div>
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-40 -translate-x-1/2 rounded-xl bg-[#24211D] px-3 py-2 text-center opacity-0 shadow-xl transition group-hover:opacity-100 group-focus-within:opacity-100">
                      <p className="text-[11px] font-bold text-white">{details.title}</p>
                      <p className="mt-0.5 text-[10px] leading-4 text-white/65">{details.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-[#8A7F71]">Hover a badge to see how to earn it.</p>
          </section>
        </aside>
      </div>
    </div>
    </AppShell>
  );
}

const careerIcons: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  software_engineer: Code2,
  ai_engineer: Bot,
  data_scientist: BarChart3,
  cybersecurity_analyst: ShieldCheck,
  product_manager: Rocket,
  business_analyst: Building2,
};

const missionArc = [
  { title: "Debug the billing API", detail: "Reproduce, fix, and cover edge cases." },
  { title: "Implement skill ranking", detail: "Ship a feature with deterministic ties." },
  { title: "Handle a checkout incident", detail: "Mitigate, page, and communicate." },
  { title: "Final boss: release readiness", detail: "Make the call under pressure." },
];

function InlineAlert({ tone, message }: { tone: "error" | "notice"; message: string }) {
  const errorTone = tone === "error";
  return <div role={errorTone ? "alert" : "status"} className={cn("mt-4 flex items-start gap-2 rounded-xl border px-3.5 py-3 text-xs", errorTone ? "border-[#F2C5BA] bg-[#FFF5F2] text-[#842F23]" : "border-[#E3C894] bg-[#FFF8E8] text-[#75451F]")}><CircleAlert size={15} className="mt-0.5 shrink-0" /><span>{message}</span></div>;
}

function IntroCinematic({ run, onEnter }: { run: QuestRun; onEnter: () => void }) {
  const [step, setStep] = useState(0);
  const mission = run.missions[0]?.mission;
  const steps = ["Offer", "Team", "Briefing"];
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#14110D] px-4 py-8 text-[#F7F0E3] sm:px-8">
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(circle at 15% 10%, rgba(244,185,66,.22), transparent 38%), radial-gradient(circle at 85% 80%, rgba(117,69,31,.4), transparent 42%)" }} />
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)", backgroundSize: "56px 56px" }} />
      <div className="relative mx-auto flex min-h-[75vh] w-full max-w-5xl flex-col justify-between">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-[#F4B942] font-display text-sm font-black text-[#3A250F]">{run.company.name.slice(0, 2).toUpperCase()}</span>
            <div><p className="text-xs font-bold tracking-wide">{run.company.name}</p><p className="text-[10px] text-white/50">{run.company.industry}</p></div>
          </div>
          <div className="flex items-center gap-1.5">{steps.map((label, index) => <span key={label} className={cn("h-1.5 rounded-full transition-all", index === step ? "w-8 bg-[#F4B942]" : "w-3 bg-white/20")} />)}</div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="my-8 grid gap-6 md:grid-cols-[1.15fr_.85fr] md:items-center"
          >
            {step === 0 && (
              <>
                <div>
                  <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#F4B942]"><Building2 size={14} /> Day one · 9:00 AM</p>
                  <h1 className="mt-4 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Welcome to<br /><span className="text-[#F4B942]">BrightLayer Health.</span></h1>
                  <p className="mt-4 max-w-xl text-sm leading-7 text-white/70">{run.company.mission}</p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold">{run.company.role}</span>
                    <span className="rounded-full border border-[#F4B942]/40 bg-[#F4B942]/10 px-3 py-1.5 text-xs font-semibold text-[#F4B942]">Level {run.difficulty} simulation</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/[0.06] p-6 backdrop-blur">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">Offer of employment</p>
                  <p className="mt-3 text-sm leading-6 text-white/80">You have been hired as a <strong className="text-white">Software Engineer</strong> on the Platform team. Your first workday starts now.</p>
                  <dl className="mt-5 space-y-3 text-xs">
                    <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3"><dt className="text-white/45">Manager</dt><dd className="font-semibold">{run.company.manager.name} · {run.company.manager.role}</dd></div>
                    <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3"><dt className="text-white/45">Team</dt><dd className="font-semibold">Platform · 2 engineers</dd></div>
                    <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3"><dt className="text-white/45">Deadline</dt><dd className="font-semibold text-[#F4B942]">{run.company.deadline}</dd></div>
                  </dl>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div>
                  <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#F4B942]"><Users size={14} /> The platform team</p>
                  <h1 className="mt-4 font-display text-4xl font-bold leading-tight sm:text-5xl">Meet the people<br />counting on you.</h1>
                  <p className="mt-4 max-w-xl text-sm leading-7 text-white/70">BrightLayer keeps small clinics billing accurately. Today, that team is short-handed, and the release is already moving.</p>
                  <div className="mt-6 rounded-2xl border border-[#F4B942]/25 bg-[#F4B942]/[0.08] p-4 text-xs leading-6 text-white/75"><span className="font-bold text-[#F4B942]">Manager note:</span> {run.company.manager.name} reviews the evidence you produce, not just whether you look busy.</div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.06] p-4">
                    <span className="grid size-11 place-items-center rounded-xl bg-[#F4B942]/20 text-sm font-bold text-[#F4B942]">{run.company.manager.name.split(" ").map((part) => part[0]).join("")}</span>
                    <div><p className="text-sm font-bold">{run.company.manager.name}</p><p className="text-[11px] text-white/50">{run.company.manager.role} · your manager</p></div>
                  </div>
                  {run.company.team.map((member) => (
                    <div key={member.name} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <span className="grid size-11 place-items-center rounded-xl bg-white/10 text-sm font-bold text-white/70">{member.name.split(" ").map((part) => part[0]).join("")}</span>
                      <div><p className="text-sm font-bold">{member.name}</p><p className="text-[11px] text-white/50">{member.role}</p></div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#F4B942]"><Rocket size={14} /> First-day briefing</p>
                  <h1 className="mt-4 font-display text-4xl font-bold leading-tight sm:text-5xl">{mission?.title ?? "Your first mission"}</h1>
                  <p className="mt-4 max-w-xl text-sm leading-7 text-white/70">{run.company.briefing}</p>
                  <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-semibold text-white/60"><span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><CalendarClock size={12} /> {mission?.timebox_minutes ?? 20} minute timebox</span><span className="rounded-full bg-white/10 px-3 py-1.5">4 missions · one workday</span></div>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/[0.06] p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">Your first objectives</p>
                  <div className="mt-3 space-y-2.5">{(mission?.objectives ?? []).map((objective) => <div key={objective} className="flex items-start gap-2 text-xs leading-5 text-white/75"><Check size={14} className="mt-0.5 shrink-0 text-[#F4B942]" /><span>{objective}</span></div>)}</div>
                  <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-3 text-[11px] leading-5 text-white/50">Everything is saved to your account. You can leave and continue from the dashboard.</div>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
          <button type="button" onClick={onEnter} className="text-xs font-semibold text-white/45 transition hover:text-white">Skip briefing</button>
          <div className="flex items-center gap-2">
            {step > 0 && <button type="button" onClick={() => setStep((value) => value - 1)} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-xs font-semibold text-white/75 transition hover:bg-white/10"><ArrowLeft size={14} /> Back</button>}
            {step < 2 ? (
              <button type="button" onClick={() => setStep((value) => value + 1)} className="inline-flex items-center gap-2 rounded-xl bg-[#F4B942] px-5 py-2.5 text-xs font-bold text-[#3A250F] transition hover:bg-[#FFD06A]">Continue <ArrowRight size={14} /></button>
            ) : (
              <button type="button" onClick={onEnter} className="inline-flex items-center gap-2 rounded-xl bg-[#F4B942] px-5 py-2.5 text-xs font-bold text-[#3A250F] transition hover:bg-[#FFD06A]"><Play size={14} fill="currentColor" /> Enter the office</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MissionDebriefModal({ result, final, onClose, onDashboard }: { result: MissionCompletion; final: boolean; onClose: () => void; onDashboard: () => void }) {
  const score = result.mission_score as Record<string, unknown>;
  const tests = (score.test_evidence ?? {}) as { passed?: number; total?: number };
  const dimensions = [
    ["Technical", "technical_correctness"],
    ["Problem-solving", "problem_solving"],
    ["Decision-making", "decision_making"],
    ["Communication", "communication"],
  ] as const;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#17130E]/70 px-4 py-8 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="mission-debrief-title">
      <motion.div initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.3 }} className="w-full max-w-lg rounded-3xl border border-[#E3C894] bg-[#FFFCF6] p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A1743A]">{final ? "Quest complete" : "Mission complete"}</p><h2 id="mission-debrief-title" className="mt-2 font-display text-2xl font-bold text-[#24211D]">{final ? "You shipped the workday." : "Your manager reviewed the evidence."}</h2></div>
          <span className="grid size-12 place-items-center rounded-full bg-[#FFF0CE] text-[#75451F]">{final ? <Trophy size={22} /> : <Check size={22} />}</span>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-white p-3 text-center"><p className="font-display text-xl font-bold text-[#75451F]">{Math.round(Number(score.overall ?? 0))}</p><p className="text-[9px] font-bold uppercase tracking-wider text-[#8A7F71]">Overall</p></div>
          <div className="rounded-xl bg-white p-3 text-center"><p className="font-display text-xl font-bold text-[#46764A]">+{result.xp_earned}</p><p className="text-[9px] font-bold uppercase tracking-wider text-[#8A7F71]">XP earned</p></div>
          <div className="rounded-xl bg-white p-3 text-center"><p className="font-display text-xl font-bold text-[#24211D]">{tests.passed ?? 0}/{tests.total ?? 0}</p><p className="text-[9px] font-bold uppercase tracking-wider text-[#8A7F71]">Tests passed</p></div>
        </div>
        <div className="mt-4 space-y-2.5">
          {dimensions.map(([label, key]) => (
            <div key={key}><div className="flex items-center justify-between text-[11px]"><span className="text-[#6F675C]">{label}</span><span className="font-bold text-[#24211D]">{Math.round(Number(score[key] ?? 0))}%</span></div><Progress value={Number(score[key] ?? 0)} className="mt-1 h-1.5 bg-[#F3E9D8] [&>div]:bg-[#E99A32]" /></div>
          ))}
        </div>
        <p className="mt-4 rounded-xl bg-white p-3 text-[11px] leading-5 text-[#6F675C]">{String(score.reflection_feedback && typeof score.reflection_feedback === "object" ? (score.reflection_feedback as { feedback?: string }).feedback ?? "Evidence saved." : "Evidence saved for your final report.")} <span className="block pt-1 text-[9px] text-[#A1988B]">Evaluator: {String(score.evaluator ?? "deterministic rubric")}</span></p>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={onDashboard} className="text-xs font-semibold text-[#8A7F71] hover:text-[#75451F]">Back to dashboard</button>
          <button type="button" onClick={onClose} className="inline-flex items-center gap-2 rounded-xl bg-[#75451F] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#5D3518]">{final ? "View performance report" : "Next mission"} <ArrowRight size={14} /></button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function QuestActivity({ run }: { run: QuestRun }) {
  const events = useMemo(() => {
    const items = [
      ...run.interactions
        .filter((item) => item.type !== "briefing")
        .map((item) => ({
          id: item.id,
          at: item.created_at,
          label: item.type === "requirement_change" ? "Requirement changed" : item.type === "manager_reply" ? "Manager replied" : item.type === "decision" ? "Decision recorded" : item.type === "reflection" ? "Debrief submitted" : "Message sent",
          detail: item.content,
          tone: item.type === "requirement_change" ? "amber" : item.actor === "player" ? "neutral" : "green",
        })),
      ...run.attempts.map((attempt) => ({
        id: attempt.id,
        at: attempt.updated_at,
        label: attempt.status === "COMPLETED" ? "Tests completed" : attempt.status === "UNAVAILABLE" ? "Runner unavailable" : attempt.status === "FAILED" ? "Attempt failed" : "Tests running",
        detail: attempt.result?.feedback ?? `Attempt ${attempt.attempt_number}`,
        tone: attempt.status === "COMPLETED" ? "green" : attempt.status === "UNAVAILABLE" || attempt.status === "FAILED" ? "red" : "neutral",
      })),
    ];
    return items.sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime()).slice(0, 5);
  }, [run]);

  return (
    <section className="rounded-2xl border border-[#EDE6DA] bg-white p-4">
      <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-bold uppercase tracking-wider text-[#8A7F71]">Notifications</p><Bell size={14} className="text-[#A1743A]" /></div>
      {events.length ? (
        <div className="mt-3 space-y-2">
          {events.map((event) => (
            <div key={event.id} className="flex items-start gap-2">
              <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", event.tone === "amber" ? "bg-[#E99A32]" : event.tone === "green" ? "bg-[#46764A]" : event.tone === "red" ? "bg-[#B45A46]" : "bg-[#B9AFA1]")} />
              <div className="min-w-0"><p className="text-[10px] font-semibold text-[#24211D]">{event.label}</p><p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-[#8A7F71]">{event.detail}</p></div>
            </div>
          ))}
        </div>
      ) : <p className="mt-3 text-[10px] leading-4 text-[#8A7F71]">Your mission activity will appear here.</p>}
    </section>
  );
}

function AbandonedRun({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto max-w-4xl py-4">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-xs font-semibold text-[#75451F]"><ArrowLeft size={14} /> Career Quest dashboard</button>
      <section className="mt-5 rounded-3xl border border-[#EDE6DA] bg-white p-7 sm:p-9">
        <div className="grid size-11 place-items-center rounded-xl bg-[#F1ECE3] text-[#75451F]"><LockKeyhole size={19} /></div>
        <h1 className="mt-4 font-display text-2xl font-bold text-[#24211D]">This run was abandoned</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[#6F675C]">Its history and any verified XP remain in your account. Start a new run from the Career Quest dashboard whenever you are ready.</p>
        <button onClick={onBack} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#75451F] px-4 py-2.5 text-xs font-semibold text-white">Back to dashboard <ArrowRight size={14} /></button>
      </section>
    </div>
  );
}

function MissionWorkspace({
  run,
  mission,
  interactions,
  selectedDecision,
  savedReflection,
  attempt,
  verifiedAttempt,
  pendingAttempt,
  now,
  submitting,
  error,
  notice,
  onDecision,
  onReflection,
  onManagerMessage,
  onSubmitCode,
  onComplete,
  onAbandon,
  onDashboard,
}: {
  run: QuestRun;
  mission: QuestMission;
  interactions: QuestRun["interactions"];
  selectedDecision: boolean;
  savedReflection: boolean;
  attempt: QuestRun["attempts"][number] | null;
  verifiedAttempt: QuestRun["attempts"][number] | null;
  pendingAttempt: QuestRun["attempts"][number] | null;
  now: number;
  submitting: boolean;
  error: string;
  notice: string;
  onDecision: (choices: string[]) => void;
  onReflection: (text: string) => void;
  onManagerMessage: (text: string) => void;
  onSubmitCode: (sourceCode: string) => void;
  onComplete: () => void;
  onAbandon: () => void;
  onDashboard: () => void;
}) {
  const [selectedChoices, setSelectedChoices] = useState<string[]>([]);
  const [reflection, setReflection] = useState("");
  const [managerMessage, setManagerMessage] = useState("");
  const [code, setCode] = useState(mission.mission.starter_code);
  const minutes = mission.mission.timebox_minutes;
  const started = mission.started_at ? new Date(mission.started_at).getTime() : now;
  const clockNow = now || started;
  const remainingSeconds = Math.max(0, minutes * 60 - Math.floor((clockNow - started) / 1000));
  const timeLabel = `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}`;
  const isIncident = mission.mission.type === "incident";
  const isBoss = mission.mission.type === "boss";
  const requiresMultiple = isIncident || isBoss;
  const requirementChange = interactions.find((item) => item.type === "requirement_change");
  const canComplete = Boolean(selectedDecision && savedReflection && verifiedAttempt && verifiedAttempt.score !== null && verifiedAttempt.score >= 70);
  const missionConversation = interactions.length ? interactions : [{ id: `opening-${mission.id}`, actor: "manager", type: "briefing", content: mission.mission.manager_opening, created_at: mission.started_at || run.started_at, choices: [], provider: "authored_scenario", mission_id: mission.id }];

  return (
    <div className="mx-auto w-full max-w-[1500px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onDashboard} aria-label="Back to Career Quest dashboard" className="grid size-9 place-items-center rounded-xl border border-[#EDE6DA] bg-white text-[#75451F] hover:bg-[#FFF5E5]"><ArrowLeft size={16} /></button>
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#A1743A]">{run.company.name} · {run.company.role}</p><h1 className="mt-0.5 font-display text-xl font-bold text-[#24211D]">Mission {mission.sequence}: {mission.mission.title}</h1></div>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-xs font-bold", remainingSeconds < 300 ? "border-[#E9B1A2] bg-[#FFF3EF] text-[#842F23]" : "border-[#EDE6DA] bg-white text-[#75451F]")}><Clock3 size={14} />{timeLabel}</div>
          <button onClick={onDashboard} disabled={submitting} className="rounded-lg border border-[#EDE6DA] bg-white px-3 py-1.5 text-xs font-semibold text-[#6F675C] hover:bg-[#FFFCF6] disabled:opacity-50">Save & exit</button>
          <button onClick={onAbandon} disabled={submitting} className="rounded-lg px-2 py-1.5 text-[10px] font-semibold text-[#9A5040] hover:bg-[#FFF3EF] disabled:opacity-50">Abandon</button>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-[#EDE6DA] bg-white px-4 py-3.5">
        <div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-[#24211D]">Career progress</span><span className="text-[#6F675C]">{run.progress.completed} of {run.progress.total} missions</span></div>
        <div id="quest-progress"><Progress value={run.progress.percent} className="mt-2 h-2 bg-[#F3E9D8] [&>div]:bg-[#E99A32]" /></div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {run.missions.map((item) => <div key={item.id} className="flex min-w-0 items-center gap-2 text-[10px]"><span className={cn("grid size-5 shrink-0 place-items-center rounded-full", item.status === "COMPLETED" ? "bg-[#E8F2E7] text-[#37633B]" : item.status === "AVAILABLE" ? "bg-[#FFF0CE] text-[#75451F]" : "bg-[#F0EBE2] text-[#8A7F71]")}>{item.status === "COMPLETED" ? <Check size={12} /> : item.status === "AVAILABLE" ? item.sequence : <LockKeyhole size={10} />}</span><span className={cn("truncate", item.status === "AVAILABLE" ? "font-bold text-[#24211D]" : "text-[#8A7F71]")}>{item.mission.title}</span></div>)}
        </div>
      </div>

      {error && <InlineAlert tone="error" message={error} />}
      {notice && <InlineAlert tone="notice" message={notice} />}
      {requirementChange && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#E9B45E] bg-[#FFF7E6] px-3.5 py-3 text-xs leading-5 text-[#6B4A1F]">
          <Bell size={15} className="mt-0.5 shrink-0 text-[#D8892C]" />
          <span><strong className="font-bold">Requirement change from {run.company.manager.name}:</strong> {requirementChange.content}</span>
        </motion.div>
      )}

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(310px,.72fr)]">
        <main className="space-y-4">
          <section className="rounded-2xl border border-[#EDE6DA] bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><div className="flex items-center gap-2"><span className="rounded-full border-0 bg-[#FFF0CE] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#75451F]">{mission.mission.type}</span><span className="text-[10px] font-medium uppercase tracking-wider text-[#8A7F71]">{mission.mission.difficulty}</span></div><h2 className="mt-3 text-lg font-bold text-[#24211D]">{mission.mission.subtitle}</h2></div>
              <span className="text-[10px] text-[#8A7F71]">{mission.mission.timebox_minutes} minute timebox</span>
            </div>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6F675C]">{mission.mission.brief}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {mission.mission.objectives.map((objective) => <div key={objective} className="flex items-start gap-2 rounded-xl bg-[#FFFCF6] p-3 text-xs leading-5 text-[#4C463F]"><Target size={14} className="mt-0.5 shrink-0 text-[#D8892C]" /><span>{objective}</span></div>)}
            </div>
          </section>

          <section className="rounded-2xl border border-[#EDE6DA] bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-bold text-[#24211D]"><Code2 size={16} className="text-[#75451F]" /> Python workspace</div><p className="mt-1 text-[11px] text-[#8A7F71]">The backend sends this source to an isolated execution service. It never runs inside SkillBridge.</p></div><span className="rounded-full bg-[#F4F0E8] px-2.5 py-1 text-[10px] font-medium text-[#6F675C]">Python 3</span></div>
            <div className="mt-4"><CareerQuestCodeEditor value={code} onChange={setCode} /></div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[10px] leading-4 text-[#8A7F71]">Your source is processed by the isolated runner and not retained after the attempt.</p>
              <button type="button" onClick={() => onSubmitCode(code)} disabled={submitting || Boolean(pendingAttempt) || !code.trim()} className="inline-flex items-center gap-2 rounded-xl bg-[#24211D] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#3D3832] disabled:cursor-not-allowed disabled:opacity-50"><Braces size={14} />{pendingAttempt ? pendingAttempt.status === "QUEUED" ? "Queued…" : "Running tests…" : submitting ? "Submitting…" : "Run hidden tests"}</button>
            </div>
            <div className="mt-4 rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] p-3.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#24211D]"><ShieldCheck size={15} className="text-[#46764A]" /> Submission feedback</div>
              {pendingAttempt ? <p className="mt-2 text-xs text-[#6F675C]">Your submission is being tested in isolation. You can stay on this mission while the result arrives.</p> : attempt ? <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs leading-5 text-[#6F675C]">{attempt.result?.feedback || "No feedback is available for this attempt."}</p>{attempt.score !== null && <span className="rounded-full bg-[#E8F2E7] px-2.5 py-1 text-xs font-bold text-[#37633B]">{attempt.result?.passed_tests ?? 0}/{attempt.result?.total_tests ?? 0} passed · {attempt.score}%</span>}</div> : <p className="mt-2 text-xs text-[#8A7F71]">Run your solution to receive results from actual test execution.</p>}
              {attempt?.result?.failure_categories?.length ? <p className="mt-2 text-[10px] text-[#8A7F71]">Observed categories: {attempt.result.failure_categories.join(", ").replaceAll("_", " ")}</p> : null}
            </div>
            <details className="mt-3 rounded-xl border border-[#EDE6DA] bg-white px-3.5 py-3">
              <summary className="cursor-pointer text-xs font-semibold text-[#75451F]">View public examples</summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">{mission.mission.public_examples.map((example, index) => <div key={index} className="rounded-lg bg-[#FFFCF6] p-3"><p className="text-[9px] font-bold uppercase tracking-wider text-[#8A7F71]">Example {index + 1}</p><pre className="mt-2 whitespace-pre-wrap break-words text-[10px] leading-4 text-[#4C463F]">Input: {JSON.stringify(example.input)}{"\n"}Output: {JSON.stringify(example.output)}</pre></div>)}</div>
            </details>
          </section>

          <section className="rounded-2xl border border-[#EDE6DA] bg-white p-4 sm:p-5">
            <div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#FFF0CE] text-[#75451F]"><Target size={15} /></span><div><h2 className="text-sm font-bold text-[#24211D]">{mission.mission.decision_prompt}</h2>            <p className="mt-1 text-[11px] leading-5 text-[#8A7F71]">Choose the approach you took. {requiresMultiple ? "Select at least two actions." : "Your choices are scored against the scenario rubric."}</p></div></div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {mission.mission.decisions.map((decision) => {
                const checked = selectedDecision ? interactions.find((item) => item.type === "decision")?.choices.includes(decision.key) : selectedChoices.includes(decision.key);
                return <button key={decision.key} type="button" aria-pressed={Boolean(checked)} disabled={Boolean(selectedDecision)} onClick={() => setSelectedChoices((items) => checked ? items.filter((item) => item !== decision.key) : [...items, decision.key])} className={cn("rounded-xl border p-3 text-left text-xs leading-5 transition", checked ? "border-[#E99A32] bg-[#FFF4DF] text-[#4C3320]" : "border-[#EDE6DA] bg-white text-[#6F675C] hover:border-[#D8C8AE]", selectedDecision && "cursor-default")}>{decision.label}</button>;
              })}
            </div>
            {!selectedDecision && <button onClick={() => onDecision(selectedChoices)} disabled={submitting || !selectedChoices.length || (requiresMultiple && selectedChoices.length < 2)} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#D8C8AE] bg-[#FFFCF6] px-3 py-2 text-xs font-semibold text-[#75451F] disabled:opacity-50"><Check size={13} /> Save decision</button>}
          </section>

          <section className="rounded-2xl border border-[#EDE6DA] bg-white p-4 sm:p-5">
            <div className="flex items-center gap-2 text-sm font-bold text-[#24211D]"><MessageCircle size={16} className="text-[#75451F]" /> Mission debrief</div>
            <p className="mt-1 text-[11px] leading-5 text-[#8A7F71]">Explain what you checked, what evidence shaped your choice, and what you would verify next.</p>
            {savedReflection ? <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#E8F2E7] p-3 text-xs font-medium text-[#37633B]"><Check size={14} /> Debrief saved for this mission.</div> : <><textarea value={reflection} onChange={(event) => setReflection(event.target.value)} maxLength={1000} rows={4} placeholder="Describe your reasoning…" className="mt-3 w-full resize-y rounded-xl border border-[#E5DED2] bg-[#FFFCF6] p-3 text-xs leading-5 text-[#24211D] outline-none placeholder:text-[#A9A093] focus:border-[#D89A43]" /><div className="mt-2 flex items-center justify-between gap-3"><span className="text-[10px] text-[#8A7F71]">{reflection.length}/1000 characters</span><button onClick={() => onReflection(reflection)} disabled={submitting || reflection.trim().length < 12} className="inline-flex items-center gap-2 rounded-lg bg-[#75451F] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Send size={13} /> Save debrief</button></div></>}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#EDE6DA] bg-[#FFFCF6] p-4">
            <p className="max-w-xl text-[11px] leading-5 text-[#6F675C]">Complete when a verified code attempt passes at least 70% of tests, and your decision and debrief are saved.</p>
            <button type="button" onClick={onComplete} disabled={submitting || !canComplete} className="inline-flex items-center gap-2 rounded-xl bg-[#46764A] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#37633B] disabled:cursor-not-allowed disabled:opacity-45">Complete mission <ArrowRight size={14} /></button>
          </div>
        </main>

        <aside className="space-y-4 xl:sticky xl:top-24">
          <section className="overflow-hidden rounded-2xl border border-[#EDE6DA] bg-white">
            <div className="border-b border-[#EDE6DA] bg-[#FFFCF6] p-4"><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-[#F4B942]/30 text-[#75451F]"><Bot size={17} /></span><div><p className="text-xs font-bold text-[#24211D]">{run.company.manager.name}</p><p className="text-[10px] text-[#8A7F71]">{run.company.manager.role}</p></div><span className="ml-auto rounded-full bg-[#E8F2E7] px-2 py-1 text-[9px] font-semibold text-[#37633B]">Your manager</span></div></div>
            <div className="max-h-[320px] space-y-3 overflow-y-auto p-3.5" aria-live="polite">
              {missionConversation.map((item) => <div key={item.id} className={cn("max-w-[95%] rounded-2xl p-3 text-[11px] leading-5", item.actor === "player" ? "ml-auto bg-[#FFF0CE] text-[#4C3320]" : item.type === "requirement_change" ? "border border-[#E9B45E] bg-[#FFF7E6] text-[#6B4A1F]" : "bg-[#F6F3EE] text-[#4C463F]")}><p>{item.content}</p><p className="mt-1 text-[9px] opacity-60">{item.actor === "player" ? "You" : item.type === "requirement_change" ? "Requirement change · " + run.company.manager.name : item.provider.startsWith("ollama") ? "Local AI · " + run.company.manager.name : "Scenario · " + run.company.manager.name}</p></div>)}
            </div>
            <div className="border-t border-[#EDE6DA] p-3">
              <label htmlFor="manager-message" className="sr-only">Message your manager</label>
              <div className="flex gap-2"><input id="manager-message" value={managerMessage} onChange={(event) => setManagerMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && managerMessage.trim()) onManagerMessage(managerMessage); }} maxLength={500} placeholder="Ask your manager…" className="min-w-0 flex-1 rounded-lg border border-[#EDE6DA] bg-[#FFFCF6] px-3 py-2 text-[11px] outline-none focus:border-[#D89A43]" /><button type="button" aria-label="Send manager message" onClick={() => onManagerMessage(managerMessage)} disabled={submitting || !managerMessage.trim()} className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#75451F] text-white disabled:opacity-45"><Send size={14} /></button></div>
              <p className="mt-2 text-[9px] leading-4 text-[#A1988B]">Local AI dialogue is labeled. Authored scenario messages remain available if Ollama is offline.</p>
            </div>
          </section>

          <section className="rounded-2xl border border-[#EDE6DA] bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A7F71]">Team desk</p>
            <div className="mt-3 space-y-2">{run.company.team.map((member) => <div key={member.name} className="flex items-center gap-2.5"><span className="grid size-7 place-items-center rounded-full bg-[#F1ECE3] text-[10px] font-bold text-[#75451F]">{member.name.split(" ").map((part) => part[0]).join("")}</span><span><span className="block text-[11px] font-semibold text-[#24211D]">{member.name}</span><span className="block text-[9px] text-[#8A7F71]">{member.role}</span></span></div>)}</div>
            <div className="mt-3 rounded-xl bg-[#FFFCF6] p-3"><p className="text-[9px] font-bold uppercase tracking-wider text-[#A1743A]">Deadline</p><p className="mt-1 text-xs font-semibold text-[#24211D]">{run.company.deadline}</p></div>
          </section>

          <QuestActivity run={run} />

          <section className="rounded-2xl border border-[#EDE6DA] bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A7F71]">Mission signals</p>
            <div className="mt-3 flex flex-wrap gap-1.5">{mission.mission.skills.map((skill) => <span key={skill} className="rounded-full border border-[#EDE6DA] bg-[#FFFCF6] px-2 py-1 text-[9px] font-medium capitalize text-[#6F675C]">{skill}</span>)}</div>
            <p className="mt-3 text-[10px] leading-4 text-[#8A7F71]">Only test execution, recorded choices, and your debrief contribute evidence to the report.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function FinalReport({ run, report, error, onBack }: { run: QuestRun; report: QuestReport | null; error: string; onBack: () => void }) {
  if (!report) return <div className="mx-auto max-w-5xl py-4"><button onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-[#75451F]"><ArrowLeft size={15} /> Career Quest</button>{error ? <InlineAlert tone="error" message={error} /> : <p className="mt-8 text-sm text-[#6F675C]">Loading the verified performance report…</p>}</div>;
  const dimensions = [
    ["Technical correctness", "technical_correctness"],
    ["Problem-solving", "problem_solving"],
    ["Debugging ability", "debugging_ability"],
    ["Decision-making", "decision_making"],
    ["Communication", "communication"],
  ] as const;
  return (
    <div className="mx-auto w-full max-w-6xl">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-xs font-semibold text-[#75451F] hover:text-[#A1743A]"><ArrowLeft size={14} /> Career Quest dashboard</button>
      <div className="mt-5 rounded-3xl border border-[#EDE6DA] bg-white p-6 shadow-sm sm:p-9">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-[#A1743A]"><Trophy size={15} /> Quest complete</div><h1 className="mt-2 font-display text-3xl font-bold text-[#24211D]">Your engineering practice report</h1><p className="mt-2 text-sm text-[#6F675C]">{run.company.name} · {run.career_title} · {run.difficulty}{report.mission_completion ? ` · ${report.mission_completion.completed}/${report.mission_completion.total} missions` : ""}</p></div>
          <div className="grid size-28 place-items-center rounded-full border-[6px] border-[#F4B942]/35 bg-[#FFF9ED]"><div className="text-center"><span className="block font-display text-3xl font-bold text-[#75451F]">{report.overall_score}</span><span className="text-[9px] font-bold uppercase tracking-wider text-[#8A7F71]">practice score</span></div></div>
        </div>
        <div className="mt-6 rounded-2xl border border-[#E3C894] bg-[#FFF9ED] p-4 text-xs leading-5 text-[#6F675C]">{String(report.score_methodology.simulation_limit || "These results summarize practice evidence from this simulation.")}</div>

        {report.career_readiness && (
          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-[#D8E8D7] bg-[#F3F8F2] p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-[#37633B]"><Rocket size={19} /></span>
            <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wider text-[#5B7A5C]">Career readiness · {report.career_readiness.label}</p><p className="mt-1 text-xs leading-5 text-[#4C463F]">{report.career_readiness.summary}</p></div>
          </div>
        )}

        <section className="mt-7"><h2 className="text-sm font-bold text-[#24211D]">Performance dimensions</h2><div className="mt-4 grid gap-4 md:grid-cols-2">{dimensions.map(([label, key]) => { const score = Number(report.dimensions[key] || 0); return <div key={key}><div className="flex items-center justify-between gap-3 text-xs"><span className="font-medium text-[#4C463F]">{label}</span><span className="font-bold text-[#24211D]">{score}%</span></div><Progress value={score} className="mt-2 h-2 bg-[#F3E9D8] [&>div]:bg-[#E99A32]" /></div>; })}</div></section>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section><h2 className="flex items-center gap-2 text-sm font-bold text-[#24211D]"><Check size={15} className="text-[#46764A]" /> Skills demonstrated</h2>{report.skills_demonstrated.length ? <div className="mt-3 flex flex-wrap gap-2">{report.skills_demonstrated.map((item) => <span key={item.skill} className="rounded-full border border-[#D8E8D7] bg-[#F3F8F2] px-3 py-1.5 text-xs font-semibold capitalize text-[#37633B]">{item.skill} · {item.score}%</span>)}</div> : <p className="mt-3 text-xs text-[#8A7F71]">The report has no skills above the demonstrated evidence threshold yet.</p>}</section>
          <section><h2 className="flex items-center gap-2 text-sm font-bold text-[#24211D]"><RotateCcw size={15} className="text-[#A1743A]" /> Skills to strengthen</h2>{report.skills_requiring_improvement.length ? <div className="mt-3 flex flex-wrap gap-2">{report.skills_requiring_improvement.map((item) => <span key={item.skill} className="rounded-full border border-[#EDE6DA] bg-[#FFFCF6] px-3 py-1.5 text-xs font-semibold capitalize text-[#75451F]">{item.skill} · {item.score}%</span>)}</div> : <p className="mt-3 text-xs text-[#8A7F71]">No skills fell below the current improvement threshold.</p>}</section>
        </div>

        <section className="mt-8"><h2 className="text-sm font-bold text-[#24211D]">Mission evidence</h2><div className="mt-3 grid gap-3 md:grid-cols-3">{report.mission_evidence.map((item) => <div key={item.mission_id} className="rounded-2xl border border-[#EDE6DA] bg-[#FFFCF6] p-4"><p className="text-xs font-bold text-[#24211D]">{item.title}</p><p className="mt-2 text-[10px] leading-4 text-[#6F675C]">Technical: {String(item.score.technical_correctness ?? 0)}% · Decision: {String(item.score.decision_making ?? 0)}% · Debrief: {String(item.score.evaluator ?? "rubric")}</p><p className="mt-2 text-[9px] text-[#8A7F71]">Verified test result: {String((item.score.test_evidence as { passed?: number } | undefined)?.passed ?? 0)}/{String((item.score.test_evidence as { total?: number } | undefined)?.total ?? 0)} passed</p></div>)}</div></section>

        <section className="mt-8 rounded-2xl border border-[#EDE6DA] bg-white p-4 sm:p-5"><h2 className="text-sm font-bold text-[#24211D]">Recommended next practice</h2><div className="mt-3 grid gap-3 md:grid-cols-3">{report.recommended_learning_roadmap.map((item) => <div key={item.skill} className="rounded-xl bg-[#FFFCF6] p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-[#75451F]">{item.skill}</span><span className="text-[10px] text-[#8A7F71]">Evidence {item.evidence_score}%</span></div><p className="mt-2 text-[11px] leading-5 text-[#6F675C]">{item.recommendation}</p></div>)}</div></section>

        {report.skillbridge_learning_roadmap && (
          <section className="mt-6 rounded-2xl border border-[#EDE6DA] bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-bold text-[#24211D]">SkillBridge learning roadmap</h2><p className="mt-1 text-[11px] text-[#8A7F71]">Generated from the skills this run showed you still need. Target role: {report.skillbridge_learning_roadmap.target_role}.</p></div><Link href="/learn" className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8C8AE] bg-[#FFFCF6] px-3 py-2 text-xs font-semibold text-[#75451F] transition hover:border-[#E3C894]">Open learning workspace <ArrowUpRight size={13} /></Link></div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {report.skillbridge_learning_roadmap.items.map((item) => (
                <div key={`${item.skill}-${item.title}`} className="rounded-xl border border-[#F0EBE2] bg-[#FFFCF6] p-3.5">
                  <div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold text-[#24211D]">{item.title}</p><p className="mt-1 text-[10px] text-[#8A7F71]">{item.provider} · {item.estimated_hours}h</p></div><span className="rounded-full bg-[#FFF0CE] px-2 py-1 text-[9px] font-bold capitalize text-[#75451F]">{item.skill}</span></div>
                  <p className="mt-2 text-[11px] leading-5 text-[#6F675C]">{item.practice_task}</p>
                  {item.resource_url && <a href={item.resource_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#75451F] hover:underline">{item.resource} <ArrowUpRight size={12} /></a>}
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">{report.skillbridge_learning_roadmap.weekly_focus.map((focus) => <span key={focus} className="rounded-full bg-[#F6F3EE] px-3 py-1.5 text-[10px] text-[#6F675C]">{focus}</span>)}</div>
            <p className="mt-3 text-[9px] leading-4 text-[#A1988B]">{report.skillbridge_learning_roadmap.notice}</p>
          </section>
        )}

        <p className="mt-7 border-t border-[#F0EBE2] pt-4 text-[10px] leading-5 text-[#8A7F71]">Scores come from actual isolated test execution, recorded mission choices, and the stated reflection evaluator. They summarize this practice simulation and are not hiring predictions.</p>
      </div>
    </div>
  );
}

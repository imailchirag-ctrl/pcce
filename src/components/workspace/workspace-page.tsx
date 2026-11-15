git add ."use client";

<<<<<<< Updated upstream
import { DashboardPage } from "./pages/dashboard";
import { ResumePage } from "./pages/resume";
import { CareerPage } from "./pages/career";
import { LearnPage } from "./pages/learn";
import { InterviewsPage } from "./pages/interviews";
import { InterviewSessionPage } from "./pages/interview-session";
import { InterviewReportPage } from "./pages/interview-report";
import { JobsPage } from "./pages/jobs";
import { ApplicationsPage } from "./pages/applications";
import { ProfilePage } from "./pages/profile";
import { SettingsPage } from "./pages/settings";
import { OnboardingPage } from "./pages/onboarding";
import { RecruiterOverviewPage } from "./pages/recruiter-overview";
import { RecruiterJobsPage } from "./pages/recruiter-jobs";
import { RecruiterCandidatesPage } from "./pages/recruiter-candidates";
import { RecruiterPipelinePage } from "./pages/recruiter-pipeline";
import { CareerQuestPage } from "./pages/career-quest";
import { DigitalTwinPage } from "./pages/digital-twin";
import { MarketIntelPage } from "./pages/market-intel";
import { SkillExchangePage } from "./pages/skill-exchange";
=======
/* eslint-disable @typescript-eslint/no-unused-vars */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertCircle, ArrowRight, ArrowUpRight, Award, Bookmark, BrainCircuit, BriefcaseBusiness, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, CloudUpload, Cpu, Download, FileText, Filter, GraduationCap, Lightbulb, Loader2, MapPin, MessageSquareText, Mic, MicOff, MoreHorizontal, Plus, RefreshCw, Search, Send, Sparkles, Square, Target, TrendingUp, UploadCloud, Users, Volume2, Wifi, WifiOff, X, Zap } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge, Card, CardTitle, EmptyState, Progress, SkillPill } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { activities, candidates, courses, initialRoadmap, jobs, missingSkills, partialSkills, skills } from "@/lib/mock-data";
import { demoService } from "@/lib/mock-service";
import { AiError, ai, aiCache, uploadResume } from "@/lib/ai/client";
import { useAiWorkspace } from "@/lib/ai/use-ai-workspace";
import type { InterviewEvaluation, JobMatch, ModelStatus, ResumeAnalysis, RoadmapResponse } from "@/lib/ai/types";
>>>>>>> Stashed changes

export type WorkspaceMode =
  | "dashboard"
  | "resume"
  | "career"
  | "learn"
  | "interviews"
  | "session"
  | "report"
  | "jobs"
  | "applications"
  | "profile"
  | "settings"
  | "onboarding"
  | "recruiter"
  | "recruiterJobs"
  | "candidates"
  | "pipeline"
  | "careerQuest"
  | "digitalTwin"
  | "marketIntel"
  | "skillExchange";

<<<<<<< Updated upstream
const PAGE_MAP: Record<WorkspaceMode, React.ComponentType> = {
  dashboard: DashboardPage,
  resume: ResumePage,
  career: CareerPage,
  learn: LearnPage,
  interviews: InterviewsPage,
  session: InterviewSessionPage,
  report: InterviewReportPage,
  jobs: JobsPage,
  applications: ApplicationsPage,
  profile: ProfilePage,
  settings: SettingsPage,
  onboarding: OnboardingPage,
  recruiter: RecruiterOverviewPage,
  recruiterJobs: RecruiterJobsPage,
  candidates: RecruiterCandidatesPage,
  pipeline: RecruiterPipelinePage,
  careerQuest: CareerQuestPage,
  digitalTwin: DigitalTwinPage,
  marketIntel: MarketIntelPage,
  skillExchange: SkillExchangePage,
};
=======
function Heading({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: React.ReactNode }) {
  return <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="eyebrow">{eyebrow}</p><h1 className="mt-2 text-[1.7rem] font-semibold tracking-[-.04em] sm:text-[2rem]">{title}</h1><p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{detail}</p></div>{action}</div>;
}

function Metric({ label, value, change, icon: Icon, tint = "purple" }: { label: string; value: string; change: string; icon: typeof Sparkles; tint?: string }) {
  return <Card className="p-4 sm:p-5"><div className="flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">{label}</span><span className={`grid size-9 place-items-center rounded-xl ${tint}`}><Icon size={17} /></span></div><div className="mt-4 flex items-end justify-between gap-3"><span className="text-2xl font-semibold tracking-tight">{value}</span><span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#39845d]"><ArrowUpRight size={13} /> {change}</span></div></Card>;
}

function AiNotice({ busy, error, note }: { busy?: string | null; error?: string | null; note?: string }) {
  if (error) return <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-[#f3d9d5] bg-[#fff7f5] px-3.5 py-3 text-xs leading-5 text-[#a35248]"><AlertCircle size={15} className="mt-0.5 shrink-0" /><span><b className="font-semibold">Local AI service: </b>{error}</span></div>;
  if (busy) return <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#e7e1fb] bg-[#faf8ff] px-3.5 py-3 text-xs text-[#6f5bd0]"><Loader2 size={15} className="animate-spin" /><span>{busy}…</span><span className="ml-auto text-[10px] text-[#9a92ac]">local inference · CPU</span></div>;
  if (note) return <p className="mt-3 flex items-center gap-1.5 text-[10px] text-[#8f88a0]"><Cpu size={12} />{note}</p>;
  return null;
}

function LivePill({ live, children }: { live: boolean; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${live ? "border-[#d7eee1] bg-[#f1fbf5] text-[#3f8b60]" : "border-[#e9e4f3] bg-[#faf9fd] text-[#847c95]"}`}><span className={`size-1.5 rounded-full ${live ? "bg-[#4aab72]" : "bg-[#b2aac2]"}`} />{children}</span>;
}

function WorkContent({ mode }: { mode: WorkspaceMode }) {
  const router = useRouter();
  const live = useAiWorkspace();
  const [toast, setToast] = useState<string | null>(null);
  const [savedJobs, setSavedJobs] = useState<string[]>([]);
  const [applications, setApplications] = useState<Record<string, string>>({});
  const [roadmap, setRoadmap] = useState(initialRoadmap);
  const [shortlisted, setShortlisted] = useState<string[]>([]);
  const [interviews, setInterviews] = useState<{ type: string; score: number; date: string }[]>([]);
  const [interviewType, setInterviewType] = useState("Technical interview");
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [jobQuery, setJobQuery] = useState("");
  const [jobType, setJobType] = useState("All types");
  const [courseFilter, setCourseFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [skillFilter, setSkillFilter] = useState("All roles");
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizChoice, setQuizChoice] = useState<number | null>(null);
  const [quizChecked, setQuizChecked] = useState(false);
  const [weeklyGoal, setWeeklyGoal] = useState(6);
  const [goalEditing, setGoalEditing] = useState(false);
  const [jobFormOpen, setJobFormOpen] = useState(false);
  const [publishedJobs, setPublishedJobs] = useState(["Frontend Engineer", "Product Engineer"]);
  const [uploadName, setUploadName] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadDone, setUploadDone] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [editingResume, setEditingResume] = useState(false);
  const [summary, setSummary] = useState("Frontend developer with 3+ years of experience building accessible, responsive web applications. Skilled in React, TypeScript, and creating thoughtful product experiences.");
  const [targetRole, setTargetRole] = useState("Frontend Engineer");
  const [jobDescription, setJobDescription] = useState("");
  const [analyzed, setAnalyzed] = useState(false);
  const [answer, setAnswer] = useState("");
  const [question, setQuestion] = useState(0);
  const [companyJobForm, setCompanyJobForm] = useState({ title: "", location: "", type: "Full-time" });
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSavedJobs(demoService.getSavedJobs());
      setApplications(demoService.getApplications());
      setRoadmap(demoService.getRoadmap(initialRoadmap));
      setShortlisted(demoService.getShortlisted());
      setInterviews(demoService.getInterviews());
      setInterviewType(demoService.getInterviewType());
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);
  useEffect(() => {
    if (mode !== "recruiterJobs") return;
    if (!window.location.pathname.endsWith("/new") && new URLSearchParams(window.location.search).get("create") !== "1") return;
    const timeout = window.setTimeout(() => setJobFormOpen(true), 0);
    return () => window.clearTimeout(timeout);
  }, [mode]);
  useEffect(() => {
    if (!toast) return;
    window.dispatchEvent(new CustomEvent("skillbridge-toast", { detail: toast }));
    const timeout = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (live.savedJobIds.length) setSavedJobs(live.savedJobIds);
  }, [live.savedJobIds]);
  useEffect(() => {
    if (!live.applications.length) return;
    const next: Record<string, string> = {};
    for (const item of live.applications) {
      const jobId = String(item.job_id ?? "");
      if (jobId) next[jobId] = String(item.status ?? "APPLIED");
    }
    if (Object.keys(next).length) setApplications(next);
  }, [live.applications]);
  useEffect(() => {
    if (!live.history.length) return;
    setInterviews(live.history.map((item) => ({ type: item.type, score: item.score, date: item.date })));
  }, [live.history]);
  useEffect(() => {
    if (!live.roadmap?.items?.length) return;
    const steps = live.roadmap.items.map((item) => ({ id: item.id, title: item.title, detail: `${item.skill} · ${item.estimated_hours}h · ${item.provider}`, done: item.completed }));
    const timeout = window.setTimeout(() => {
      setRoadmap(steps);
      demoService.saveRoadmap(steps);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [live.roadmap]);
  useEffect(() => {
    if (live.error) setToast(live.error);
  }, [live.error]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function toggleSave(id: string) {
    try {
      const result = await live.toggleSave(id);
      setSavedJobs(result.saved_job_ids);
      setToast(result.saved_job_ids.includes(id) ? "Job saved to your account" : "Job removed from saved jobs");
    } catch {
      // live.error already explains the failure in the inline notice.
    }
  }
  async function apply(id: string) {
    try {
      await live.apply(id);
      setApplications((current) => ({ ...current, [id]: "APPLIED" }));
      setToast("Application tracked in your account");
    } catch {
      // live.error already explains the failure in the inline notice.
    }
  }
  function updateRoadmap(id: string) {
    const next = roadmap.map((step) => step.id === id ? { ...step, done: !step.done } : step);
    setRoadmap(next);
    demoService.saveRoadmap(next);
  }
  function toggleShortlist(id: string) {
    const next = demoService.toggleShortlisted(id);
    setShortlisted(next);
    setToast(next.includes(id) ? "Candidate added to shortlist" : "Candidate removed from shortlist");
  }
  async function selectFile(file?: File) {
    if (!file) return;
    if (!/\.(pdf|docx|txt|md)$/i.test(file.name)) { setToast("Choose a PDF, DOCX, TXT, or MD file"); return; }
    if (file.size > 10 * 1024 * 1024) { setToast("Keep your resume under 10 MB"); return; }
    setUploadName(file.name);
    setUploadDone(false);
    setUploadProgress(0);
    try {
      const result = await live.upload(file, {
        targetRole,
        jobDescription,
        onProgress: (percent) => setUploadProgress(percent),
      });
      setUploadName(result.document.filename);
      setUploadProgress(100);
      setUploadDone(true);
      setToast(`Live analysis ready · ${result.analysis.skill_names.length} skills detected`);
      void live.loadJobs(result.analysis.skill_names, result.analysis.profile.summary ?? "");
    } catch {
      setUploadProgress(0);
    }
  }
  function addRoadmapStep(id: string, title: string, detail: string) {
    if (roadmap.some((item) => item.id === id)) { setToast("That item is already on your roadmap"); return; }
    const next = [...roadmap, { id, title, detail, done: false }];
    setRoadmap(next);
    demoService.saveRoadmap(next);
    setToast("Added to your roadmap");
  }
  async function startInterview(type: string) {
    demoService.setInterviewType(type);
    setInterviewType(type);
    try {
      await live.startInterview({
        type,
        role: targetRole,
        difficulty: "intermediate",
        skills: live.analysis?.skill_names ?? [],
        resumeContext: live.analysis?.profile.summary ?? "",
      });
      setQuestion(0);
      setAnswer("");
      router.push("/interviews/session");
    } catch {
      setToast("Could not prepare questions. Check the local AI service.");
    }
  }
  async function submitInterview() {
    if (answer.trim().length < 8) return;
    const prompts = live.interview?.questions ?? [];
    const current = prompts[question % Math.max(1, prompts.length)];
    const prompt = current?.prompt ?? "Tell me about a project you're proud of and your specific contribution.";
    try {
      const evaluation = await live.evaluate(prompt, answer, targetRole, current?.id);
      const isLast = prompts.length > 0 && question >= prompts.length - 1;
      if (isLast) {
        const previous = (live.interview?.answers ?? []).map((item) => item.evaluation.overall);
        const scores = [...previous, evaluation.overall];
        const score = Math.round(scores.reduce((sum, value) => sum + value, 0) / Math.max(1, scores.length));
        demoService.saveInterview({ type: interviewType, score, date: new Date().toLocaleDateString("en-IN", { month: "short", day: "numeric" }) });
        setInterviews(demoService.getInterviews());
        await live.finishInterview(score, interviewType);
        router.push("/interviews/report");
      } else {
        setQuestion((value) => value + 1);
        setAnswer("");
        window.setTimeout(() => live.speak(prompts[question + 1]?.prompt ?? ""), 350);
      }
    } catch {
      setToast("Evaluation failed — check the local AI service");
    }
  }

  const filteredJobs = useMemo(() => jobs.filter((job) => (job.title + job.company + job.tags.join(" ")).toLowerCase().includes(jobQuery.toLowerCase()) && (jobType === "All types" || job.type === jobType)), [jobQuery, jobType]);
  const filteredCourses = useMemo(() => courses.filter((course) => courseFilter === "All" || course.price === courseFilter), [courseFilter]);
  const filteredCandidates = useMemo(() => candidates.filter((candidate) => (candidate.name + candidate.role + candidate.skills.join(" ")).toLowerCase().includes(query.toLowerCase()) && (skillFilter === "All roles" || candidate.role === skillFilter)), [query, skillFilter]);
  const activeJob = jobs.find((job) => job.id === selectedJob);
  const activeCandidate = candidates.find((candidate) => candidate.id === selectedCandidate);
  const roadmapPercent = Math.round(roadmap.filter((item) => item.done).length / Math.max(1, roadmap.length) * 100);
  const readiness = live.analysis?.readiness.score ?? null;
  const matchedSkillsLive = live.analysis?.matched_skills?.length ? live.analysis.matched_skills : skills.slice(0, 5);
  const partialSkillsLive = live.analysis?.partial_skills?.length ? live.analysis.partial_skills : partialSkills;
  const missingSkillsLive = live.analysis?.missing_skills?.length ? live.analysis.missing_skills : missingSkills;
  const jobCards = useMemo(() => {
    if (!live.jobs.length) return filteredJobs;
    const term = jobQuery.toLowerCase();
    return live.jobs
      .filter((job) => (job.title + job.company + job.required_skills.join(" ")).toLowerCase().includes(term) && (jobType === "All types" || (job.employment_type ?? "Full-time") === jobType))
      .map((job) => ({
        id: job.id,
        title: job.title,
        company: job.company,
        location: job.location ?? "Remote",
        salary: job.salary ?? "Not disclosed",
        type: job.employment_type ?? "Full-time",
        posted: job.posted ?? "Live role",
        tags: job.matched_skills.length ? job.matched_skills.slice(0, 4) : job.required_skills.slice(0, 4),
        match: Math.round(job.match_percent),
        description: job.description,
        semantic: job.semantic_similarity,
      }));
  }, [live.jobs, filteredJobs, jobQuery, jobType]);
  const activeJobCard = jobCards.find((job) => job.id === selectedJob) ?? activeJob;
  const activeJobDescription = (activeJobCard as { description?: string } | undefined)?.description ?? "Join a collaborative product team building accessible experiences for a growing customer base. You'll work closely with design, product, and platform partners to ship thoughtful features.";
  const interviewAnswers = live.interview?.answers ?? [];
  const latestEvaluation = interviewAnswers[interviewAnswers.length - 1]?.evaluation ?? null;
  const reportScore = interviewAnswers.length ? Math.round(interviewAnswers.reduce((sum, item) => sum + item.evaluation.overall, 0) / interviewAnswers.length) : (interviews[0]?.score ?? 78);
  const planFocus = live.roadmap?.weekly_focus ?? [];
  const planProject = live.roadmap?.projects?.[0];
  const courseCards = live.roadmap?.courses?.length
    ? live.roadmap.courses.map((course) => ({
        id: course.id,
        title: course.title,
        provider: course.provider,
        duration: `${course.duration_hours}h`,
        level: course.level,
        price: course.price,
        skill: course.skill,
        rating: "AI pick",
      }))
    : filteredCourses;

  if (mode === "dashboard") return <>
    <Heading eyebrow="Monday, November 9" title="Good morning, Alex 👋" detail="You’re building momentum. Here’s a quick look at your career journey." action={<Link href="/resume" className="inline-flex items-center gap-2 rounded-xl bg-[#7257df] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#6349ce]"><UploadCloud size={15} /> Update resume</Link>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Career readiness" value={readiness ? `${readiness}%` : "76%"} change={live.analysis ? "Live resume score" : "+8% this month"} icon={Target} tint="bg-[#f0edff] text-[#7158db]" /><Metric label="Skills discovered" value={`${live.analysis?.skill_names.length ?? 18}`} change={live.analysis ? "From your resume" : "3 new this month"} icon={Sparkles} tint="bg-[#edf8f2] text-[#478863]" /><Metric label="Skill match" value={live.analysis ? `${Math.round(live.analysis.weighted_match_percent)}%` : "84%"} change={live.analysis ? `vs ${live.analysis.target_role}` : "+5% this month"} icon={TrendingUp} tint="bg-[#eef4ff] text-[#5b7bc0]" /><Metric label="Learning progress" value={`${roadmapPercent}%`} change={live.roadmap ? "Qwen learning plan" : "On your way"} icon={GraduationCap} tint="bg-[#fff5e9] text-[#be8540]" /></div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_.8fr]"><Card className="p-5 sm:p-6"><CardTitle detail="Your readiness score is trending up">Career readiness</CardTitle><div className="h-[235px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={[{ week: "Oct 5", score: 53 }, { week: "Oct 12", score: 59 }, { week: "Oct 19", score: 58 }, { week: "Oct 26", score: 67 }, { week: "Nov 2", score: 72 }, { week: "Nov 9", score: 76 }]} margin={{ left: -22, right: 6, top: 10 }}><defs><linearGradient id="readiness-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={violet} stopOpacity={.2} /><stop offset="100%" stopColor={violet} stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke={chartGrid} vertical={false} /><XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: "#948da0", fontSize: 10 }} /><YAxis domain={[40, 100]} axisLine={false} tickLine={false} tick={{ fill: "#948da0", fontSize: 10 }} /><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #eeeaf4", fontSize: 12 }} /><Area type="monotone" dataKey="score" stroke={violet} strokeWidth={2.5} fill="url(#readiness-fill)" /></AreaChart></ResponsiveContainer></div></Card>
      <Card className="p-5 sm:p-6"><CardTitle detail="Your strongest foundations">Skills snapshot</CardTitle><div className="flex items-center gap-5"><div className="h-36 w-36 shrink-0"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={[{ name: "Strong", value: 8 }, { name: "Building", value: 5 }, { name: "To learn", value: 3 }]} innerRadius={46} outerRadius={64} paddingAngle={4} dataKey="value" stroke="none">{["#765de3", "#b5a7f5", "#e9e5f3"].map((color) => <Cell key={color} fill={color} />)}</Pie></PieChart></ResponsiveContainer><div className="-mt-[89px] text-center text-lg font-semibold">18<span className="block text-[9px] font-normal text-muted-foreground">skills</span></div></div><div className="space-y-3 text-xs">{[["Strong match", "8 skills", "bg-[#765de3]"], ["Building", "5 skills", "bg-[#b5a7f5]"], ["To learn", "3 skills", "bg-[#e9e5f3]"]].map(([label, value, dot]) => <div key={label} className="flex items-center gap-2"><span className={`size-2 rounded-full ${dot}`} /><span className="text-[#6f687e]">{label}</span><span className="ml-auto font-semibold">{value}</span></div>)}</div></div><Link href="/career" className="mt-5 flex items-center justify-between rounded-xl bg-[#f8f6ff] px-3.5 py-3 text-xs font-semibold text-[#6c53d1]">See your complete skill match <ArrowRight size={15} /></Link></Card></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_.75fr]"><Card className="p-5 sm:p-6"><CardTitle detail="Roles selected around your experience" action={<Link href="/jobs" className="text-xs font-semibold text-[#7257db]">See all jobs →</Link>}>Recommended jobs</CardTitle><div className="space-y-2">{jobCards.slice(0, 3).map((job) => <div key={job.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#f0edf5] p-3"><span className="grid size-10 place-items-center rounded-xl bg-[#f3f0ff] text-[#7257df]"><BriefcaseBusiness size={17} /></span><div className="min-w-[150px] flex-1"><p className="text-sm font-semibold">{job.title}</p><p className="mt-1 text-[11px] text-muted-foreground">{job.company} · {job.location}</p></div><Badge>{job.match}% match</Badge><Link href="/jobs" className="grid size-8 place-items-center rounded-lg text-[#847d92] hover:bg-[#f7f5fb]" aria-label={`View ${job.title}`}><ArrowRight size={15} /></Link></div>)}</div></Card>
      <Card className="p-5 sm:p-6"><CardTitle detail="Your week, at a glance" action={<span className="text-xs text-muted-foreground">This week</span>}>Learning progress</CardTitle><div className="flex items-center justify-between"><div><p className="text-3xl font-semibold">4.5<span className="ml-1 text-sm font-medium text-muted-foreground">hrs</span></p><p className="mt-1 text-xs text-[#8c8599]">of 6 hour weekly goal</p></div><div className="grid size-[76px] place-items-center rounded-full" style={{ background: "conic-gradient(#8a72ec 0 75%, #efedf5 75% 100%)" }}><span className="grid size-[58px] place-items-center rounded-full bg-white text-sm font-semibold">75%</span></div></div><Progress value={75} className="mt-5" /><Link href="/learn" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#7158d5]">Continue learning <ArrowRight size={14} /></Link></Card></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2"><Card className="p-5 sm:p-6"><CardTitle detail="Your latest practice sessions" action={<Link href="/interviews" className="text-xs font-semibold text-[#7257db]">Practice now →</Link>}>Interview history</CardTitle>{interviews.length ? <div className="space-y-3">{interviews.slice(0, 3).map((item, index) => <div key={`${item.date}-${index}`} className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#f4f1ff] text-[#755bdb]"><MessageSquareText size={16} /></span><div className="flex-1"><p className="text-xs font-semibold">{item.type}</p><p className="mt-1 text-[10px] text-muted-foreground">{item.date} · Demo report</p></div><Badge tone="green">{item.score}% score</Badge></div>)}</div> : <EmptyState title="Ready for a practice round?" detail="Your completed mock interviews will show up here." action={<Link href="/interviews" className="text-xs font-semibold text-[#7257db]">Choose an interview</Link>} />}</Card><Card className="p-5 sm:p-6"><CardTitle detail="A few things you’ve moved forward">Recent activity</CardTitle><div className="space-y-4">{activities.map((item) => <div className="flex items-center gap-3" key={item.text}><span className="grid size-9 place-items-center rounded-xl bg-[#f5f3f9] text-[#7661cf]">{item.icon === "resume" ? <FileText size={16} /> : item.icon === "course" ? <GraduationCap size={16} /> : <MessageSquareText size={16} />}</span><div className="flex-1"><p className="text-xs font-medium">{item.text}</p><p className="mt-1 text-[10px] text-muted-foreground">{item.time}</p></div><CheckCircle2 size={15} className="text-[#5aab7c]" /></div>)}</div></Card></div>
  </>;

  if (mode === "resume") return <>
    <Heading eyebrow="Resume intelligence" title="Your experience, in focus" detail="Add your resume to see its strengths and shape a clear, confident profile." />
    <Card className="p-5 sm:p-7"><div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); selectFile(e.dataTransfer.files[0]); }} className={`rounded-2xl border border-dashed p-8 text-center transition sm:p-12 ${dragging ? "border-[#8066e9] bg-[#f7f4ff]" : "border-[#dcd6ea] bg-[#fcfbfe]"}`}><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#f0edff] text-[#7358dc]"><CloudUpload size={25} /></span><h2 className="mt-4 text-base font-semibold">Drop your resume here</h2><p className="mt-1.5 text-xs text-muted-foreground">or choose a file from your device · PDF, DOCX, or TXT up to 10 MB</p><input ref={fileInput} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => selectFile(e.target.files?.[0])} /><Button className="mt-5" onClick={() => fileInput.current?.click()} disabled={Boolean(live.busy)}>{live.busy ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />} {live.busy ? "Analyzing locally…" : "Choose file"}</Button><p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-[#a09aab]"><Cpu size={12} /> PDF, DOCX, TXT · parsed by your local FastAPI service, never a paid API.</p></div>
      <AiNotice busy={live.busy} error={live.error} note={live.analysis ? `MiniLM + spaCy + skill taxonomy · ${live.analysis.inference.elapsed_ms} ms · ${live.analysis.skill_names.length} skills` : "Your file is parsed with PyMuPDF/python-docx, then analyzed by MiniLM and spaCy on this machine."} />
      {uploadName && <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#efedf4] p-3.5"><span className="grid size-10 place-items-center rounded-xl bg-[#f4f1ff] text-[#7158db]"><FileText size={17} /></span><div className="min-w-0 flex-1"><div className="flex justify-between gap-3 text-xs"><span className="truncate font-semibold">{uploadName}</span><span className="text-muted-foreground">{uploadDone ? "Ready" : `${Math.round(uploadProgress)}%`}</span></div><Progress value={uploadProgress} className="mt-2" /></div>{uploadDone && <CheckCircle2 size={18} className="text-[#43a371]" />}</div>}
    </Card>
    {(uploadDone || live.analysis) && <div className="mt-5 grid gap-4 xl:grid-cols-[.8fr_1.2fr]"><Card className="p-5"><CardTitle detail={live.analysis ? "Parsed from your uploaded file" : "Sample profile"}>Extracted information <Badge tone={live.analysis ? "green" : "gray"}>{live.analysis ? "Live" : "Sample"}</Badge></CardTitle><div className="space-y-3 text-xs"><div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Candidate</p><p className="mt-1 font-semibold">{live.analysis?.profile.name || "Alex Morgan"} · {live.analysis?.profile.headline || "Frontend Developer"}</p></div><div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Experience</p><p className="mt-1 font-semibold">{live.analysis ? `${live.analysis.experience.years > 0 ? `${live.analysis.experience.years}+ years` : "Experience detected"}${live.analysis.experience.titles[0] ? ` · ${live.analysis.experience.titles[0]}` : ""}` : "3+ years · Product engineering"}</p></div><div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Education</p><p className="mt-1 font-semibold">{live.analysis ? `${live.analysis.education.degrees[0] || "Education section detected"}${live.analysis.education.latest_year ? ` · ${live.analysis.education.latest_year}` : ""}` : "B.Tech, Computer Science · 2022"}</p></div><div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Projects</p><p className="mt-1 font-semibold">{live.analysis ? `${live.analysis.projects.count} project${live.analysis.projects.count === 1 ? "" : "s"} detected` : "Design system · Commerce dashboard"}</p></div></div><div className="mt-5"><p className="mb-2 text-xs font-semibold">Skills detected</p><div className="flex flex-wrap gap-2">{(live.analysis?.skills?.length ? live.analysis.skills.slice(0, 8).map((skill) => skill.display) : skills.slice(0, 6)).map((skill) => <SkillPill key={skill}>{skill}</SkillPill>)}</div></div><p className="mt-4 rounded-lg bg-[#faf8ff] p-3 text-[10px] leading-4 text-[#8a8298]">{live.analysis ? `Inference: ${live.analysis.inference.embedding_model} + ${live.analysis.inference.ner_model} · ${live.analysis.inference.skill_methods.alias_matches} alias and ${live.analysis.inference.skill_methods.semantic_matches} semantic skill matches. ${live.analysis.notices[0] ?? ""}` : "Upload a resume to replace this sample with a live local analysis."}</p></Card>
      <Card className="p-5"><div className="flex items-start justify-between"><CardTitle detail="Edit your summary and review the extracted profile">Resume preview</CardTitle><div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => setEditingResume((v) => !v)}>{editingResume ? "Done editing" : "Edit resume"}</Button><Button variant="ghost" size="sm" onClick={() => setToast("Resume export is a demo preview") }><Download size={14} /> Export</Button></div></div><div className="rounded-xl border border-[#eeeaf4] bg-[#fdfcff] p-5"><div className="border-b border-[#eeeaf4] pb-4"><p className="text-lg font-semibold">{live.analysis?.profile.name || "Alex Morgan"}</p><p className="mt-1 text-xs text-[#765cda]">{live.analysis?.profile.headline || "Frontend Developer"}</p><p className="mt-2 text-[10px] text-muted-foreground">{live.analysis?.profile.email || "alex.morgan@example.com"} · {live.analysis?.profile.location || "Bengaluru, India"}</p></div><div className="mt-4"><h3 className="text-xs font-bold uppercase tracking-wide">Professional summary</h3>{editingResume ? <textarea value={summary} onChange={(e) => setSummary(e.target.value)} className="input mt-2 min-h-24 text-xs leading-5" aria-label="Professional summary" /> : <p className="mt-2 text-xs leading-6 text-[#746d81]">{live.analysis?.profile.summary || summary}</p>}</div><div className="mt-4 grid gap-4 sm:grid-cols-2"><div><h3 className="text-xs font-bold uppercase tracking-wide">Experience</h3><p className="mt-2 text-xs font-semibold">{live.analysis?.experience.titles[0] ? `${live.analysis.experience.titles[0]}${live.analysis.experience.companies[0] ? ` · ${live.analysis.experience.companies[0]}` : ""}` : "Frontend Developer · Luma Labs"}</p><p className="mt-1 text-[10px] text-muted-foreground">{live.analysis?.experience.date_ranges[0] || "2023 — Present"}</p><p className="mt-2 text-xs leading-5 text-[#746d81]">{live.analysis?.experience.lines[0] || "Built reusable UI systems and improved performance across key product journeys."}</p></div><div><h3 className="text-xs font-bold uppercase tracking-wide">Education & projects</h3><p className="mt-2 text-xs font-semibold">{live.analysis?.education.degrees[0] || "B.Tech, Computer Science"}</p><p className="mt-1 text-[10px] text-muted-foreground">{live.analysis?.education.institutions[0] || "National Institute of Technology"}{live.analysis?.education.latest_year ? ` · ${live.analysis.education.latest_year}` : " · 2022"}</p><p className="mt-2 text-xs text-[#746d81]">{live.analysis?.projects.lines.slice(0, 2).join(" · ") || "Commerce dashboard · Component library"}</p></div></div></div></Card></div>}
  </>;

  if (mode === "career") return <>
    <Heading eyebrow="Career intelligence" title="Find your next skill advantage" detail="Compare your experience with a target role and focus on the skills that can make a difference." action={<LivePill live={Boolean(live.analysis)}>{live.analysis ? `Live · ${live.analysis.skill_names.length} skills` : "Upload a resume for live scores"}</LivePill>} />
    <Card className="p-5 sm:p-6"><div className="grid gap-4 md:grid-cols-[.7fr_1.3fr]"><label className="text-xs font-semibold">Target role<select value={targetRole} onChange={(e) => { setTargetRole(e.target.value); setAnalyzed(false); }} className="input mt-2 text-sm font-normal"><option>Software Engineer</option><option>Data Scientist</option><option>Machine Learning Engineer</option><option>AI Engineer</option><option>Frontend Developer</option><option>Backend Developer</option><option>Full Stack Developer</option><option>Cybersecurity Analyst</option><option>Data Analyst</option><option>Frontend Engineer</option><option>Product Engineer</option><option>UI Developer</option></select></label><label className="text-xs font-semibold">Job description <span className="font-normal text-muted-foreground">(optional)</span><textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} className="input mt-2 min-h-[44px] resize-y text-sm font-normal" placeholder="Paste a job description to add semantic similarity and targeted gaps..." /></label></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2">{matchedSkillsLive.slice(0, 3).map((skill) => <SkillPill key={skill}>{skill}</SkillPill>)}{partialSkillsLive.slice(0, 1).map((skill) => <SkillPill key={skill} tone="partial">{skill} · partial</SkillPill>)}</div><Button disabled={Boolean(live.busy)} onClick={async () => { try { await live.analyze(targetRole, jobDescription); setAnalyzed(true); setToast(`Live analysis ready for ${targetRole}`); } catch { setToast("Analysis failed — is the local AI service running?"); } }}>{live.busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {live.busy ? "Analyzing…" : "Analyze skill match"}</Button></div><AiNotice busy={live.busy} error={live.error} note={live.analysis ? `Target: ${live.analysis.target_role} · ${live.analysis.inference.embedding_model} · ${live.analysis.inference.elapsed_ms} ms` : undefined} /></Card>
    <div className="mt-4 grid gap-4 xl:grid-cols-[.85fr_1.15fr]"><Card className="p-5 sm:p-6"><CardTitle detail={`Your current profile against ${live.analysis?.target_role || targetRole}`}>Career readiness</CardTitle><div className="flex items-center gap-5"><div className="grid size-32 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#8066e9 0 ${readiness ?? (analyzed ? 79 : 76)}%, #eeeaf5 ${readiness ?? (analyzed ? 79 : 76)}% 100%)` }}><div className="grid size-[104px] place-items-center rounded-full bg-white text-center"><span className="text-3xl font-semibold">{readiness ?? (analyzed ? 79 : 76)}<span className="text-base">%</span><small className="mt-1 block text-[10px] font-normal text-muted-foreground">role readiness</small></span></div></div><div><Badge tone="green">{readiness && readiness >= 70 ? "Strong foundation" : "Building momentum"}</Badge><p className="mt-3 text-sm font-semibold">{live.analysis ? `${live.analysis.matched_skills.length} role skills already evidenced` : analyzed ? "Nice progress on your match" : "You’re off to a strong start"}</p><p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">{live.analysis ? live.analysis.readiness.explanation : "Build depth in 3 priority areas to strengthen your fit for this role."}</p></div></div><div className="mt-6 space-y-3">{[["Technical skills", live.analysis?.readiness.breakdown.skills ?? 82], ["Relevant experience", live.analysis?.readiness.breakdown.experience ?? 74], ["Resume quality", live.analysis?.readiness.breakdown.resume_quality ?? 61]].map(([label, value]) => <div key={label as string}><div className="mb-1.5 flex justify-between text-xs"><span>{label}</span><span className="font-semibold">{Math.round(Number(value))}%</span></div><Progress value={Number(value)} /></div>)}</div></Card>
      <Card className="p-5 sm:p-6"><CardTitle detail="A practical view of your current role alignment">Skills match overview</CardTitle><div className="h-[250px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={live.analysis?.skills?.length ? live.analysis.skills.slice(0, 5).map((skill) => ({ name: skill.display, value: Math.round(skill.confidence * 100) })) : [{ name: "React", value: 95 }, { name: "TypeScript", value: 88 }, { name: "Node.js", value: 72 }, { name: "GraphQL", value: 52 }, { name: "AWS", value: 34 }]} layout="vertical" margin={{ left: 8, right: 20 }}><CartesianGrid stroke={chartGrid} horizontal={false} /><XAxis type="number" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#958da1" }} /><YAxis type="category" dataKey="name" width={76} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#6f687e" }} /><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #eeeaf4", fontSize: 12 }} /><Bar dataKey="value" radius={[0, 6, 6, 0]}>{["#8066e9", "#8066e9", "#a18ef1", "#d4a552", "#e9a09a"].map((fill, i) => <Cell key={i} fill={fill} />)}</Bar></BarChart></ResponsiveContainer></div></Card></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-3"><Card className="p-5 lg:col-span-2"><CardTitle detail="Skills called for in your target role">Skill gap analysis</CardTitle><div className="grid gap-5 sm:grid-cols-3"><div><p className="mb-2 text-xs font-semibold">Strong matches</p><div className="flex flex-wrap gap-2">{matchedSkillsLive.slice(0, 6).map((skill) => <SkillPill key={skill}>{skill}</SkillPill>)}</div></div><div><p className="mb-2 text-xs font-semibold">Partial matches</p><div className="flex flex-wrap gap-2">{partialSkillsLive.slice(0, 6).map((skill) => <SkillPill key={skill} tone="partial">{skill}</SkillPill>)}</div></div><div><p className="mb-2 text-xs font-semibold">Priority to build</p><div className="flex flex-wrap gap-2">{missingSkillsLive.slice(0, 6).map((skill) => <SkillPill key={skill} tone="missing">{skill}</SkillPill>)}</div></div></div></Card><Card className="p-5"><CardTitle>Recommended next steps</CardTitle><div className="space-y-3 text-xs">{missingSkillsLive.slice(0, 2).map((skill, index) => <div key={skill} className="flex gap-2"><span className={`grid size-6 place-items-center rounded-lg ${index === 0 ? "bg-[#fff4e5] text-[#bd803b]" : "bg-[#f1edff] text-[#7258d8]"}`}>{index + 1}</span><span><b>Build evidence in {skill}</b><small className="mt-1 block text-muted-foreground">{index === 0 ? "High priority" : "Medium priority"} · one reviewable artifact</small></span></div>)}{missingSkillsLive.length === 0 && <p className="text-xs leading-5 text-muted-foreground">Upload a resume to surface role-specific gaps and a prioritized plan.</p>}</div><Link href="/learn" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#7158d5]">Open your roadmap <ArrowRight size={14} /></Link></Card></div>
  </>;

  if (mode === "learn") return <>
    <Heading eyebrow="Learning hub" title="Learning that moves you forward" detail="A personal plan built around your target role, your time, and the skills you want to grow." action={<div className="flex flex-wrap items-center gap-2"><LivePill live={Boolean(live.roadmap)}>{live.roadmap ? `Qwen plan · ${live.roadmap.items.length} steps` : `${roadmapPercent}% complete`}</LivePill><Button size="sm" variant="secondary" disabled={Boolean(live.busy)} onClick={async () => { try { const result = await live.buildRoadmap(targetRole); setToast(`Roadmap generated · ${result.items.length} steps · ${result.total_hours}h`); } catch { setToast("Roadmap generation failed — check the local AI service"); } }}>{live.busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {live.busy ? "Building plan…" : "Generate with AI"}</Button></div>} />
    <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]"><Card className="p-5 sm:p-6"><CardTitle detail="Your next best steps, one at a time" action={<span className="text-xs text-muted-foreground">{roadmap.filter((item) => item.done).length}/{roadmap.length} completed</span>}>Personalized roadmap</CardTitle><Progress value={roadmapPercent} className="mb-4" /><AiNotice busy={live.busy} error={live.error} note={live.roadmap ? `${live.roadmap.provider} · ${live.roadmap.total_hours}h total · ${live.roadmap.llm.used_llm ? "Qwen-enriched" : "deterministic fallback"}` : planFocus.length ? `Weekly focus: ${planFocus.join(" · ")}` : undefined} /><div className="space-y-2">{roadmap.map((step, index) => <button key={step.id} onClick={() => updateRoadmap(step.id)} className="flex w-full items-center gap-3 rounded-xl border border-[#efedf4] p-3 text-left hover:bg-[#fcfbff]"><span className={`grid size-8 shrink-0 place-items-center rounded-full ${step.done ? "bg-[#e9f7ee] text-[#409365]" : "bg-[#f2efff] text-[#765de0]"}`}>{step.done ? <Check size={15} /> : <span className="text-xs font-semibold">{index + 1}</span>}</span><span className="min-w-0 flex-1"><span className={`block text-xs font-semibold ${step.done ? "text-[#8a8498] line-through" : ""}`}>{step.title}</span><span className="mt-1 block text-[10px] text-muted-foreground">{step.detail}</span></span><ChevronRight size={15} className="text-[#aaa3b3]" /></button>)}</div></Card>
      <Card className="p-5 sm:p-6"><CardTitle detail="A realistic rhythm creates progress" action={<Badge>Week 3</Badge>}>Weekly goals</CardTitle><div className="flex items-center justify-between rounded-xl bg-[#faf9fd] p-4"><div><p className="text-2xl font-semibold">4.5 <span className="text-xs font-medium text-muted-foreground">/ {weeklyGoal} hours</span></p><p className="mt-1 text-[10px] text-muted-foreground">You’re right on track</p></div><div className="grid size-14 place-items-center rounded-full" style={{ background: `conic-gradient(#8066e9 0 ${Math.min(100, 450 / weeklyGoal)}%, #eeeaf5 ${Math.min(100, 450 / weeklyGoal)}% 100%)` }}><span className="grid size-10 place-items-center rounded-full bg-white text-[10px] font-semibold">{Math.min(100, Math.round(450 / weeklyGoal))}%</span></div></div><div className="mt-5 space-y-3">{[["Courses", "2.5 h", true], ["Hands-on project", "1.5 h", true], ["Interview practice", "0.5 h", false]].map(([name, duration, complete]) => <div key={name as string} className="flex items-center gap-2 text-xs"><span className={`grid size-5 place-items-center rounded-full ${complete ? "bg-[#eaf7ef] text-[#4f9d6b]" : "bg-[#f2eff7] text-[#8e879c]"}`}>{complete ? <Check size={12} /> : <Clock3 size={11} />}</span><span>{name as string}</span><span className="ml-auto text-muted-foreground">{duration as string}</span></div>)}</div>{goalEditing && <label className="mt-4 block text-xs font-semibold">Weekly hour target<input type="number" min="1" max="40" value={weeklyGoal} onChange={(e) => setWeeklyGoal(Math.max(1, Number(e.target.value) || 1))} className="input mt-2 text-sm font-normal" /></label>}<Button variant="secondary" className="mt-5 w-full" onClick={() => { setGoalEditing((value) => !value); if (goalEditing) setToast("Weekly goal saved in this session"); }}>{goalEditing ? "Save weekly goal" : "Edit weekly goal"}</Button></Card></div>
    <Card className="mt-4 p-5 sm:p-6"><div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><CardTitle detail="Curated examples for the skills you’re building">Recommended courses</CardTitle><div className="flex gap-2">{["All", "Free", "Paid"].map((filter) => <button key={filter} onClick={() => setCourseFilter(filter)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${courseFilter === filter ? "bg-[#7257df] text-white" : "border border-[#eeeaf4] bg-white text-[#777187] hover:bg-[#f9f7fd]"}`}>{filter}</button>)}</div></div><div className="grid gap-3 md:grid-cols-2">{courseCards.map((course) => <div key={course.id} className="flex gap-3 rounded-xl border border-[#efedf4] p-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f3f0ff] text-[#7359dc]"><GraduationCap size={18} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-xs font-semibold">{course.title}</h3><Badge tone={course.price === "Free" ? "green" : "amber"}>{course.price}</Badge></div><p className="mt-1 text-[10px] text-muted-foreground">{course.provider} · {course.duration} · {course.level}</p><div className="mt-3 flex items-center justify-between"><span className="text-[10px] text-[#81798f]">For {course.skill} <span className="ml-2 text-[#b18038]">★ {course.rating}</span></span><button className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#7157d8]" onClick={() => addRoadmapStep(`course-${course.id}`, `Complete ${course.title}`, `${course.provider} · ${course.duration} · ${course.skill}`)}>Add to plan <Plus size={12} /></button></div></div></div>)}{courseCards.length === 0 && <EmptyState title="No courses in this filter" detail="Try another price filter to see more options." />}</div></Card>
    <div className="mt-4 grid gap-4 md:grid-cols-2"><Card className="p-5"><CardTitle detail="Try a quick knowledge check" action={<Badge>2 min</Badge>}>Mini quiz · System design</CardTitle>{!quizOpen ? <div className="flex items-center justify-between gap-4"><p className="text-xs leading-5 text-[#817b90]">What is the primary benefit of using a load balancer?</p><Button size="sm" onClick={() => { setQuizOpen(true); setQuizChecked(false); setQuizChoice(null); }}>Start quiz <ArrowRight size={14} /></Button></div> : <><p className="text-xs font-medium">What is the primary benefit of using a load balancer?</p><div className="mt-3 grid gap-2">{["Encrypting all database records", "Distributing traffic across multiple servers", "Replacing a cache", "Managing user sessions only"].map((choice, index) => <button key={choice} onClick={() => !quizChecked && setQuizChoice(index)} className={`rounded-lg border px-3 py-2 text-left text-xs ${quizChoice === index ? "border-[#917bec] bg-[#f6f3ff]" : "border-[#eeeaf4] hover:bg-[#fcfbff]"}`}>{choice}{quizChecked && index === 1 && <Check size={13} className="float-right text-[#48a16f]" />}</button>)}</div><div className="mt-3 flex items-center justify-between"><span className="text-[10px] text-muted-foreground">{quizChecked ? (quizChoice === 1 ? "Correct — traffic is shared across healthy servers." : "Answer: distribute traffic across multiple servers.") : "Choose one answer"}</span><Button size="sm" disabled={quizChoice === null} onClick={() => { if (quizChecked) { setQuizChecked(false); setQuizChoice(null); } else setQuizChecked(true); }}>{quizChecked ? "Try another" : "Check answer"}</Button></div></>}</Card><Card className="p-5"><CardTitle detail="Practice by applying what you’ve learned">Project recommendation</CardTitle><div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fff5e9] text-[#bf8540]"><Lightbulb size={18} /></span><div><p className="text-xs font-semibold">{planProject?.title || "Deploy a containerized API"}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{planProject?.description || "Build a small REST service, package it with Docker, and deploy it to a cloud free tier."}</p><button className="mt-3 text-xs font-semibold text-[#7158d5]" onClick={() => addRoadmapStep("project-container-api", planProject?.title || "Deploy a containerized API", `${planProject?.difficulty || "Intermediate"} portfolio project · ${planProject?.estimated_hours || "2–3"} hours`)}>Add project to roadmap →</button></div></div></Card></div>
  </>;

  if (mode === "interviews") return <>
    <Heading eyebrow="Interview practice" title="Practice showing what you know" detail="Questions are generated by Qwen on this machine; each answer gets a transparent rubric score plus MiniLM relevance." action={<LivePill live={Boolean(live.modelStatus?.ollama.reachable)}>{live.modelStatus?.ollama.reachable ? "Qwen online" : "Qwen fallback ready"}</LivePill>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      ["Technical interview", "Practice role-specific technical questions.", "20–25 min", "bg-[#f0edff] text-[#7258db]", Target], ["HR interview", "Rehearse common recruiter conversations.", "15 min", "bg-[#edf7f2] text-[#3c8b64]", Users], ["Behavioural interview", "Structure clear stories about your work.", "15–20 min", "bg-[#fff4e8] text-[#b97b39]", MessageSquareText], ["Resume-based interview", "Explore questions inspired by your profile.", "20 min", "bg-[#eef4ff] text-[#5b7bc0]", FileText],
    ].map(([title, description, duration, tint, Icon]) => { const IconComponent = Icon as typeof Target; return <Card key={title as string} className="p-5"><span className={`grid size-10 place-items-center rounded-xl ${tint as string}`}><IconComponent size={19} /></span><h2 className="mt-4 text-sm font-semibold">{title as string}</h2><p className="mt-2 min-h-[38px] text-xs leading-5 text-muted-foreground">{description as string}</p><div className="mt-4 flex items-center justify-between border-t border-[#f0edf5] pt-3"><span className="text-[10px] text-muted-foreground">{duration as string}</span><button disabled={Boolean(live.busy)} onClick={() => startInterview(title as string)} className="inline-flex items-center gap-1 text-xs font-semibold text-[#7056d5] disabled:opacity-50">{live.busy ? <><Loader2 size={13} className="animate-spin" /> Preparing…</> : <>Start practice <ArrowRight size={14} /></>}</button></div></Card>; })}</div>
    <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_.8fr]"><Card className="p-5 sm:p-6"><CardTitle detail="Your latest practice and progress">Interview history</CardTitle>{interviews.length ? <div className="overflow-x-auto"><table className="w-full min-w-[470px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wide text-[#9b94a8]"><tr><th className="pb-3 font-medium">Interview</th><th className="pb-3 font-medium">Date</th><th className="pb-3 font-medium">Score</th><th className="pb-3 font-medium">Report</th></tr></thead><tbody>{interviews.map((item, i) => <tr key={`${item.date}-${i}`} className="border-t border-[#f1eef5]"><td className="py-3 font-semibold">{item.type}</td><td className="py-3 text-muted-foreground">{item.date}</td><td className="py-3"><Badge tone="green">{item.score}%</Badge></td><td className="py-3"><Link href="/interviews/report" className="font-semibold text-[#7158d5]">View report</Link></td></tr>)}</tbody></table></div> : <EmptyState title="Your practice history starts here" detail="Finish a mock interview to see your reports and score history." />}</Card><Card className="p-5 sm:p-6"><CardTitle detail="Small, consistent practice helps">Practice streak</CardTitle><div className="flex items-center gap-4"><div className="grid size-16 place-items-center rounded-2xl bg-[#fff5e8] text-2xl">🔥</div><div><p className="text-2xl font-semibold">{interviews.length ? "1 day" : "0 days"}</p><p className="mt-1 text-xs text-muted-foreground">Keep your confidence growing</p></div></div><Button variant="secondary" className="mt-5 w-full" onClick={() => startInterview("Behavioural interview")}>Practice a story <ArrowRight size={14} /></Button></Card></div>
  </>;

  if (mode === "session") {
    const fallbackPrompts = ["Tell me about a project you’re proud of. What was your contribution?", "How do you approach making a web interface accessible?", "Describe a time you had to learn a new tool quickly."];
    const prompts = live.interview?.questions?.length ? live.interview.questions.map((item) => item.prompt) : fallbackPrompts;
    const prompt = prompts[question % Math.max(1, prompts.length)];
    const activeQuestion = live.interview?.questions?.[question % Math.max(1, live.interview.questions.length)];
    return <><div className="mb-5"><Link href="/interviews" className="inline-flex items-center gap-1 text-xs font-semibold text-[#7158d5]"><ChevronLeft size={15} /> All interview types</Link><Heading eyebrow={live.interview ? `Live session · ${live.interview.provider || "local coach"}` : "Practice session"} title={interviewType} detail="Take a moment to think, speak or type your answer, then submit it for rubric scoring." /></div><div className="mx-auto grid max-w-4xl gap-4 lg:grid-cols-[1.2fr_.8fr]"><Card className="p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-2"><Badge>Question {question + 1} of {prompts.length}</Badge><div className="flex items-center gap-2"><button onClick={() => live.speak(prompt)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#eeeaf4] px-2.5 py-1.5 text-[10px] font-semibold text-[#746d85] hover:bg-[#faf9fd]"><Volume2 size={13} /> Listen</button><span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 size={14} /> Practice at your pace</span></div></div><h2 className="mt-7 text-xl font-semibold leading-8 tracking-tight">{prompt}</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">{activeQuestion?.topic ? `${activeQuestion.topic} · ` : ""}Use a specific example. You can edit your response before you submit.</p><AiNotice busy={live.busy} error={live.error} /><textarea value={answer} onChange={(e) => setAnswer(e.target.value)} className="input mt-5 min-h-48 resize-y text-sm leading-6" placeholder="Type your answer here..." aria-label="Interview answer" /><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="text-[10px] text-muted-foreground">{answer.trim().split(/\s+/).filter(Boolean).length} words · scored locally, never a hiring decision</span><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { live.stopSpeaking(); if (live.listening) { live.stopListening(); } else { live.startListening(setAnswer); } }}>{live.listening ? <><Square size={13} /> Stop mic</> : <><Mic size={14} /> Speak answer</>}</Button><Button variant="secondary" onClick={() => { setAnswer(""); setQuestion((value) => (value + 1) % Math.max(1, prompts.length)); live.speak(prompts[(question + 1) % Math.max(1, prompts.length)] ?? ""); }}>Skip <ChevronRight size={14} /></Button><Button disabled={answer.trim().length < 8 || Boolean(live.busy)} onClick={submitInterview}>{live.busy ? <><Loader2 size={14} className="animate-spin" /> Scoring…</> : <>Submit answer <Send size={14} /></>}</Button></div></div>{!live.voiceSupported && <p className="mt-2 flex items-center gap-1.5 text-[10px] text-[#9b94a8]"><MicOff size={12} /> Voice capture needs Chrome or Edge; typing always works.</p>}</Card><Card className="h-fit p-5"><CardTitle detail="A simple structure can keep your answer clear">Quick tip</CardTitle><div className="space-y-3">{[["Situation", "Set the scene briefly."], ["Action", "Share what you specifically did."], ["Result", "Explain what changed or what you learned."]].map(([label, detail]) => <div key={label} className="flex gap-2.5"><span className="grid size-6 shrink-0 place-items-center rounded-lg bg-[#f1edff] text-[10px] font-semibold text-[#7258d8]">{label[0]}</span><span className="text-xs"><b>{label}</b><small className="mt-1 block text-muted-foreground">{detail}</small></span></div>)}</div><div className="mt-5 rounded-xl bg-[#faf8ff] p-3 text-[10px] leading-5 text-[#8a8298]">Prompts come from your local Qwen model. Scores use a transparent rubric plus MiniLM relevance — coaching feedback, not a hiring decision.</div></Card></div></>;
  }

  if (mode === "report") {
    const report = interviews[0] ?? { type: interviewType, score: 78, date: "Today" };
    return <><Heading eyebrow={latestEvaluation ? "Live practice report" : "Practice report · Sample"} title={latestEvaluation ? "Here’s how that answer landed" : "Nice work showing up"} detail={latestEvaluation ? "Scores come from a transparent rubric, MiniLM relevance, and optional Qwen coaching." : "Complete a live interview to replace this sample report with real feedback."} action={<Link href="/interviews" className="inline-flex items-center gap-2 rounded-xl border border-[#e8e4ef] bg-white px-4 py-2.5 text-xs font-semibold hover:bg-[#faf9fc]">Back to interviews</Link>} /><div className="grid gap-4 lg:grid-cols-[.75fr_1.25fr]"><Card className="p-6 text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#f0edff] text-[#7258dc]"><Award size={25} /></span><p className="mt-4 text-xs font-medium text-muted-foreground">Overall practice score</p><p className="mt-2 text-5xl font-semibold tracking-tight">{reportScore}<span className="text-2xl text-muted-foreground">%</span></p><Badge tone="green">{reportScore >= 80 ? "Strong answer" : reportScore >= 65 ? "Good momentum" : "Keep building"}</Badge><p className="mt-4 text-xs text-muted-foreground">{live.interview?.type || report.type} · {interviewAnswers.length ? `${interviewAnswers.length} answer${interviewAnswers.length === 1 ? "" : "s"} scored live` : report.date}</p></Card><Card className="p-5 sm:p-6"><CardTitle detail="A quick reflection for your next practice round">Feedback snapshot</CardTitle><div className="grid gap-3 sm:grid-cols-2">{latestEvaluation ? <>{latestEvaluation.strengths.slice(0, 2).map((body, index) => <div key={`strength-${index}`} className="rounded-xl border border-[#e7f2ea] bg-[#fbfefc] p-4"><div className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-[#eaf7ef] text-[#47976a]"><Check size={13} /></span><p className="text-xs font-semibold">Strength {index + 1}</p></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{body}</p></div>)}{latestEvaluation.improvements.slice(0, 2).map((body, index) => <div key={`improve-${index}`} className="rounded-xl border border-[#f6ead8] bg-[#fffdf9] p-4"><div className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-[#fff5e7] text-[#b27b39]"><Lightbulb size={13} /></span><p className="text-xs font-semibold">Next step {index + 1}</p></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{body}</p></div>)}</> : [["Clear examples", "You used a relevant example to explain your experience.", "green"], ["Good structure", "Your answer followed a beginning, action, and outcome.", "green"], ["Add more detail", "Explain a specific decision you made along the way.", "amber"], ["Quantify impact", "A clear result can help your story stay memorable.", "amber"]].map(([title, body, tone]) => <div key={title} className="rounded-xl border border-[#efedf4] p-4"><div className="flex items-center gap-2"><span className={`grid size-6 place-items-center rounded-full ${tone === "green" ? "bg-[#eaf7ef] text-[#47976a]" : "bg-[#fff5e7] text-[#b27b39]"}`}>{tone === "green" ? <Check size={13} /> : <Lightbulb size={13} />}</span><p className="text-xs font-semibold">{title}</p></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{body}</p></div>)}</div>{latestEvaluation && <div className="mt-4 grid gap-2 sm:grid-cols-4">{Object.entries(latestEvaluation.dimensions).slice(0, 4).map(([label, value]) => <div key={label} className="rounded-lg bg-[#faf9fd] p-2.5"><div className="flex justify-between text-[10px]"><span className="capitalize text-[#7d768c]">{label}</span><b>{Math.round(value)}%</b></div><Progress value={value} className="mt-1.5" /></div>)}</div>}<p className="mt-4 text-[10px] leading-5 text-[#948da0]">{latestEvaluation ? `${latestEvaluation.rubric} · ${latestEvaluation.method} · ${latestEvaluation.word_count} words` : "Sample feedback. Complete a live session to see rubric scores and model-backed coaching."}</p></Card></div><Card className="mt-4 p-5"><CardTitle detail="Keep building confidence through practice">Recommended next</CardTitle><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#f3f0ff] text-[#7258db]"><MessageSquareText size={17} /></span><div><p className="text-xs font-semibold">Try a behavioural interview next</p><p className="mt-1 text-[10px] text-muted-foreground">Practice a clear story using the STAR framework.</p></div></div><Button onClick={() => startInterview("Behavioural interview")}>Practice again <ArrowRight size={14} /></Button></div></Card></>;
  }

  if (mode === "jobs") return <>
    <Heading eyebrow="Explore opportunities" title="Find a role that fits your next step" detail="Roles are scored by skill coverage and MiniLM semantic similarity — every match shows its reasoning." action={<LivePill live={Boolean(live.jobs.length)}>{live.jobs.length ? `${live.jobs.length} live matches` : "Run a live match"}</LivePill>} />
    <Card className="mb-4 p-4"><div className="flex flex-col gap-3 sm:flex-row"><label className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9690a1]" /><input className="input pl-9 text-sm" value={jobQuery} onChange={(e) => setJobQuery(e.target.value)} placeholder="Search job titles, companies, or skills" aria-label="Search jobs" /></label><label className="relative"><Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#958da0]" /><select value={jobType} onChange={(e) => setJobType(e.target.value)} className="input w-full pl-9 text-sm sm:w-44" aria-label="Filter by job type"><option>All types</option><option>Full-time</option><option>Contract</option></select></label><Button variant="secondary" disabled={Boolean(live.busy)} onClick={async () => { try { const result = await live.loadJobs(); setToast(`Scored ${result.jobs.length} roles with your resume`); } catch { setToast("Job matching failed — check the local AI service"); } }}>{live.busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {live.busy ? "Scoring…" : "Match my resume"}</Button></div><AiNotice busy={live.busy} error={live.error} note={live.jobs.length ? live.jobs[0]?.explainability.method.replaceAll("_", " ") : undefined} /></Card>
    <div className="grid gap-3 lg:grid-cols-2">{jobCards.map((job) => <Card key={job.id} className="p-5"><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f3f0ff] text-[#7259dc]"><BriefcaseBusiness size={20} /></span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><h2 className="text-sm font-semibold">{job.title}</h2><p className="mt-1 text-xs text-muted-foreground">{job.company}</p></div><Badge>{job.match}% match</Badge></div><p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[#847d91]"><span className="inline-flex items-center gap-1"><MapPin size={12} />{job.location}</span><span>{job.salary}</span><span>{job.type}</span><span>{job.posted}</span></p><div className="mt-3 flex flex-wrap gap-1.5">{job.tags.map((tag) => <SkillPill key={tag}>{tag}</SkillPill>)}</div><div className="mt-4 flex items-center gap-2 border-t border-[#f1eef5] pt-3"><Button size="sm" onClick={() => setSelectedJob(job.id)}>View details</Button><Button variant="secondary" size="sm" onClick={() => apply(job.id)} disabled={Boolean(applications[job.id])}>{applications[job.id] ? <><Check size={14} /> Applied</> : "Quick apply"}</Button><button aria-label={savedJobs.includes(job.id) ? "Unsave job" : "Save job"} onClick={() => toggleSave(job.id)} className={`ml-auto grid size-9 place-items-center rounded-lg ${savedJobs.includes(job.id) ? "bg-[#f0edff] text-[#7056d4]" : "text-[#918a9e] hover:bg-[#f7f5fb]"}`}><Bookmark size={16} fill={savedJobs.includes(job.id) ? "currentColor" : "none"} /></button></div></div></div></Card>)}{jobCards.length === 0 && <div className="lg:col-span-2"><EmptyState title="No roles match this search" detail="Try a different title, skill, or job type." action={<button onClick={() => { setJobQuery(""); setJobType("All types"); }} className="text-xs font-semibold text-[#7158d5]">Clear filters</button>} /></div>}</div>
    {activeJobCard && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#211b35]/35 p-0 sm:items-center sm:p-5" onClick={() => setSelectedJob(null)}><section role="dialog" aria-modal="true" aria-label={`${activeJobCard.title} details`} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"><div className="flex items-start justify-between"><div><Badge>{activeJobCard.match}% skill match</Badge><h2 className="mt-3 text-xl font-semibold">{activeJobCard.title}</h2><p className="mt-1 text-sm text-muted-foreground">{activeJobCard.company}</p></div><button aria-label="Close job details" onClick={() => setSelectedJob(null)} className="grid size-9 place-items-center rounded-lg hover:bg-[#f5f3f9]"><X size={17} /></button></div><p className="mt-5 text-sm leading-6 text-[#716a80]">{activeJobDescription}</p><div className="mt-4 flex flex-wrap gap-2">{activeJobCard.tags.map((tag) => <SkillPill key={tag}>{tag}</SkillPill>)}</div><div className="mt-5 rounded-xl bg-[#faf9fd] p-4 text-xs text-muted-foreground"><p><b className="text-[#443d56]">Location:</b> {activeJobCard.location}</p><p className="mt-2"><b className="text-[#443d56]">Compensation:</b> {activeJobCard.salary}</p><p className="mt-2"><b className="text-[#443d56]">Type:</b> {activeJobCard.type}</p></div><div className="mt-5 flex gap-2"><Button className="flex-1" onClick={() => apply(activeJobCard.id)} disabled={Boolean(applications[activeJobCard.id])}>{applications[activeJobCard.id] ? "Application tracked" : "Track application"}</Button><Button variant="secondary" onClick={() => toggleSave(activeJobCard.id)}><Bookmark size={15} fill={savedJobs.includes(activeJobCard.id) ? "currentColor" : "none"} />{savedJobs.includes(activeJobCard.id) ? "Saved" : "Save"}</Button></div><p className="mt-3 text-center text-[10px] text-muted-foreground">Match scores are coaching signals, not a hiring probability. Applications are stored in your local database.</p></section></div>}
  </>;

  if (mode === "applications") {
    const applied = jobCards.filter((job) => applications[job.id]);
    const saved = jobCards.filter((job) => savedJobs.includes(job.id));
    return <><Heading eyebrow="Your job search" title="Applications & saved roles" detail="Saved roles and applications persist in your local SkillBridge database." action={<LivePill live={applied.length + saved.length > 0}>Synced locally</LivePill>} /><div className="grid gap-4 xl:grid-cols-2"><Card className="p-5 sm:p-6"><CardTitle detail={`${applied.length} application${applied.length === 1 ? "" : "s"} tracked`}>Application tracking</CardTitle>{applied.length ? <div className="space-y-2">{applied.map((job) => <div key={job.id} className="flex items-center gap-3 rounded-xl border border-[#efedf4] p-3"><span className="grid size-9 place-items-center rounded-lg bg-[#f2efff] text-[#745cda]"><BriefcaseBusiness size={16} /></span><div className="flex-1"><p className="text-xs font-semibold">{job.title}</p><p className="mt-1 text-[10px] text-muted-foreground">{job.company} · Applied just now</p></div><Badge tone="green">{applications[job.id]}</Badge></div>)}</div> : <EmptyState title="No applications yet" detail="Explore roles that match your profile and track your first application." action={<Link href="/jobs" className="text-xs font-semibold text-[#7257df]">Explore jobs →</Link>} />}</Card><Card className="p-5 sm:p-6"><CardTitle detail={`${saved.length} roles saved for later`}>Saved jobs</CardTitle>{saved.length ? <div className="space-y-2">{saved.map((job) => <div key={job.id} className="flex items-center gap-3 rounded-xl border border-[#efedf4] p-3"><span className="grid size-9 place-items-center rounded-lg bg-[#f2efff] text-[#745cda]"><Bookmark size={16} /></span><div className="flex-1"><p className="text-xs font-semibold">{job.title}</p><p className="mt-1 text-[10px] text-muted-foreground">{job.company} · {job.location}</p></div><button aria-label={`Remove ${job.title}`} onClick={() => toggleSave(job.id)} className="grid size-8 place-items-center rounded-lg text-[#918a9e] hover:bg-[#f6f4fa]"><X size={15} /></button><Link href="/jobs" className="text-xs font-semibold text-[#7158d5]">View</Link></div>)}</div> : <EmptyState title="Save roles that catch your eye" detail="Use the bookmark on a role to keep it handy here." action={<Link href="/jobs" className="text-xs font-semibold text-[#7257df]">Browse roles →</Link>} />}</Card></div></>;
  }

  if (mode === "recruiter") return <>
    <Heading eyebrow="Recruiter workspace" title="A clearer view of your hiring" detail="Track example roles, discover sample candidates, and keep your pipeline moving." action={<Button onClick={() => router.push("/recruiter/jobs?create=1")}><Plus size={15} /> Create a job</Button>} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Active roles" value={`${publishedJobs.length}`} change="2 recently posted" icon={BriefcaseBusiness} tint="bg-[#f0edff] text-[#7158db]" /><Metric label="Candidates" value="128" change="+18 this week" icon={Users} tint="bg-[#edf8f2] text-[#478863]" /><Metric label="In shortlist" value={`${shortlisted.length + 12}`} change="Across open roles" icon={Bookmark} tint="bg-[#eef4ff] text-[#5b7bc0]" /><Metric label="Time to shortlist" value="4.2 d" change="↓ 1.1 days" icon={Clock3} tint="bg-[#fff5e9] text-[#be8540]" /></div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[1.3fr_.7fr]"><Card className="p-5 sm:p-6"><CardTitle detail="Example candidate activity over the last 6 weeks">Hiring activity</CardTitle><div className="h-[245px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={[{ week: "Sep 29", viewed: 16, applied: 9 }, { week: "Oct 6", viewed: 23, applied: 14 }, { week: "Oct 13", viewed: 20, applied: 12 }, { week: "Oct 20", viewed: 32, applied: 18 }, { week: "Oct 27", viewed: 38, applied: 23 }, { week: "Nov 3", viewed: 44, applied: 28 }]} margin={{ left: -18, right: 8, top: 8 }}><CartesianGrid stroke={chartGrid} vertical={false} /><XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: "#948da0", fontSize: 10 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "#948da0", fontSize: 10 }} /><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #eeeaf4", fontSize: 12 }} /><Area dataKey="viewed" type="monotone" stroke="#8066e9" fill="#8066e920" strokeWidth={2} /><Area dataKey="applied" type="monotone" stroke="#55a779" fill="#55a77914" strokeWidth={2} /></AreaChart></ResponsiveContainer></div><div className="mt-2 flex gap-5 text-[10px] text-muted-foreground"><span><i className="mr-1.5 inline-block size-2 rounded-full bg-[#8066e9]" />Profile views</span><span><i className="mr-1.5 inline-block size-2 rounded-full bg-[#55a779]" />Applications</span></div></Card><Card className="p-5 sm:p-6"><CardTitle detail="Where candidates are in your process">Pipeline overview</CardTitle><div className="space-y-4">{[["New applicants", 42, "#8e77ee"], ["Reviewing", 28, "#b09ff3"], ["Shortlisted", 16, "#70b58e"], ["Interview", 8, "#e1ae62"]].map(([name, count, color]) => <div key={name as string}><div className="mb-1.5 flex justify-between text-xs"><span>{name}</span><b>{count}</b></div><div className="h-2 rounded-full bg-[#f0edf5]"><div className="h-full rounded-full" style={{ width: `${Number(count) * 1.8}%`, backgroundColor: color as string }} /></div></div>)}</div><Link href="/recruiter/pipeline" className="mt-6 inline-flex items-center gap-1 text-xs font-semibold text-[#7158d5]">Open pipeline <ArrowRight size={14} /></Link></Card></div>
    <Card className="mt-4 p-5 sm:p-6"><CardTitle detail="Strong potential matches for your open roles" action={<Link href="/recruiter/candidates" className="text-xs font-semibold text-[#7257db]">Browse candidates →</Link>}>Recommended candidates</CardTitle><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wide text-[#9992a6]"><tr><th className="pb-3 font-medium">Candidate</th><th className="pb-3 font-medium">Role</th><th className="pb-3 font-medium">Experience</th><th className="pb-3 font-medium">Match</th><th className="pb-3 font-medium">Action</th></tr></thead><tbody>{candidates.slice(0, 3).map((candidate) => <tr key={candidate.id} className="border-t border-[#f0edf5]"><td className="py-3"><div className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-full bg-[#eeeaff] text-[10px] font-bold text-[#6e54d5]">{candidate.name.split(" ").map((part) => part[0]).join("")}</span><span className="font-semibold">{candidate.name}</span></div></td><td className="py-3">{candidate.role}</td><td className="py-3 text-muted-foreground">{candidate.experience}</td><td className="py-3"><Badge tone="green">{candidate.match}%</Badge></td><td className="py-3"><button onClick={() => setSelectedCandidate(candidate.id)} className="font-semibold text-[#7158d5]">View profile</button></td></tr>)}</tbody></table></div></Card>
  </>;

  if (mode === "recruiterJobs") return <>
    <Heading eyebrow="Recruiter workspace" title="Manage your open roles" detail="Create and manage the example roles you’re hiring for." action={<Button onClick={() => setJobFormOpen((v) => !v)}><Plus size={15} /> New job</Button>} />
    {jobFormOpen && <Card className="mb-4 p-5"><CardTitle detail="Add a role to your demo workspace" action={<button aria-label="Close create job form" onClick={() => setJobFormOpen(false)}><X size={17} /></button>}>Create a job</CardTitle><form onSubmit={(e) => { e.preventDefault(); if (!companyJobForm.title.trim()) { setToast("Add a job title first"); return; } setPublishedJobs((v) => [companyJobForm.title.trim(), ...v]); setCompanyJobForm({ title: "", location: "", type: "Full-time" }); setJobFormOpen(false); setToast("Demo job created"); }} className="grid gap-3 sm:grid-cols-4"><input className="input text-sm sm:col-span-2" placeholder="Job title" value={companyJobForm.title} onChange={(e) => setCompanyJobForm((v) => ({ ...v, title: e.target.value }))} required /><input className="input text-sm" placeholder="Location" value={companyJobForm.location} onChange={(e) => setCompanyJobForm((v) => ({ ...v, location: e.target.value }))} /><select className="input text-sm" value={companyJobForm.type} onChange={(e) => setCompanyJobForm((v) => ({ ...v, type: e.target.value }))}><option>Full-time</option><option>Contract</option><option>Internship</option></select><Button className="sm:col-start-4" type="submit">Publish demo job</Button></form></Card>}
    <div className="grid gap-3">{publishedJobs.map((title, index) => <Card key={`${title}-${index}`} className="flex flex-wrap items-center gap-4 p-4"><span className="grid size-11 place-items-center rounded-xl bg-[#f2efff] text-[#7258d9]"><BriefcaseBusiness size={19} /></span><div className="min-w-[160px] flex-1"><div className="flex items-center gap-2"><h2 className="text-sm font-semibold">{title}</h2><Badge tone="green">Published</Badge></div><p className="mt-1 text-xs text-muted-foreground">{index === 0 ? "Bengaluru · Full-time" : "Remote · Full-time"} · Updated recently</p></div><div className="flex gap-5 text-center"><div><b className="block text-sm">{48 - index * 7}</b><span className="text-[10px] text-muted-foreground">Applicants</span></div><div><b className="block text-sm">{18 - index * 3}</b><span className="text-[10px] text-muted-foreground">In review</span></div></div><Link href="/recruiter/pipeline" className="inline-flex items-center gap-1 rounded-lg border border-[#eeeaf4] px-3 py-2 text-xs font-semibold hover:bg-[#faf9fc]">View pipeline <ArrowRight size={14} /></Link><button onClick={() => { setPublishedJobs((v) => v.filter((_, i) => i !== index)); setToast("Demo job archived"); }} className="grid size-9 place-items-center rounded-lg text-[#8e879b] hover:bg-[#fff4f2] hover:text-[#c15b51]" aria-label={`Archive ${title}`}><MoreHorizontal size={17} /></button></Card>)}</div><p className="mt-4 text-center text-[10px] text-muted-foreground">Job data is sample content and is only stored in the current session.</p>
  </>;

  if (mode === "candidates") return <>
    <Heading eyebrow="Talent discovery" title="Find people who fit the work" detail="Search the sample candidate database and review skills, experience, and role fit." action={<Badge>Sample profiles</Badge>} />
    <Card className="mb-4 p-4"><div className="flex flex-col gap-3 sm:flex-row"><label className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9690a1]" /><input className="input pl-9 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search candidate name, role, or skills" aria-label="Search candidates" /></label><label className="relative"><Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#958da0]" /><select value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)} className="input w-full pl-9 text-sm sm:w-52" aria-label="Filter candidate role"><option>All roles</option><option>Frontend Engineer</option><option>Product Engineer</option><option>UI Developer</option></select></label></div></Card>
    <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[730px] text-left text-xs"><thead className="bg-[#faf9fc] text-[10px] uppercase tracking-wide text-[#9992a6]"><tr><th className="px-5 py-3 font-medium">Candidate</th><th className="px-4 py-3 font-medium">Skills</th><th className="px-4 py-3 font-medium">Experience</th><th className="px-4 py-3 font-medium">Role match</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Actions</th></tr></thead><tbody>{filteredCandidates.map((candidate) => <tr key={candidate.id} className="border-t border-[#f0edf5]"><td className="px-5 py-4"><button onClick={() => setSelectedCandidate(candidate.id)} className="flex items-center gap-2.5 text-left"><span className="grid size-9 place-items-center rounded-full bg-[#eeeaff] text-[10px] font-bold text-[#6e54d5]">{candidate.name.split(" ").map((part) => part[0]).join("")}</span><span><b className="block">{candidate.name}</b><small className="mt-1 block text-muted-foreground">{candidate.role} · {candidate.location}</small></span></button></td><td className="px-4 py-4"><div className="flex flex-wrap gap-1">{candidate.skills.slice(0, 2).map((skill) => <SkillPill key={skill}>{skill}</SkillPill>)}</div></td><td className="px-4 py-4 text-muted-foreground">{candidate.experience}</td><td className="px-4 py-4"><Badge tone="green">{candidate.match}%</Badge></td><td className="px-4 py-4"><Badge tone={candidate.status === "Shortlisted" ? "purple" : "gray"}>{candidate.status}</Badge></td><td className="px-4 py-4"><button onClick={() => toggleShortlist(candidate.id)} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold ${shortlisted.includes(candidate.id) ? "border-[#e4dcff] bg-[#f2efff] text-[#6d53d3]" : "border-[#e9e5ef] hover:bg-[#faf9fc]"}`}>{shortlisted.includes(candidate.id) ? "Shortlisted" : "Shortlist"}</button></td></tr>)}</tbody></table>{filteredCandidates.length === 0 && <div className="p-4"><EmptyState title="No matching profiles" detail="Try another search or role filter." /></div>}</div></Card>
    {activeCandidate && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#211b35]/35 p-0 sm:items-center sm:p-5" onClick={() => setSelectedCandidate(null)}><section role="dialog" aria-modal="true" aria-label={`${activeCandidate.name} profile`} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"><div className="flex items-start justify-between"><div className="flex gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-[#eeeaff] text-sm font-bold text-[#6d54d4]">{activeCandidate.name.split(" ").map((part) => part[0]).join("")}</span><div><h2 className="font-semibold">{activeCandidate.name}</h2><p className="mt-1 text-xs text-muted-foreground">{activeCandidate.role} · {activeCandidate.location}</p><div className="mt-2"><Badge tone="green">{activeCandidate.match}% role match</Badge></div></div></div><button aria-label="Close profile" onClick={() => setSelectedCandidate(null)} className="grid size-9 place-items-center rounded-lg hover:bg-[#f5f3f9]"><X size={17} /></button></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-[#faf9fc] p-3"><p className="text-[10px] text-muted-foreground">Experience</p><p className="mt-1 text-sm font-semibold">{activeCandidate.experience}</p></div><div className="rounded-xl bg-[#faf9fc] p-3"><p className="text-[10px] text-muted-foreground">Profile status</p><p className="mt-1 text-sm font-semibold">{activeCandidate.status}</p></div></div><div className="mt-5"><p className="text-xs font-semibold">Resume overview</p><p className="mt-2 rounded-xl border border-[#efedf4] p-4 text-xs leading-5 text-[#777085]">Product-minded {activeCandidate.role.toLowerCase()} with experience building user-facing features and collaborating with design and engineering teams. Sample resume summary for recruiter preview.</p></div><div className="mt-4"><p className="mb-2 text-xs font-semibold">Core skills</p><div className="flex flex-wrap gap-2">{activeCandidate.skills.map((skill) => <SkillPill key={skill}>{skill}</SkillPill>)}</div></div><div className="mt-5 flex gap-2"><Button className="flex-1" onClick={() => toggleShortlist(activeCandidate.id)}>{shortlisted.includes(activeCandidate.id) ? <><Check size={15} /> Shortlisted</> : <><Bookmark size={15} /> Add to shortlist</>}</Button><Button variant="secondary" onClick={() => setToast("Candidate contact is not connected in this demo")}>Contact</Button></div><p className="mt-3 text-center text-[10px] text-muted-foreground">Sample candidate profile. Contact and hiring data are not live.</p></section></div>}
  </>;

  if (mode === "pipeline") return <>
    <Heading eyebrow="Recruiter workspace" title="Application pipeline" detail="Review example applicants and move them through a sample hiring process." action={<Badge>4 sample applicants</Badge>} />
    <div className="mb-4 flex gap-2 overflow-x-auto scrollbar-none">{["Frontend Engineer", "Product Engineer", "All roles"].map((item, i) => <button key={item} onClick={() => setSkillFilter(item)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${skillFilter === item || (i === 0 && skillFilter === "All roles") ? "bg-[#7257df] text-white" : "border border-[#e8e4ef] bg-white text-[#777187]"}`}>{item}</button>)}</div>
    <div className="grid gap-3 xl:grid-cols-4">{[["New", [candidates[0], candidates[3]], "bg-[#8d76ec]"], ["Reviewing", [candidates[2]], "bg-[#d8a34f]"], ["Shortlisted", [candidates[1]], "bg-[#55a779]"], ["Interview", [], "bg-[#70a6dc]"]].map(([stage, people, color]) => <Card key={stage as string} className="min-h-[300px] overflow-hidden"><div className="flex items-center justify-between border-b border-[#f0edf5] px-4 py-3"><div className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: color as string }} /><h2 className="text-xs font-semibold">{stage as string}</h2><span className="rounded-md bg-[#f4f2f8] px-1.5 py-0.5 text-[10px]">{(people as typeof candidates).length}</span></div><button aria-label={`Add applicant to ${stage}`} onClick={() => setToast("New applicants enter through the live application workflow in a later module")} className="text-[#928b9f] hover:text-[#5b526d]"><Plus size={15} /></button></div><div className="space-y-2 p-3">{(people as typeof candidates).map((candidate) => <article key={candidate.id} className="rounded-xl border border-[#efedf4] bg-white p-3"><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-full bg-[#eeeaff] text-[9px] font-bold text-[#6e54d5]">{candidate.name.split(" ").map((part) => part[0]).join("")}</span><div className="min-w-0"><p className="truncate text-xs font-semibold">{candidate.name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{candidate.role}</p></div></div><div className="mt-3 flex flex-wrap gap-1">{candidate.skills.slice(0, 2).map((skill) => <SkillPill key={skill}>{skill}</SkillPill>)}</div><div className="mt-3 flex items-center justify-between"><Badge tone="green">{candidate.match}% match</Badge><button onClick={() => setSelectedCandidate(candidate.id)} className="text-[10px] font-semibold text-[#7158d5]">Details</button></div><label className="mt-3 block"><span className="sr-only">Move {candidate.name} to a pipeline stage</span><select value={stage as string} onChange={(e) => setToast(`${candidate.name} moved to ${e.target.value} in this session`)} className="input py-1.5 text-[10px]"><option>New</option><option>Reviewing</option><option>Shortlisted</option><option>Interview</option><option>Offer</option></select></label></article>)}{(people as typeof candidates).length === 0 && <EmptyState title="No candidates yet" detail="Candidates will appear here as they progress." />}</div></Card>)}</div>
    {activeCandidate && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#211b35]/35 p-0 sm:items-center sm:p-5" onClick={() => setSelectedCandidate(null)}><section role="dialog" aria-modal="true" aria-label={`${activeCandidate.name} profile`} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-t-3xl bg-white p-6 sm:rounded-3xl"><div className="flex justify-between"><div><h2 className="font-semibold">{activeCandidate.name}</h2><p className="mt-1 text-xs text-muted-foreground">{activeCandidate.role} · {activeCandidate.experience}</p></div><button aria-label="Close profile" onClick={() => setSelectedCandidate(null)}><X size={17} /></button></div><p className="mt-4 text-xs leading-5 text-muted-foreground">Sample resume overview: Product-minded engineer with experience building user-facing features and collaborating across teams.</p><div className="mt-3 flex flex-wrap gap-2">{activeCandidate.skills.map((skill) => <SkillPill key={skill}>{skill}</SkillPill>)}</div><Button className="mt-5 w-full" onClick={() => toggleShortlist(activeCandidate.id)}>{shortlisted.includes(activeCandidate.id) ? "Remove from shortlist" : "Shortlist candidate"}</Button></section></div>}
  </>;

  return <>
    <Heading eyebrow="Candidate career workspace" title="Your applications at a glance" detail="Follow how example applications move from interest to interview." action={<Link href="/jobs" className="inline-flex items-center gap-2 rounded-xl bg-[#7257df] px-4 py-2.5 text-xs font-semibold text-white"><Search size={14} /> Find opportunities</Link>} />
    <div className="grid gap-3 sm:grid-cols-3"><Metric label="Active applications" value={`${Object.keys(applications).length || 2}`} change="In progress" icon={BriefcaseBusiness} tint="bg-[#f0edff] text-[#7158db]" /><Metric label="Interviews" value={`${interviews.length}`} change="Practice builds confidence" icon={MessageSquareText} tint="bg-[#edf8f2] text-[#478863]" /><Metric label="Saved roles" value={`${savedJobs.length}`} change="Ready when you are" icon={Bookmark} tint="bg-[#eef4ff] text-[#5b7bc0]" /></div>
    <Card className="mt-4 overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="bg-[#faf9fc] text-[10px] uppercase tracking-wide text-[#9992a6]"><tr><th className="px-5 py-3 font-medium">Role</th><th className="px-4 py-3 font-medium">Applied</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Next step</th><th className="px-4 py-3 font-medium">Fit</th></tr></thead><tbody>{jobs.slice(0, 3).map((job, i) => <tr key={job.id} className="border-t border-[#f0edf5]"><td className="px-5 py-4"><p className="font-semibold">{job.title}</p><p className="mt-1 text-[10px] text-muted-foreground">{job.company}</p></td><td className="px-4 py-4 text-muted-foreground">{i === 0 ? "Nov 06" : i === 1 ? "Nov 02" : "Oct 29"}</td><td className="px-4 py-4"><Badge tone={i === 0 ? "green" : "purple"}>{i === 0 ? "Interview" : i === 1 ? "In review" : applications[job.id] ?? "Applied"}</Badge></td><td className="px-4 py-4 text-muted-foreground">{i === 0 ? "Prepare for conversation" : "Awaiting update"}</td><td className="px-4 py-4"><span className="font-semibold">{job.match}%</span></td></tr>)}</tbody></table></div></Card>
    <div className="mt-4 grid gap-4 lg:grid-cols-2"><Card className="p-5"><CardTitle detail="A little practice can make a big difference">Prepare for your next conversation</CardTitle><p className="text-xs leading-5 text-muted-foreground">Use a short mock interview to organize your examples and talk about your impact.</p><Link href="/interviews" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#7257df] px-4 py-2.5 text-xs font-semibold text-white">Practice now <ArrowRight size={14} /></Link></Card><Card className="p-5"><CardTitle detail="Keep your favorite opportunities handy">Saved jobs</CardTitle>{savedJobs.length ? <div className="flex flex-wrap gap-2">{jobs.filter((job) => savedJobs.includes(job.id)).map((job) => <Badge key={job.id}>{job.title}</Badge>)}</div> : <p className="text-xs text-muted-foreground">Your saved roles will appear here. <Link href="/jobs" className="font-semibold text-[#7056d5]">Browse jobs</Link></p>}</Card></div>
  </>;
}
>>>>>>> Stashed changes

export function WorkspacePage({ mode }: { mode: WorkspaceMode }) {
  const Page = PAGE_MAP[mode];
  if (!Page) return <div className="p-4 text-xs text-muted-foreground">Unknown workspace mode.</div>;
  return <Page />;
}

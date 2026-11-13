"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  ApiError,
  api,
  authApi,
  uploadResume,
  type ApplicationRecord,
  type CandidateRecord,
  type DashboardData,
  type InterviewSessionRecord,
  type JobRecord,
  type ModelStatus,
  type NotificationItem,
  type PipelineApplication,
  type ProfilePayload,
  type RecruiterOverview,
  type ResumeAnalysis,
  type ResumeUploadResult,
  type RoadmapResponse,
  type User,
  type UserRole,
} from "@/lib/api";
import type { InterviewEvaluation, InterviewQuestion } from "@/lib/ai/types";

export type ActiveInterview = {
  sessionId?: string;
  type: string;
  mode: string;
  role: string;
  difficulty: string;
  provider?: string;
  questions: InterviewQuestion[];
  answers: { question: string; answer: string; evaluation: InterviewEvaluation }[];
  startedAt: string;
  completed: boolean;
  finalScore?: number;
};

export type SessionStatus = "checking" | "authenticated" | "anonymous" | "offline";

type WorkspaceContextValue = {
  status: SessionStatus;
  user: User | null;
  googleAvailable: boolean;
  live: boolean;
  loading: boolean;
  busy: string | null;
  error: string | null;
  lastSync: number | null;
  dashboard: DashboardData | null;
  analysis: ResumeAnalysis | null;
  jobs: JobRecord[];
  matches: { jobs: import("@/lib/ai/types").JobMatch[]; method?: string } | null;
  savedJobIds: string[];
  savedJobs: JobRecord[];
  applications: ApplicationRecord[];
  roadmap: RoadmapResponse | null;
  interviewHistory: InterviewSessionRecord[];
  notifications: NotificationItem[];
  unread: number;
  candidates: CandidateRecord[];
  recruiter: RecruiterOverview | null;
  pipeline: PipelineApplication[];
  modelStatus: ModelStatus | null;
  interview: ActiveInterview | null;
  isRecruiter: boolean;
  refresh: () => Promise<void>;
  loadModelStatus: () => Promise<void>;
  reloadSession: () => Promise<void>;
  updateProfile: (payload: ProfilePayload) => Promise<User>;
  changePassword: (payload: { current_password: string; new_password: string }) => Promise<void>;
  logout: () => Promise<void>;
  upload: (
    file: File,
    options?: { targetRole?: string; jobDescription?: string; onProgress?: (percent: number) => void },
  ) => Promise<ResumeUploadResult>;
  deleteResume: (resumeId: string) => Promise<void>;
  analyze: (targetRole: string, jobDescription?: string) => Promise<ResumeAnalysis>;
  refreshMatches: () => Promise<void>;
  toggleSave: (jobId: string) => Promise<string[]>;
  apply: (jobId: string) => Promise<void>;
  generateRoadmap: (targetRole: string, missingSkills?: string[]) => Promise<RoadmapResponse>;
  toggleRoadmapItem: (itemId: string, completed: boolean) => Promise<void>;
  startInterview: (input: {
    type: string;
    mode: string;
    role: string;
    difficulty?: string;
    skills?: string[];
    resumeContext?: string;
  }) => Promise<ActiveInterview>;
  evaluateAnswer: (prompt: string, answer: string, questionId?: string) => Promise<InterviewEvaluation>;
  completeInterview: (score: number) => Promise<void>;
  resetInterview: () => void;
  markAllRead: () => Promise<void>;
  searchCandidates: (query: string) => Promise<void>;
  createJob: (payload: Parameters<typeof api.createJob>[0]) => Promise<JobRecord>;
  updateJobStatus: (jobId: string, status: "DRAFT" | "PUBLISHED" | "CLOSED") => Promise<void>;
  updateApplicationStatus: (applicationId: string, status: string) => Promise<void>;
  transcribe: (blob: Blob, filename?: string) => Promise<{ text: string; available: boolean; notice?: string }>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const WORKSPACE_ROOTS = [
  "/dashboard",
  "/resume",
  "/career",
  "/learn",
  "/interviews",
  "/jobs",
  "/applications",
  "/profile",
  "/settings",
  "/onboarding",
  "/recruiter",
];

const INTERVIEW_KEY = "skillbridge:interview";
const POLL_MS = 25_000;

function isWorkspacePath(pathname: string | null): boolean {
  if (!pathname) return false;
  return WORKSPACE_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

function readInterview(): ActiveInterview | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(INTERVIEW_KEY);
    return raw ? (JSON.parse(raw) as ActiveInterview) : null;
  } catch {
    return null;
  }
}

function writeInterview(value: ActiveInterview | null) {
  if (typeof window === "undefined") return;
  try {
    if (value) window.sessionStorage.setItem(INTERVIEW_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(INTERVIEW_KEY);
  } catch {
    // Session storage can be unavailable; the live context still works.
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [status, setStatus] = useState<SessionStatus>("checking");
  const [user, setUser] = useState<User | null>(null);
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [matches, setMatches] = useState<WorkspaceContextValue["matches"]>(null);
  const [savedJobIds, setSavedJobIds] = useState<string[]>([]);
  const [savedJobs, setSavedJobs] = useState<JobRecord[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [roadmap, setRoadmap] = useState<RoadmapResponse | null>(null);
  const [interviewHistory, setInterviewHistory] = useState<InterviewSessionRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [recruiter, setRecruiter] = useState<RecruiterOverview | null>(null);
  const [pipeline, setPipeline] = useState<PipelineApplication[]>([]);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [interview, setInterviewState] = useState<ActiveInterview | null>(null);

  const matchesKey = useRef("");
  const refreshInFlight = useRef<Promise<void> | null>(null);

  const setInterview = useCallback((next: ActiveInterview | null) => {
    setInterviewState(next);
    writeInterview(next);
  }, []);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setUser(null);
          setStatus("anonymous");
          setDashboard(null);
          router.replace("/auth/login");
          return;
        }
        if (err.status === 0 || err.status === 503) {
          setError(err.message);
          return;
        }
        setError(err.message);
        return;
      }
      setError(err instanceof Error ? err.message : "Something went wrong.");
    },
    [router],
  );

  const run = useCallback(
    async <T,>(label: string, task: () => Promise<T>): Promise<T> => {
      setBusy(label);
      setError(null);
      try {
        return await task();
      } catch (err) {
        handleError(err);
        throw err;
      } finally {
        setBusy(null);
      }
    },
    [handleError],
  );

  const reloadSession = useCallback(async () => {
    setStatus("checking");
    setError(null);
    try {
      const [session, providers] = await Promise.all([
        authApi.session(),
        authApi.providers().catch(() => ({ google: false })),
      ]);
      setGoogleAvailable(providers.google);
      setUser(session.user);
      setStatus(session.user ? "authenticated" : "anonymous");
      if (!session.user) {
        setDashboard(null);
        setJobs([]);
        setMatches(null);
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 503 || err.status === 0)) {
        setStatus("offline");
        setError(err.message);
      } else {
        setStatus("anonymous");
        setUser(null);
      }
    }
  }, []);

  const loadModelStatus = useCallback(async () => {
    try {
      setModelStatus(await api.modelStatus());
    } catch {
      setModelStatus(null);
    }
  }, []);

  const loadMatches = useCallback(async (analysis: ResumeAnalysis | null) => {
    if (!analysis) {
      setMatches(null);
      return;
    }
    try {
      const result = await api.matchJobs({
        skills: analysis.skill_names,
        resumeText: analysis.profile.summary || "",
        limit: 24,
      });
      setMatches({ jobs: result.jobs, method: result.method });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) handleError(err);
    }
  }, [handleError]);

  const refreshCore = useCallback(async () => {
    if (!user) return;
    if (refreshInFlight.current) return refreshInFlight.current;

    const task = (async () => {
      setLoading(true);
      try {
        const [dash, saved, appList, roadmapRes, history, notificationsRes] = await Promise.all([
          api.dashboard(),
          api.savedJobs(),
          api.applications(),
          api.roadmap(),
          api.interviewHistory(),
          api.notifications(),
        ]);
        setDashboard(dash);
        setSavedJobIds(saved.saved_job_ids);
        setSavedJobs(saved.jobs);
        setApplications(appList.applications);
        setRoadmap(roadmapRes.roadmap);
        setInterviewHistory(history.sessions);
        setNotifications(notificationsRes.notifications);
        setLastSync(Date.now());
        setError(null);

        if (user.role === "candidate") {
          const jobList = await api.jobs("published").catch(() => ({ jobs: [] as JobRecord[] }));
          setJobs(jobList.jobs);
          const key = dash.analysis
            ? `${dash.analysis.target_role}|${dash.analysis.skill_names.length}|${dash.analysis.weighted_match_percent}|${dash.analysis.readiness.score}`
            : "";
          if (key && key !== matchesKey.current) {
            matchesKey.current = key;
            void loadMatches(dash.analysis);
          }
          if (!key) {
            matchesKey.current = "";
            setMatches(null);
          }
        } else {
          const [overview, candidateList, pipelineList, mine] = await Promise.all([
            api.recruiterOverview().catch(() => null),
            api.candidates().catch(() => ({ candidates: [] as CandidateRecord[] })),
            api.pipeline().catch(() => ({ applications: [] as PipelineApplication[] })),
            api.jobs("mine").catch(() => ({ jobs: [] as JobRecord[] })),
          ]);
          setRecruiter(overview);
          setCandidates(candidateList.candidates);
          setPipeline(pipelineList.applications);
          setJobs(mine.jobs);
        }
      } catch (err) {
        handleError(err);
      } finally {
        setLoading(false);
      }
    })();

    refreshInFlight.current = task;
    try {
      await task;
    } finally {
      refreshInFlight.current = null;
    }
  }, [user, handleError, loadMatches]);

  const refresh = useCallback(async () => {
    await refreshCore();
    await loadModelStatus();
  }, [refreshCore, loadModelStatus]);

  useEffect(() => {
    setInterviewState(readInterview());
  }, []);

  useEffect(() => {
    void reloadSession();
  }, [reloadSession]);

  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    if (!isWorkspacePath(pathname)) return;
    void refresh();
  }, [status, user, pathname, refresh]);

  useEffect(() => {
    if (status !== "authenticated" || !isWorkspacePath(pathname)) return;

    let debounce: number | undefined;
    const source = new EventSource("/api/events");
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    source.addEventListener("change", () => {
      setLive(true);
      if (debounce) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        void refreshCore();
      }, 300);
    });

    return () => {
      source.close();
      if (debounce) window.clearTimeout(debounce);
      setLive(false);
    };
  }, [status, pathname, refreshCore]);

  useEffect(() => {
    if (status !== "authenticated" || !isWorkspacePath(pathname)) return;

    const tick = () => {
      if (document.visibilityState === "visible") void refreshCore();
    };
    const timer = window.setInterval(tick, POLL_MS);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, [status, pathname, refreshCore]);

  const updateProfile = useCallback(
    async (payload: ProfilePayload) => {
      return run("Saving profile", async () => {
        const { user: updated } = await authApi.updateProfile(payload);
        setUser(updated);
        setStatus("authenticated");
        return updated;
      });
    },
    [run],
  );

  const changePassword = useCallback(
    async (payload: { current_password: string; new_password: string }) => {
      await run("Changing password", async () => {
        await authApi.changePassword(payload);
      });
    },
    [run],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setStatus("anonymous");
      setDashboard(null);
      setJobs([]);
      setMatches(null);
      setSavedJobs([]);
      setApplications([]);
      setRoadmap(null);
      setInterviewHistory([]);
      setNotifications([]);
      setInterview(null);
      router.replace("/");
      router.refresh();
    }
  }, [router, setInterview]);

  const upload = useCallback(
    async (
      file: File,
      options?: { targetRole?: string; jobDescription?: string; onProgress?: (percent: number) => void },
    ) => {
      return run("Analyzing resume", async () => {
        const result = await uploadResume(file, options);
        await refreshCore();
        return result;
      });
    },
    [run, refreshCore],
  );

  const deleteResume = useCallback(
    async (resumeId: string) => {
      await run("Removing resume", async () => {
        await api.deleteResume(resumeId);
      });
    },
    [run],
  );

  const analyze = useCallback(
    async (targetRole: string, jobDescription?: string) => {
      return run("Scoring skill gap", async () => {
        const analysis = await api.analyzeCareer({ targetRole, jobDescription });
        await refreshCore();
        return analysis;
      });
    },
    [run, refreshCore],
  );

  const refreshMatches = useCallback(async () => {
    const analysis = dashboard?.analysis ?? null;
    await loadMatches(analysis);
  }, [dashboard, loadMatches]);

  const toggleSave = useCallback(
    async (jobId: string) => {
      return run("Updating saved jobs", async () => {
        const { saved_job_ids } = await api.toggleSave(jobId);
        setSavedJobIds(saved_job_ids);
        const saved = await api.savedJobs().catch(() => ({ saved_job_ids, jobs: [] as JobRecord[] }));
        setSavedJobs(saved.jobs);
        return saved_job_ids;
      });
    },
    [run],
  );

  const apply = useCallback(
    async (jobId: string) => {
      await run("Submitting application", async () => {
        await api.apply(jobId);
        await refreshCore();
      });
    },
    [run, refreshCore],
  );

  const generateRoadmap = useCallback(
    async (targetRole: string, missingSkills?: string[]) => {
      return run("Building roadmap", async () => {
        const result = await api.generateRoadmap({
          targetRole,
          missingSkills: missingSkills ?? dashboard?.analysis?.missing_skills ?? [],
        });
        setRoadmap(result);
        await refreshCore();
        return result;
      });
    },
    [run, dashboard, refreshCore],
  );

  const toggleRoadmapItem = useCallback(
    async (itemId: string, completed: boolean) => {
      await run("Updating progress", async () => {
        const result = await api.toggleRoadmapItem(itemId, completed);
        setRoadmap(result.roadmap);
        setDashboard((current) =>
          current ? { ...current, roadmap: { ...current.roadmap, completed: result.roadmap.items.filter((item) => item.completed).length, percent: Math.round((result.roadmap.items.filter((item) => item.completed).length / Math.max(1, result.roadmap.items.length)) * 100) } } : current,
        );
      });
    },
    [run],
  );

  const startInterview = useCallback(
    async (input: {
      type: string;
      mode: string;
      role: string;
      difficulty?: string;
      skills?: string[];
      resumeContext?: string;
    }) => {
      return run("Preparing interview", async () => {
        const result = await api.interviewQuestions({
          role: input.role,
          mode: input.mode,
          difficulty: input.difficulty || "intermediate",
          skills: input.skills ?? dashboard?.analysis?.skill_names ?? [],
          resumeContext: input.resumeContext ?? dashboard?.analysis?.profile.summary ?? "",
        });
        const next: ActiveInterview = {
          sessionId: result.session_id,
          type: input.type,
          mode: input.mode,
          role: input.role,
          difficulty: input.difficulty || "intermediate",
          provider: result.provider,
          questions: result.questions,
          answers: [],
          startedAt: new Date().toISOString(),
          completed: false,
        };
        setInterview(next);
        return next;
      });
    },
    [run, dashboard, setInterview],
  );

  const evaluateAnswer = useCallback(
    async (prompt: string, answer: string, questionId?: string) => {
      return run("Scoring answer", async () => {
        const current = interview;
        if (!current) throw new ApiError("Start an interview before submitting an answer.", 400);
        const evaluation = await api.evaluateAnswer({
          question: prompt,
          answer,
          role: current.role,
          sessionId: current.sessionId,
          questionId,
        });
        setInterview({
          ...current,
          answers: [...current.answers, { question: prompt, answer, evaluation }],
        });
        return evaluation;
      });
    },
    [run, interview, setInterview],
  );

  const completeInterview = useCallback(
    async (score: number) => {
      await run("Saving interview", async () => {
        const current = interview;
        if (!current?.sessionId) {
          setInterview(current ? { ...current, completed: true, finalScore: score } : current);
          return;
        }
        await api.completeInterview(current.sessionId, score);
        setInterview({ ...current, completed: true, finalScore: score });
        const history = await api.interviewHistory();
        setInterviewHistory(history.sessions);
        await refreshCore();
      });
    },
    [run, interview, setInterview, refreshCore],
  );

  const resetInterview = useCallback(() => setInterview(null), [setInterview]);

  const markAllRead = useCallback(async () => {
    try {
      await api.markNotificationsRead();
      setNotifications((items) => items.map((item) => ({ ...item, read: true })));
    } catch (err) {
      handleError(err);
    }
  }, [handleError]);

  const searchCandidates = useCallback(
    async (query: string) => {
      try {
        const result = await api.candidates(query);
        setCandidates(result.candidates);
      } catch (err) {
        handleError(err);
      }
    },
    [handleError],
  );

  const createJob = useCallback(
    async (payload: Parameters<typeof api.createJob>[0]) => {
      return run("Publishing job", async () => {
        const job = await api.createJob(payload);
        await refreshCore();
        return job;
      });
    },
    [run, refreshCore],
  );

  const updateJobStatus = useCallback(
    async (jobId: string, jobStatus: "DRAFT" | "PUBLISHED" | "CLOSED") => {
      await run("Updating job", async () => {
        await api.updateJobStatus(jobId, jobStatus);
        await refreshCore();
      });
    },
    [run, refreshCore],
  );

  const updateApplicationStatus = useCallback(
    async (applicationId: string, nextStatus: string) => {
      await run("Moving application", async () => {
        await api.updateApplicationStatus(applicationId, nextStatus);
        await refreshCore();
      });
    },
    [run, refreshCore],
  );

  const transcribe = useCallback(
    async (blob: Blob, filename?: string) => {
      return run("Transcribing audio", async () => api.transcribe(blob, filename));
    },
    [run],
  );

  const unread = useMemo(() => notifications.filter((item) => !item.read).length, [notifications]);
  const isRecruiter = user?.role === "recruiter";

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (user && !user.onboarded && isWorkspacePath(pathname) && pathname !== "/onboarding") {
      router.replace("/onboarding");
    }
  }, [user, pathname, router]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      status,
      user,
      googleAvailable,
      live,
      loading,
      busy,
      error,
      lastSync,
      dashboard,
      analysis: dashboard?.analysis ?? null,
      jobs,
      matches,
      savedJobIds,
      savedJobs,
      applications,
      roadmap,
      interviewHistory,
      notifications,
      unread,
      candidates,
      recruiter,
      pipeline,
      modelStatus,
      interview,
      isRecruiter,
      refresh,
      loadModelStatus,
      reloadSession,
      updateProfile,
      changePassword,
      logout,
      upload,
      deleteResume,
      analyze,
      refreshMatches,
      toggleSave,
      apply,
      generateRoadmap,
      toggleRoadmapItem,
      startInterview,
      evaluateAnswer,
      completeInterview,
      resetInterview,
      markAllRead,
      searchCandidates,
      createJob,
      updateJobStatus,
      updateApplicationStatus,
      transcribe,
    }),
    [
      status,
      user,
      googleAvailable,
      live,
      loading,
      busy,
      error,
      lastSync,
      dashboard,
      jobs,
      matches,
      savedJobIds,
      savedJobs,
      applications,
      roadmap,
      interviewHistory,
      notifications,
      unread,
      candidates,
      recruiter,
      pipeline,
      modelStatus,
      interview,
      isRecruiter,
      refresh,
      loadModelStatus,
      reloadSession,
      updateProfile,
      changePassword,
      logout,
      upload,
      deleteResume,
      analyze,
      refreshMatches,
      toggleSave,
      apply,
      generateRoadmap,
      toggleRoadmapItem,
      startInterview,
      evaluateAnswer,
      completeInterview,
      resetInterview,
      markAllRead,
      searchCandidates,
      createJob,
      updateJobStatus,
      updateApplicationStatus,
      transcribe,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return context;
}

export function roleLabel(role: UserRole): string {
  return role === "recruiter" ? "Recruiter" : "Candidate";
}

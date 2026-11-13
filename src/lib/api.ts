import type {
  InterviewEvaluation,
  InterviewQuestion,
  JobMatch,
  JobMatchResponse,
  ModelStatus,
  ResumeAnalysis,
  ResumeUploadResult,
  RoadmapResponse,
  SkillMatchResult,
} from "@/lib/ai/types";

export type UserRole = "candidate" | "recruiter";

export type User = {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  provider: string;
  role: UserRole;
  email_verified: boolean;
  headline: string | null;
  location: string | null;
  phone: string | null;
  bio: string | null;
  website: string | null;
  linkedin: string | null;
  github: string | null;
  company: string | null;
  job_title: string | null;
  years_experience: number | null;
  target_role: string | null;
  open_to_work: boolean;
  onboarded: boolean;
  created_at: string;
  updated_at: string;
};

export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  read: boolean;
  created_at: string;
  meta: Record<string, unknown>;
};

export type DashboardData = {
  profile_completeness: number;
  profile: User;
  resume: { id: string; filename: string; created_at: string } | null;
  analysis: ResumeAnalysis | null;
  match: SkillMatchResult | null;
  skills: {
    total: number;
    matched: number;
    partial: number;
    missing: number;
    by_category: Record<string, string[]>;
  };
  readiness: ResumeAnalysis["readiness"] | null;
  readiness_trend: { date: string; readiness: number; match: number; role: string }[];
  interview_trend: { date: string; score: number; type: string }[];
  interviews: { total: number; completed: number; average_score: number | null };
  applications: { counts: Record<string, number>; total: number };
  saved_jobs: number;
  roadmap: {
    exists: boolean;
    items: number;
    completed: number;
    percent: number;
    learning_hours: number;
    total_hours: number;
    target_role: string | null;
  };
  activity: NotificationItem[];
  generated_at: string;
};

export type JobRecord = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  employment_type: string | null;
  salary: string | null;
  description: string;
  required_skills: string[];
  tags: string[];
  posted: string | null;
  recruiter_id: string | null;
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | string;
  created_by_name: string | null;
};

export type ApplicationRecord = {
  id: string;
  job_id: string;
  status: string;
  created_at: string;
  title: string | null;
  company: string | null;
};

export type InterviewSessionRecord = {
  id: string;
  role: string;
  mode: string;
  difficulty: string;
  status: "IN_PROGRESS" | "COMPLETED" | string;
  score: number | null;
  provider: string | null;
  created_at: string;
  completed_at: string | null;
};

export type CandidateRecord = {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  headline: string | null;
  location: string | null;
  target_role: string | null;
  company: string | null;
  years_experience: number | null;
  open_to_work: boolean;
  updated_at: string;
  skills: string[];
  readiness: number | null;
  experience_years: number | null;
  resume: { id: string; filename: string; created_at: string } | null;
  summary: string | null;
};

export type RecruiterOverview = {
  jobs: { id: string; title: string; status: string; created_at: string }[];
  pipeline: Record<string, number>;
  applicants: number;
  candidates: number;
};

export type PipelineApplication = {
  id: string;
  status: string;
  created_at: string;
  job_id: string;
  job_title: string;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  headline: string | null;
  location: string | null;
  avatar_url: string | null;
};

export type PublicStats = {
  candidates: number;
  recruiters: number;
  resumes_analyzed: number;
  analyses: number;
  interviews: number;
  interviews_completed: number;
  jobs: number;
  applications: number;
};

export type JobMatchRecord = JobMatch;
export type { ModelStatus, ResumeAnalysis, ResumeUploadResult, RoadmapResponse, InterviewEvaluation, InterviewQuestion };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ErrorBody = { error?: { message?: string; code?: string } };
type AuthPayload = { user: User };

async function parse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as T | ErrorBody | null;
  if (!response.ok) {
    const error = payload as ErrorBody | null;
    throw new ApiError(
      error?.error?.message || "The SkillBridge service could not complete this request.",
      response.status,
      error?.error?.code,
    );
  }
  return payload as T;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`/api/backend/${path.replace(/^\/+/, "")}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("The SkillBridge service could not be reached. Check that it is running.", 0, "network_error");
  }
  return parse<T>(response);
}

async function authRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, cache: "no-store" });
  } catch {
    throw new ApiError("The SkillBridge service could not be reached. Check that it is running.", 0, "network_error");
  }
  return parse<T>(response);
}

export type ProfilePayload = Partial<{
  name: string;
  avatar_url: string | null;
  headline: string | null;
  location: string | null;
  phone: string | null;
  bio: string | null;
  website: string | null;
  linkedin: string | null;
  github: string | null;
  company: string | null;
  job_title: string | null;
  years_experience: number | null;
  target_role: string | null;
  open_to_work: boolean;
  onboarded: boolean;
}>;

export const authApi = {
  providers: () => authRequest<{ google: boolean }>("/api/auth/providers"),

  session: () => authRequest<{ user: User | null }>("/api/auth/session"),

  login: (payload: { email: string; password: string }) =>
    authRequest<AuthPayload>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  register: (payload: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    company?: string | null;
  }) =>
    authRequest<AuthPayload>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  logout: () => authRequest<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  updateProfile: (payload: ProfilePayload) =>
    authRequest<AuthPayload>("/api/auth/profile", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  changePassword: (payload: { current_password: string; new_password: string }) =>
    authRequest<{ ok: boolean }>("/api/auth/password", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
};

export function uploadResume(
  file: File,
  options: { targetRole?: string; jobDescription?: string; onProgress?: (percent: number) => void } = {},
): Promise<ResumeUploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("target_role", options.targetRole || "software engineer");
    form.append("job_description", options.jobDescription || "");

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/backend/resume/upload");
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        options.onProgress?.(Math.min(94, Math.round((event.loaded / event.total) * 94)));
      }
    };
    xhr.onerror = () =>
      reject(new ApiError("The upload could not reach the SkillBridge service.", 0, "network_error"));
    xhr.onload = () => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        reject(new ApiError("The service returned an invalid upload response.", xhr.status, "invalid_response"));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        const error = payload as ErrorBody;
        reject(new ApiError(error?.error?.message || "The resume could not be processed.", xhr.status, error?.error?.code));
        return;
      }
      options.onProgress?.(100);
      resolve(payload as ResumeUploadResult);
    };
    xhr.send(form);
  });
}

export const api = {
  dashboard: () => request<DashboardData>("dashboard"),

  resumeLatest: () =>
    request<{ analysis: ResumeAnalysis | null; resume: { id: string; filename: string; mime_type: string; created_at: string } | null }>(
      "resume/latest",
    ),

  resumeHistory: () =>
    request<{ resumes: { id: string; filename: string; mime_type: string; created_at: string }[] }>("resume/history"),

  deleteResume: (resumeId: string) =>
    request<{ ok: boolean }>(`resume/${encodeURIComponent(resumeId)}`, { method: "DELETE" }),

  analyzeCareer: (payload: { targetRole: string; jobDescription?: string; resumeText?: string }) =>
    request<ResumeAnalysis>("career/analyze", {
      method: "POST",
      body: JSON.stringify({
        resume_text: payload.resumeText || "",
        target_role: payload.targetRole,
        job_description: payload.jobDescription || "",
        use_latest_resume: true,
      }),
    }),

  compareJob: (payload: { jobDescription: string; resumeText?: string }) =>
    request<{
      semantic_similarity: number;
      matched_skills: string[];
      partial_skills: string[];
      missing_skills: string[];
      skill_coverage: number;
      weighted_coverage: number;
      method: string;
      notice: string;
    }>("career/compare", {
      method: "POST",
      body: JSON.stringify({ resume_text: payload.resumeText || "", job_description: payload.jobDescription }),
    }),

  careerRoles: () =>
    request<{ roles: { key: string; title: string; summary: string; skills: string[] }[] }>("career/roles"),

  jobs: (scope: "published" | "mine" | "all" = "published") =>
    request<{ jobs: JobRecord[] }>(`jobs?scope=${scope}&limit=80`),

  matchJobs: (payload: { skills?: string[]; resumeText?: string; useReranker?: boolean; limit?: number } = {}) =>
    request<JobMatchResponse>("jobs/match", {
      method: "POST",
      body: JSON.stringify({
        candidate_skills: payload.skills || [],
        resume_text: payload.resumeText || "",
        use_reranker: Boolean(payload.useReranker),
        limit: payload.limit ?? 24,
      }),
    }),

  savedJobs: () => request<{ saved_job_ids: string[]; jobs: JobRecord[] }>("jobs/saved/list"),

  toggleSave: (jobId: string) =>
    request<{ saved_job_ids: string[] }>(`jobs/${encodeURIComponent(jobId)}/save`, { method: "POST" }),

  apply: (jobId: string) =>
    request<{ application: ApplicationRecord }>(`jobs/${encodeURIComponent(jobId)}/apply`, { method: "POST" }),

  applications: () => request<{ applications: ApplicationRecord[] }>("applications"),

  job: (jobId: string) => request<JobRecord>(`jobs/${encodeURIComponent(jobId)}`),

  createJob: (payload: {
    title: string;
    company?: string;
    location?: string;
    employment_type?: string;
    salary?: string;
    description: string;
    required_skills?: string[];
    tags?: string[];
  }) => request<JobRecord>("jobs", { method: "POST", body: JSON.stringify(payload) }),

  updateJobStatus: (jobId: string, status: "DRAFT" | "PUBLISHED" | "CLOSED") =>
    request<JobRecord>(`jobs/${encodeURIComponent(jobId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  roadmap: () => request<{ roadmap: RoadmapResponse | null }>("learning/roadmap"),

  generateRoadmap: (payload: { missingSkills?: string[]; targetRole: string; useLlm?: boolean; learnerContext?: string }) =>
    request<RoadmapResponse>("learning/roadmap", {
      method: "POST",
      body: JSON.stringify({
        missing_skills: payload.missingSkills || [],
        target_role: payload.targetRole,
        use_llm: payload.useLlm ?? true,
        learner_context: payload.learnerContext || "",
      }),
    }),

  toggleRoadmapItem: (itemId: string, completed: boolean) =>
    request<{ roadmap: RoadmapResponse }>(`learning/roadmap/items/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      body: JSON.stringify({ completed }),
    }),

  interviewQuestions: (payload: {
    role: string;
    mode: string;
    difficulty?: string;
    resumeContext?: string;
    skills?: string[];
    useLlm?: boolean;
  }) =>
    request<{
      role: string;
      mode: string;
      difficulty: string;
      questions: InterviewQuestion[];
      provider: string;
      session_id?: string;
      llm: Record<string, unknown>;
      inference_ms: number;
      notice: string;
    }>("interviews/questions", {
      method: "POST",
      body: JSON.stringify({
        role: payload.role,
        mode: payload.mode,
        difficulty: payload.difficulty || "intermediate",
        resume_context: payload.resumeContext || "",
        skills: payload.skills || [],
        use_llm: payload.useLlm ?? true,
        save_session: true,
      }),
    }),

  evaluateAnswer: (payload: {
    question: string;
    answer: string;
    role?: string;
    sessionId?: string;
    questionId?: string;
    useLlm?: boolean;
  }) =>
    request<InterviewEvaluation>("interviews/evaluate", {
      method: "POST",
      body: JSON.stringify({
        question: payload.question,
        answer: payload.answer,
        role: payload.role || "the target role",
        session_id: payload.sessionId || null,
        question_id: payload.questionId || null,
        use_llm: payload.useLlm ?? true,
      }),
    }),

  completeInterview: (sessionId: string, score: number) =>
    request<InterviewSessionRecord>("interviews/complete", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, score }),
    }),

  interviewHistory: () => request<{ sessions: InterviewSessionRecord[] }>("interviews/history"),

  interviewSession: (sessionId: string) =>
    request<InterviewSessionRecord & { questions: InterviewQuestion[] }>(
      `interviews/sessions/${encodeURIComponent(sessionId)}`,
    ),

  recruiterOverview: () => request<RecruiterOverview>("recruiter/overview"),

  candidates: (query = "") =>
    request<{ candidates: CandidateRecord[] }>(`recruiter/candidates?q=${encodeURIComponent(query)}`),

  pipeline: () => request<{ applications: PipelineApplication[] }>("recruiter/pipeline"),

  updateApplicationStatus: (applicationId: string, status: string) =>
    request<Record<string, unknown>>(`recruiter/applications/${encodeURIComponent(applicationId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  notifications: () => request<{ notifications: NotificationItem[]; unread: number }>("notifications"),

  markNotificationsRead: () => request<{ marked: number }>("notifications/read", { method: "POST" }),

  modelStatus: () => request<ModelStatus>("models/status"),

  warmModels: (models: string[]) =>
    request<{ results: Record<string, unknown>; elapsed_ms: number; status: ModelStatus }>("models/warm", {
      method: "POST",
      body: JSON.stringify({ models }),
    }),

  transcribe: (blob: Blob, filename = "answer.webm") => {
    const form = new FormData();
    form.append("file", blob, filename);
    return request<{ text: string; available: boolean; notice?: string; model?: string }>("voice/transcribe", {
      method: "POST",
      body: form,
    });
  },

  publicStats: async (): Promise<PublicStats> => {
    const response = await fetch("/api/public/stats", { cache: "no-store" });
    return parse<PublicStats>(response);
  },
};

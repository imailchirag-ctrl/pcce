"use client";

import type {
  InterviewEvaluation,
  InterviewQuestionsResponse,
  JobMatchResponse,
  ModelStatus,
  ResumeAnalysis,
  ResumeUploadResult,
  RoadmapResponse,
} from "./types";

export class AiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}

const BASE = "/api/ai";
const LOCAL_PREFIX = "skillbridge-ai:";

export function demoUser(): string {
  if (typeof window === "undefined") return "demo-candidate";
  try {
    const raw = window.localStorage.getItem("skillbridge-demo:profile");
    if (raw) {
      const profile = JSON.parse(raw) as { email?: string };
      if (profile.email) return profile.email.toLowerCase().slice(0, 80);
    }
  } catch {
    // Ignore malformed local storage and use the shared demo identity.
  }
  return "demo-candidate";
}

async function aiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("X-Demo-User", demoUser());
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${BASE}/${path}`, { ...init, headers, cache: "no-store" });
  } catch {
    throw new AiError("The AI service could not be reached. Start FastAPI with `npm run fastapi:dev`.", 0, "network_error");
  }

  const payload = (await response.json().catch(() => null)) as
    | { error?: { message?: string; code?: string } }
    | T
    | null;
  if (!response.ok) {
    const error = payload as { error?: { message?: string; code?: string } } | null;
    throw new AiError(
      error?.error?.message || "The AI service could not complete this request.",
      response.status,
      error?.error?.code || "ai_request_failed",
    );
  }
  if (payload === null) {
    throw new AiError("The AI service returned an invalid response.", response.status, "invalid_response");
  }
  return payload as T;
}

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
    xhr.open("POST", `${BASE}/resume/upload`);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("X-Demo-User", demoUser());
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        options.onProgress?.(Math.min(94, Math.round((event.loaded / event.total) * 94)));
      }
    };
    xhr.onerror = () => reject(new AiError("The upload could not reach the AI service.", 0, "network_error"));
    xhr.onload = () => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        reject(new AiError("The AI service returned an invalid upload response.", xhr.status, "invalid_response"));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        const error = payload as { error?: { message?: string; code?: string } };
        reject(
          new AiError(
            error?.error?.message || "The resume could not be processed.",
            xhr.status,
            error?.error?.code,
          ),
        );
        return;
      }
      options.onProgress?.(100);
      resolve(payload as ResumeUploadResult);
    };
    xhr.send(form);
  });
}

export const ai = {
  latestResume: () => aiFetch<{ analysis: ResumeAnalysis | null; resume: { id: string; filename: string; created_at: string } | null }>("resume/latest"),

  analyzeCareer: (payload: { resumeText?: string; targetRole: string; jobDescription?: string }) =>
    aiFetch<ResumeAnalysis>("career/analyze", {
      method: "POST",
      body: JSON.stringify({
        resume_text: payload.resumeText || "",
        target_role: payload.targetRole,
        job_description: payload.jobDescription || "",
        use_latest_resume: true,
      }),
    }),

  compareJob: (payload: { resumeText?: string; jobDescription: string }) =>
    aiFetch<{
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

  matchJobs: (payload: { skills: string[]; resumeText?: string; useReranker?: boolean; limit?: number }) =>
    aiFetch<JobMatchResponse>("jobs/match", {
      method: "POST",
      body: JSON.stringify({
        candidate_skills: payload.skills,
        resume_text: payload.resumeText || "",
        use_reranker: Boolean(payload.useReranker),
        limit: payload.limit ?? 12,
      }),
    }),

  generateRoadmap: (payload: { missingSkills: string[]; targetRole: string; useLlm?: boolean; learnerContext?: string }) =>
    aiFetch<RoadmapResponse>("learning/roadmap", {
      method: "POST",
      body: JSON.stringify({
        missing_skills: payload.missingSkills,
        target_role: payload.targetRole,
        use_llm: payload.useLlm ?? true,
        learner_context: payload.learnerContext || "",
      }),
    }),

  interviewQuestions: (payload: {
    role: string;
    mode: string;
    difficulty?: string;
    resumeContext?: string;
    skills?: string[];
    useLlm?: boolean;
  }) =>
    aiFetch<InterviewQuestionsResponse>("interviews/questions", {
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
    aiFetch<InterviewEvaluation>("interviews/evaluate", {
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
    aiFetch<Record<string, unknown>>("interviews/complete", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, score }),
    }),

  interviewHistory: () => aiFetch<{ sessions: Record<string, unknown>[] }>("interviews/history"),

  modelStatus: () => aiFetch<ModelStatus>("models/status"),

  warmModels: (models: string[]) =>
    aiFetch<{ results: Record<string, unknown>; elapsed_ms: number; status: ModelStatus }>("models/warm", {
      method: "POST",
      body: JSON.stringify({ models }),
    }),

  toggleSavedJob: (jobId: string) =>
    aiFetch<{ saved_job_ids: string[] }>(`jobs/${jobId}/save`, { method: "POST" }),

  savedJobs: () => aiFetch<{ saved_job_ids: string[] }>("jobs/saved/list"),

  applyJob: (jobId: string) =>
    aiFetch<{ application: Record<string, unknown> }>(`jobs/${jobId}/apply`, { method: "POST" }),

  applications: () => aiFetch<{ applications: Record<string, unknown>[] }>("applications"),

  transcribe: (blob: Blob, filename = "answer.webm") => {
    const form = new FormData();
    form.append("file", blob, filename);
    return aiFetch<{ text: string; available: boolean; notice?: string; model?: string }>("voice/transcribe", {
      method: "POST",
      body: form,
    });
  },
};

// ---------------------------------------------------------------------------
// Local cache so screens can render instantly while the live service responds.
// ---------------------------------------------------------------------------
function readLocal<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeLocal<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private mode; the app still works.
  }
}

export const aiCache = {
  getAnalysis: () => readLocal<ResumeAnalysis>("analysis"),
  setAnalysis: (analysis: ResumeAnalysis) => writeLocal("analysis", analysis),
  clearAnalysis: () => {
    if (typeof window !== "undefined") window.localStorage.removeItem(LOCAL_PREFIX + "analysis");
  },
  getRoadmap: () => readLocal<RoadmapResponse>("roadmap"),
  setRoadmap: (roadmap: RoadmapResponse) => writeLocal("roadmap", roadmap),
  getInterview: () =>
    readLocal<{
      sessionId?: string;
      type: string;
      questions: InterviewQuestionsResponse["questions"];
      answers: { question: string; answer: string; evaluation: InterviewEvaluation }[];
      provider?: string;
    }>("interview"),
  setInterview: (value: ReturnType<typeof aiCache.getInterview>) => writeLocal("interview", value),
  getInterviewHistory: () => readLocal<{ type: string; score: number; date: string }[]>("interview-history") ?? [],
  addInterviewHistory: (item: { type: string; score: number; date: string }) => {
    const history = aiCache.getInterviewHistory();
    writeLocal("interview-history", [item, ...history].slice(0, 12));
  },
};

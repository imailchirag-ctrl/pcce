import { ApiError } from "@/lib/api";
import type {
  DifficultyKey,
  MissionCompletion,
  QuestAttempt,
  QuestCatalog,
  QuestProgression,
  QuestReport,
  QuestRun,
  QuestRunSummary,
} from "./types";

type ErrorPayload = { error?: { code?: string; message?: string } };

async function questRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`/api/backend/career-quests${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Career Quest could not reach SkillBridge. Check that the service is running.", 0, "network_error");
  }
  const payload = (await response.json().catch(() => null)) as T | ErrorPayload | null;
  if (!response.ok) {
    const error = payload as ErrorPayload | null;
    throw new ApiError(
      error?.error?.message || "Career Quest could not complete this request.",
      response.status,
      error?.error?.code,
    );
  }
  return payload as T;
}

export const careerQuestApi = {
  catalog: () => questRequest<QuestCatalog>("/catalog"),
  progression: () => questRequest<QuestProgression>("/progression"),
  runs: () => questRequest<{ runs: QuestRunSummary[] }>("/runs"),
  run: (runId: string) => questRequest<QuestRun>(`/runs/${encodeURIComponent(runId)}`),
  start: (difficulty: DifficultyKey) =>
    questRequest<QuestRun>("/runs", {
      method: "POST",
      body: JSON.stringify({ career_key: "software_engineer", difficulty }),
    }),
  interact: (
    runId: string,
    missionId: string,
    payload: { action: "decision" | "reflection" | "manager_message"; choices?: string[]; text?: string },
  ) =>
    questRequest<QuestRun>(`/runs/${encodeURIComponent(runId)}/missions/${encodeURIComponent(missionId)}/interactions`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  submit: (runId: string, missionId: string, sourceCode: string) =>
    questRequest<{ attempt: QuestAttempt }>(`/runs/${encodeURIComponent(runId)}/missions/${encodeURIComponent(missionId)}/attempts`, {
      method: "POST",
      body: JSON.stringify({ language: "python", source_code: sourceCode, idempotency_key: crypto.randomUUID() }),
    }),
  attempt: (runId: string, attemptId: string) =>
    questRequest<{ attempt: QuestAttempt }>(`/runs/${encodeURIComponent(runId)}/attempts/${encodeURIComponent(attemptId)}`),
  complete: (runId: string, missionId: string) =>
    questRequest<MissionCompletion>(`/runs/${encodeURIComponent(runId)}/missions/${encodeURIComponent(missionId)}/complete`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  abandon: (runId: string) =>
    questRequest<QuestRun>(`/runs/${encodeURIComponent(runId)}/abandon`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  report: (runId: string) => questRequest<QuestReport>(`/runs/${encodeURIComponent(runId)}/report`),
};

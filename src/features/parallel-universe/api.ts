import { ApiError } from "@/lib/api";

type ErrorPayload = { error?: { code?: string; message?: string } };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`/api/backend/parallel-universe${path}`, { ...init, headers, cache: "no-store" });
  } catch {
    throw new ApiError("AI Parallel Universe could not reach SkillBridge. Check that the service is running.", 0, "network_error");
  }
  const payload = (await response.json().catch(() => null)) as T | ErrorPayload | null;
  if (!response.ok) {
    const error = payload as ErrorPayload | null;
    throw new ApiError(error?.error?.message || "The simulation could not be completed.", response.status, error?.error?.code);
  }
  return payload as T;
}

export type SelfProfile = {
  display_name: string;
  headline: string | null;
  education: string[];
  years_experience: number | null;
  career_goal: string | null;
  github_url: string | null;
  github_repository_data_available: boolean;
  interests: string[];
  projects: string[];
  claimed_skills: { name: string; source: string }[];
  demonstrated_skills: { name: string; evidence_count: number }[];
  verified_skills: { name: string; evidence_count: number }[];
  skills_with_insufficient_evidence: { name: string; reason: string }[];
  experience_gaps: string[];
  mock_interviews: { completed: number; scores: { role: string; score: number }[]; average_score: number | null };
  career_quest: { runs: number; coding_attempts: number; average_coding_score: number | null; best_coding_score: number | null; skill_evidence: { skill_key: string; score: number; evidence_count: number }[] };
  digital_twin: { evidence_records: number; skills: { name: string; status: string; proficiency: number; sources: string[] }[] };
  source_availability: Record<string, boolean>;
  simulation_limit?: string;
};

export type Milestone = {
  target: string;
  required_skills: string[];
  action: string;
  evidence: string;
  effort_hours: number;
  dependencies: string[];
  simulated: boolean;
};

export type FutureSelf = {
  id: string;
  name: string;
  direction: string;
  archetype: string;
  personality: string;
  career_strategy: string;
  technical_strengths: string[];
  existing_skills: string[];
  new_skills: string[];
  suggested_projects: string[];
  weaknesses: string[];
  risks: string[];
  why_it_fits: string;
  milestones: { six_months: Milestone; one_year: Milestone; three_years: Milestone };
  supporting_evidence: { type: string; text: string; status: string }[];
};

export type ComparisonPath = {
  future_id: string;
  alignment_score: number;
  score_components: Record<string, number>;
  supported_skills: string[];
  missing_competencies: string[];
  learning_effort_hours: number;
  opportunities: string[];
  risks: string[];
  uncertainties: string[];
};

export type UniverseDebate = {
  turns: { future_id: string; agent_name: string; argument: string; challenge: string; question: string }[];
  summary: { best_arguments: string[]; disagreements: string[]; tradeoffs: string[]; next_action: string; uncertainties: string[] };
  provider: string;
  model: string | null;
};

export type DecisionOutcome = {
  future_id: string;
  stance: "supports" | "neutral" | "questions";
  impact: "high" | "medium" | "low";
  skills_developed: string[];
  tradeoff: string;
  timeline_update: string;
  baseline_alignment: number;
  scenario_alignment: number;
  alignment_delta: number;
};

export type DecisionScenario = {
  scenario_id: string;
  decision: string;
  outcomes: DecisionOutcome[];
  opportunity_cost: string;
  review_point: string;
  provider: string;
  model: string | null;
  created_at?: string;
};

export type Simulation = {
  id: string;
  profile: SelfProfile;
  futures: FutureSelf[];
  comparison: { method: string; scores_are_predictions: boolean; embedding_model: string; paths: ComparisonPath[] };
  provider: string;
  model: string | null;
  created_at: string;
  simulation_notice: string;
  ai_note?: string | null;
  debate?: UniverseDebate | null;
  scenarios?: DecisionScenario[];
};

export const parallelUniverseApi = {
  profile: () => request<SelfProfile>("/profile"),
  sessions: () => request<{ sessions: { id: string; provider: string; model: string | null; created_at: string; future_names: string[]; has_debate: boolean }[] }>("/sessions"),
  session: (id: string) => request<Simulation>(`/sessions/${encodeURIComponent(id)}`),
  create: () => request<Simulation>("/sessions", { method: "POST", body: "{}" }),
  debate: (id: string) => request<UniverseDebate>(`/sessions/${encodeURIComponent(id)}/debate`, { method: "POST", body: "{}" }),
  decide: (id: string, decision: string) => request<DecisionScenario>(`/sessions/${encodeURIComponent(id)}/decisions`, { method: "POST", body: JSON.stringify({ decision }) }),
};

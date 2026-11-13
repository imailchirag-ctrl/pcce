import { ApiError } from "@/lib/api";

type ErrorPayload = { error?: { code?: string; message?: string } };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`/api/backend/${path.replace(/^\/+/, "")}`, { ...init, headers, cache: "no-store" });
  } catch {
    throw new ApiError("SkillBridge could not be reached. Check that the backend is running.", 0, "network_error");
  }
  const payload = (await response.json().catch(() => null)) as T | ErrorPayload | null;
  if (!response.ok) {
    const error = payload as ErrorPayload | null;
    throw new ApiError(error?.error?.message || "The request could not be completed.", response.status, error?.error?.code);
  }
  return payload as T;
}

const post = <T>(path: string, body: unknown = {}) => request<T>(path, { method: "POST", body: JSON.stringify(body) });
const put = <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) });

// ------------------------------------------------------------------ types
export type Tier = "claimed" | "demonstrated" | "verified";

export type Evidence = {
  skill_key: string;
  source_type: string;
  source_ref: string;
  tier: Tier;
  strength: number;
  excerpt: string | null;
  observed_at: string;
};

export type TwinSkill = {
  skill: string;
  display: string;
  category: string;
  status: Tier;
  proficiency: number;
  confidence: number;
  evidence_count: number;
  last_demonstrated_at: string | null;
  related: string[];
  evidence: Evidence[];
  sources: string[];
};

export type Twin = {
  skills: TwinSkill[];
  counts: Record<Tier, number>;
  total: number;
  average_proficiency: number;
  target_role: string | null;
  snapshots: number;
  has_resume: boolean;
};

export type GraphNode = {
  id: string;
  label: string;
  category: string;
  kind: "owned" | "required_missing" | "prerequisite_missing";
  status: Tier | "missing";
  proficiency: number;
  confidence: number;
  required: boolean;
  evidence: Evidence[];
  last_demonstrated_at: string | null;
};

export type SkillGraph = {
  nodes: GraphNode[];
  edges: { source: string; target: string; kind: "prerequisite" | "related" }[];
  missing_prerequisites: { skill: string; display: string; needed_for: string }[];
  role: { role_key: string; title: string; source: string };
};

export type RoleRequirement = {
  skill: string;
  display: string;
  category: string;
  postings: number;
  share: number | null;
  essential: boolean;
  weight: number;
};

export type RoleRequirements = {
  role_key: string;
  title: string;
  summary: string;
  source: "market" | "curated_baseline";
  postings_analyzed: number;
  data_kinds: Record<string, number>;
  requirements: RoleRequirement[];
  related_skills: string[];
  trend: { available: boolean; days: string[]; series: Record<string, number | string>[]; skills?: string[]; note?: string };
  note: string | null;
};

export type RequirementRow = {
  skill: string;
  display: string;
  category: string;
  postings: number;
  share: number | null;
  essential: boolean;
  weight: number;
  state: Tier | "adjacent" | "missing";
  proficiency: number;
  closest_skill: string | null;
  evidence: Evidence[];
};

export type Comparison = {
  role: {
    role_key: string;
    title: string;
    summary: string;
    source: "market" | "curated_baseline";
    postings_analyzed: number;
    data_kinds: Record<string, number>;
    note: string | null;
    related_skills: string[];
  };
  alignment: number;
  requirements: RequirementRow[];
  groups: Record<Tier | "adjacent" | "missing", string[]>;
  method: string;
};

export type NextStep = {
  skill: string;
  display: string;
  action: "learn" | "verify";
  why: string;
  missing_prerequisites: string[];
  resource: { provider: string; url: string; title: string } | null;
};

export type Readiness = {
  question: string;
  verdict: "ready" | "close" | "not_yet";
  label: string;
  alignment: number;
  strengths: string[];
  unverified_claims: string[];
  missing: string[];
  adjacent: string[];
  explanation: string[];
  next_steps: NextStep[];
  comparison: Comparison;
};

export type ChatAnswer = {
  intent: string;
  answer: string;
  facts: string[];
  provider: "deterministic" | "ollama";
  model: string | null;
  llm_note?: string;
};

export type TimelineEvent = {
  kind: string;
  at: string;
  title: string;
  detail: {
    counts?: Record<Tier, number>;
    average_proficiency?: number;
    added?: string[];
    upgraded?: string[];
    removed?: string[];
    skills?: string[];
    tier?: Tier;
    excerpt?: string;
  };
};

export type SkillShare = { skill: string; display: string; category?: string; postings: number; share: number };

export type MarketDashboard = {
  scope: string;
  total_postings: number;
  kinds: Record<string, number>;
  top_skills: SkillShare[];
  frontier: SkillShare[];
  combinations: { skills: [string, string]; postings: number; share: number }[];
  roles: { role_key: string; title: string; postings: number }[];
  entry_level: { postings: number; share: number; top_skills: SkillShare[] };
  trend: { available: boolean; days: string[]; series: Record<string, number | string>[]; skills?: string[]; note?: string };
  recent: {
    title: string;
    company: string | null;
    url: string | null;
    data_kind: string;
    provider: string;
    retrieved_at: string;
    skills: string[];
    role_key: string | null;
  }[];
  provenance: {
    sources: { data_kind: string; provider: string; n: number; last: string }[];
    recent_fetches: { provider: string; query: string; status: string; postings: number; error: string | null; fetched_at: string }[];
    providers: { key: string; label: string; homepage: string }[];
  };
};

export type RefreshResult = { provider: string; label: string; status: "ok" | "failed" | "cached"; error?: string | null; fetched_at: string; new_postings: number };

export type RoleRecommendation = {
  role_key: string;
  title: string;
  score: number;
  alignment: number;
  market_share: number;
  missing: string[];
  reasons: string[];
};

export type JdAnalysis = {
  skills: { skill: string; display: string; category: string; confidence: number; method: string; evidence?: string }[];
  role_key: string;
  keywords: { keywords?: { keyword: string; score: number }[]; method?: string };
  comparison: Comparison;
  note: string;
};

export type ExchangeProfile = {
  visibility: "hidden" | "members";
  display_name: string;
  headline: string | null;
  teach: string[];
  learn: string[];
  tech: string[];
  interests: string[];
  roles: string[];
  availability: string | null;
  level: "beginner" | "intermediate" | "advanced";
  show_evidence: boolean;
  exists?: boolean;
  updated_at?: string | null;
};

export type PublicMember = {
  member_id: string;
  display_name: string;
  headline: string | null;
  teach: string[];
  learn: string[];
  tech: string[];
  interests: string[];
  roles: string[];
  availability: string | null;
  level: string;
  teach_evidence: Record<string, Tier>;
};

export type Match = {
  member: PublicMember;
  score: number;
  reasons: string[];
  they_can_teach: string[];
  you_can_teach: string[];
  mutual: boolean;
};

export type ExchangeRequest = {
  id: string;
  kind: "PROJECT_JOIN" | "PEER_CONNECT";
  project_id: string | null;
  project_title: string | null;
  role: string | null;
  message: string | null;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
  created_at: string;
  decided_at: string | null;
  other: { member_id: string; display_name: string; headline: string | null };
};

export type ProjectSummary = {
  id: string;
  title: string;
  description: string;
  roles: { role: string; skills: string[] }[];
  skills: string[];
  status: string;
  member_count: number;
  is_member: boolean;
  is_owner: boolean;
  fit: { overlap: string[]; score: number };
  created_at: string;
};

export type ProjectDetail = {
  id: string;
  title: string;
  description: string;
  created_at: string;
  roles: { role: string; skills: string[] }[];
  skills: string[];
  status: string;
  is_owner: boolean;
  is_member: boolean;
  pending_request?: boolean;
  team: { member_id: string; display_name: string; role: string; responsibility: string | null; joined_at: string; is_you: boolean }[];
  milestones?: { id: string; title: string; due_date: string | null; done: number }[];
  tasks?: { id: string; title: string; skills: string[]; assignee_id: string | null; status: "TODO" | "DOING" | "DONE"; milestone_id: string | null }[];
  contributions?: { id: string; member_id: string; display_name: string | null; summary: string; skills: string[]; created_at: string; peer_confirmed: boolean }[];
};

// -------------------------------------------------------------------- api
export const intelligenceApi = {
  twin: () => request<Twin>("twin"),
  rebuild: () => post<Twin>("twin/rebuild"),
  graph: (role?: string) => request<SkillGraph>(`twin/graph${role ? `?role=${encodeURIComponent(role)}` : ""}`),
  timeline: () => request<{ events: TimelineEvent[] }>("twin/timeline"),
  readiness: (question: string, role?: string) => post<Readiness>("twin/readiness", { question, role }),
  chat: (question: string, useLlm: boolean) => post<ChatAnswer>("twin/chat", { question, use_llm: useLlm }),

  roles: () => request<{ roles: { role_key: string; title: string }[] }>("market/roles"),
  dashboard: (scope = "market") => request<MarketDashboard>(`market/dashboard?scope=${scope}`),
  refresh: (query: string, force = false) => post<{ results: RefreshResult[]; dashboard: MarketDashboard }>("market/refresh", { query, force }),
  role: (roleKey: string) => request<{ requirements: RoleRequirements; comparison: Comparison }>(`market/role/${encodeURIComponent(roleKey)}`),
  analyzeJd: (title: string, text: string, role?: string) => post<JdAnalysis>("market/analyze-jd", { title, text, role }),
  recommendations: () => request<{ roles: RoleRecommendation[] }>("market/recommendations"),

  exchangeProfile: () =>
    request<{ profile: ExchangeProfile; suggestions: { teach: string[]; teach_tiers: Record<string, Tier>; learn: string[]; target_role: string | null } }>(
      "exchange/profile",
    ),
  saveExchangeProfile: (profile: ExchangeProfile) => put<{ profile: ExchangeProfile }>("exchange/profile", profile),
  matches: () =>
    request<{ matches: Match[]; method: string | null; note?: string; your_learning_goals?: string[]; gap_skills_from_twin?: string[] }>(
      "exchange/matches",
    ),
  connect: (memberId: string, message: string) => post<{ id: string }>("exchange/connect", { member_id: memberId, message }),
  requests: () => request<{ incoming: ExchangeRequest[]; outgoing: ExchangeRequest[] }>("exchange/requests"),
  decide: (id: string, accept: boolean) => post(`exchange/requests/${id}/decision`, { accept }),
  withdraw: (id: string) => post(`exchange/requests/${id}/withdraw`),
  block: (memberId: string) => post("exchange/block", { member_id: memberId }),
  unblock: (memberId: string) => post("exchange/unblock", { member_id: memberId }),
  blocks: () => request<{ blocked: { member_id: string; display_name: string }[] }>("exchange/blocks"),
  report: (targetType: "user" | "project", targetId: string, reason: string) =>
    post("exchange/report", { target_type: targetType, target_id: targetId, reason }),
  projects: () => request<{ mine: ProjectSummary[]; discover: ProjectSummary[] }>("exchange/projects"),
  createProject: (body: { title: string; description: string; roles: { role: string; skills: string[] }[]; skills: string[] }) =>
    post<ProjectDetail>("exchange/projects", body),
  project: (id: string) => request<ProjectDetail>(`exchange/projects/${id}`),
  updateProject: (id: string, body: { status?: "OPEN" | "CLOSED"; responsibilities?: { member_id: string; responsibility: string }[] }) =>
    patch<ProjectDetail>(`exchange/projects/${id}`, body),
  join: (id: string, role: string, message: string) => post(`exchange/projects/${id}/join`, { role, message }),
  candidates: (id: string) =>
    request<{ candidates: { member: PublicMember; covers: string[]; suggested_role: string | null; score: number }[] }>(
      `exchange/projects/${id}/candidates`,
    ),
  addMilestone: (id: string, title: string, dueDate?: string) =>
    post<ProjectDetail>(`exchange/projects/${id}/milestones`, { title, due_date: dueDate || null }),
  toggleMilestone: (id: string, milestoneId: string, done: boolean) =>
    patch<ProjectDetail>(`exchange/projects/${id}/milestones/${milestoneId}`, { done }),
  addTask: (id: string, body: { title: string; skills: string[]; assignee_id?: string | null; milestone_id?: string | null }) =>
    post<ProjectDetail>(`exchange/projects/${id}/tasks`, body),
  updateTask: (id: string, taskId: string, body: { status?: "TODO" | "DOING" | "DONE"; assignee_id?: string | null }) =>
    patch<ProjectDetail>(`exchange/projects/${id}/tasks/${taskId}`, body),
};

export function errorMessage(error: unknown, fallback = "Something went wrong."): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export const TIER_STYLE: Record<Tier | "missing" | "adjacent", { label: string; dot: string; chip: string }> = {
  verified: { label: "Verified", dot: "#2E7D32", chip: "border-[#2E7D32]/30 bg-[#2E7D32]/10 text-[#2E7D32]" },
  demonstrated: { label: "Demonstrated", dot: "#E99A32", chip: "border-[#E99A32]/40 bg-[#E99A32]/15 text-[#75451F]" },
  claimed: { label: "Claimed", dot: "#B9AE9C", chip: "border-[#EDE6DA] bg-[#FFFCF6] text-[#6F675C]" },
  adjacent: { label: "Adjacent", dot: "#F4B942", chip: "border-[#F4B942]/50 bg-[#F4B942]/15 text-[#75451F]" },
  missing: { label: "Missing", dot: "#C62828", chip: "border-[#C62828]/25 bg-[#C62828]/8 text-[#C62828]" },
};

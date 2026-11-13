export type DifficultyKey = "beginner" | "intermediate" | "advanced";

export type CareerOption = {
  key: string;
  title: string;
  summary?: string;
  available: boolean;
  skills?: string[];
};

export type QuestCatalog = {
  catalog_version: string;
  careers: CareerOption[];
  difficulties: Record<DifficultyKey, { label: string; description: string }>;
  mission_types: string[];
  duration_minutes: number;
  practice_notice: string;
  ai_status: {
    models: Record<string, { model: string; available: boolean; error?: string | null }>;
    minilm_skill_matching: { model: string; enabled: boolean; loaded: boolean; note: string };
    routing: string;
  };
};

export type QuestAttempt = {
  id: string;
  mission_id: string;
  attempt_number: number;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "UNAVAILABLE" | "FAILED" | string;
  score: number | null;
  result: {
    passed_tests?: number;
    total_tests?: number;
    score?: number;
    failure_categories?: string[];
    feedback?: string;
    source_retained?: false;
  } | null;
  created_at: string;
  updated_at: string;
};

export type QuestMission = {
  id: string;
  sequence: number;
  status: "LOCKED" | "AVAILABLE" | "COMPLETED" | string;
  started_at: string | null;
  completed_at: string | null;
  score: Record<string, unknown> | null;
  mission: {
    key: string;
    type: "debugging" | "feature" | "incident" | string;
    title: string;
    subtitle: string;
    brief: string;
    objectives: string[];
    skills: string[];
    timebox_minutes: number;
    starter_code: string;
    public_examples: { input: unknown; output: unknown }[];
    decisions: { key: string; label: string }[];
    decision_prompt: string;
    manager_opening: string;
    manager_fallback: string;
    difficulty: DifficultyKey;
  };
};

export type QuestInteraction = {
  id: string;
  mission_id: string;
  actor: "manager" | "player" | string;
  type: string;
  content: string;
  choices: string[];
  provider: string;
  created_at: string;
};

export type QuestCompany = {
  name: string;
  industry: string;
  mission: string;
  manager: { name: string; role: string };
  team: { name: string; role: string }[];
  role: string;
  deadline: string;
  briefing: string;
};

export type QuestRun = {
  id: string;
  career_key: string;
  career_title: string;
  difficulty: DifficultyKey;
  status: "IN_PROGRESS" | "COMPLETED" | "ABANDONED" | string;
  catalog_version: string;
  company: QuestCompany;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  progress: { completed: number; total: number; percent: number };
  current_mission_id: string | null;
  missions: QuestMission[];
  interactions: QuestInteraction[];
  attempts: QuestAttempt[];
  report_available: boolean;
};

export type QuestRunSummary = {
  id: string;
  career_key: string;
  career_title: string;
  difficulty: DifficultyKey;
  status: string;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  completed_missions: number;
  total_missions: number;
  current_mission_title: string | null;
  resume_allowed: boolean;
};

export type QuestAchievement = {
  achievement_key: string;
  run_id: string;
  awarded_at: string;
  evidence: Record<string, unknown>;
};

export type QuestProgression = {
  xp_total: number;
  level: number;
  xp_into_level: number;
  xp_to_next_level: number;
  next_level_total_xp: number;
  completed_missions: number;
  achievements: QuestAchievement[];
  skills: { skill_key: string; score: number; evidence_count: number }[];
  recent_xp_events: { xp_delta: number; reason: string; created_at: string }[];
};

export type QuestRoadmapItem = {
  skill: string;
  title: string;
  resource: string;
  resource_url: string | null;
  provider: string;
  estimated_hours: number;
  practice_task: string;
};

export type QuestReport = {
  type: "practice_simulation";
  title: string;
  catalog_version?: string;
  rubric_version?: string;
  overall_score: number;
  career_readiness?: { band: string; label: string; summary: string };
  mission_completion?: { completed: number; total: number };
  dimensions: Record<string, number>;
  score_methodology: Record<string, unknown>;
  mission_evidence: { mission_id: string; title: string; score: Record<string, unknown> }[];
  skills_demonstrated: { skill: string; score: number; evidence_count: number }[];
  skills_requiring_improvement: { skill: string; score: number; evidence_count: number }[];
  recommended_learning_roadmap: { skill: string; recommendation: string; evidence_score: number }[];
  skillbridge_learning_roadmap?: {
    target_role: string;
    items: QuestRoadmapItem[];
    weekly_focus: string[];
    total_hours: number;
    notice: string;
  } | null;
};

export type MissionCompletion = {
  run: QuestRun;
  mission_score: Record<string, unknown>;
  xp_earned: number;
  progression: QuestProgression;
  report: QuestReport | null;
};

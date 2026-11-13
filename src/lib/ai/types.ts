export type SkillDetail = {
  skill: string;
  display: string;
  category: string;
  confidence: number;
  method: "alias_match" | "minilm_semantic" | string;
  evidence: string;
};

export type SkillMatchItem = {
  skill: string;
  display: string;
  confidence: number;
  method: string;
  closest_skill?: string | null;
};

export type SkillMatchResult = {
  matched: SkillMatchItem[];
  partial: SkillMatchItem[];
  missing: SkillMatchItem[];
  matched_names: string[];
  partial_names: string[];
  missing_names: string[];
  coverage: number;
  weighted_coverage: number;
};

export type ResumeAnalysis = {
  profile: {
    name: string;
    headline: string;
    email: string | null;
    phone: string | null;
    links: Record<string, string>;
    location: string | null;
    summary: string | null;
  };
  skills: SkillDetail[];
  detected_skills: string[];
  skill_names: string[];
  skills_by_category: Record<string, string[]>;
  target_role: string;
  target_role_key: string;
  role_summary: string;
  required_skills: string[];
  required_skill_keys: string[];
  job_description_skills: string[];
  match: SkillMatchResult;
  matched_skills: string[];
  partial_skills: string[];
  missing_skills: string[];
  skill_match_percent: number;
  weighted_match_percent: number;
  jd_semantic_similarity: number;
  experience: {
    lines: string[];
    titles: string[];
    companies: string[];
    date_ranges: string[];
    years: number;
    present: boolean;
  };
  education: {
    degrees: string[];
    institutions: string[];
    lines: string[];
    latest_year: number | null;
    present: boolean;
  };
  projects: { lines: string[]; count: number; present: boolean };
  certifications: { lines: string[]; present: boolean };
  sections: Record<string, string[]>;
  section_names: string[];
  entities: {
    persons: string[];
    organizations: string[];
    locations: string[];
    dates: string[];
  };
  keywords: {
    keywords: { term: string; score: number }[];
    method: string;
  };
  ats: {
    score: number;
    checks: Record<string, boolean>;
    recommendations: string[];
    word_count: number;
    quantified_achievements: number;
    action_verb_hits: number;
  };
  readiness: {
    score: number;
    contributing_weights: Record<string, number>;
    breakdown: Record<string, number>;
    explanation: string;
  };
  career_recommendations: {
    role: string;
    title: string;
    summary: string;
    fit_percent: number;
    matched_skills: string[];
    to_build: string[];
  }[];
  inference: {
    elapsed_ms: number;
    embedding_model: string;
    ner_model: string;
    keyword_method: string;
    skill_methods: { alias_matches: number; semantic_matches: number };
    llm_used: boolean;
  };
  notices: string[];
};

export type ResumeUploadResult = {
  resume_id: string;
  analysis: ResumeAnalysis;
  text_preview: string;
  document: {
    filename: string;
    bytes: number;
    parser: string;
    characters: number;
  };
  elapsed_ms: number;
};

export type JobMatch = {
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
  match_percent: number;
  skill_coverage: number;
  semantic_similarity: number;
  matched_skills: string[];
  partial_skills: { skill: string; confidence: number }[];
  missing_skills: string[];
  matched_skill_keys: string[];
  missing_skill_keys: string[];
  explainability: {
    method: string;
    weights: Record<string, number>;
  };
  rerank_score?: number;
};

export type JobMatchResponse = {
  jobs: JobMatch[];
  count: number;
  candidate_skills: string[];
  method: string;
  reranker: { method: string; notice?: string };
  inference_ms: number;
  notice: string;
};

export type RoadmapItem = {
  id: string;
  skill: string;
  skill_key: string;
  title: string;
  objective: string;
  why_it_matters: string;
  resource: string;
  resource_url: string | null;
  provider: string;
  difficulty: string;
  estimated_hours: number;
  practice_task: string;
  completed: boolean;
};

export type CourseRecommendation = {
  id: string;
  title: string;
  provider: string;
  url: string | null;
  skill: string;
  skill_key: string;
  price: string;
  level: string;
  duration_hours: number;
  reason: string;
};

export type RoadmapResponse = {
  target_role: string;
  items: RoadmapItem[];
  courses: CourseRecommendation[];
  projects: {
    title: string;
    description: string;
    skills: string[];
    estimated_hours: number;
    difficulty: string;
  }[];
  weekly_focus: string[];
  total_hours: number;
  provider: string;
  llm: {
    used_llm: boolean;
    provider?: string;
    model?: string;
    elapsed_ms?: number;
    error?: string | null;
  };
  inference_ms: number;
  notice: string;
};

export type InterviewQuestion = {
  id?: string;
  prompt: string;
  topic?: string;
  why?: string;
  sequence?: number;
};

export type InterviewQuestionsResponse = {
  role: string;
  mode: string;
  difficulty: string;
  questions: InterviewQuestion[];
  provider: string;
  session_id?: string;
  llm: {
    used_llm: boolean;
    provider?: string;
    model?: string;
    elapsed_ms?: number;
    error?: string | null;
    notice?: string;
  };
  inference_ms: number;
  notice: string;
};

export type InterviewEvaluation = {
  overall: number;
  dimensions: Record<string, number>;
  weights: Record<string, number>;
  word_count: number;
  strengths: string[];
  improvements: string[];
  rubric: string;
  llm: {
    used_llm: boolean;
    provider?: string;
    model?: string;
    elapsed_ms?: number;
    error?: string | null;
  };
  inference_ms: number;
  method: string;
  notice: string;
};

export type ModelStatus = {
  models: {
    id: string;
    task: string;
    kind: string;
    loaded: boolean;
    load_ms?: number | null;
    avg_inference_ms?: number | null;
    calls?: number;
    dimension?: number | null;
    cache_mb?: number;
    reachable?: boolean;
    enabled?: boolean;
    installed_models?: string[];
    error?: string | null;
  }[];
  ollama: {
    configured: boolean;
    reachable: boolean;
    model: string;
    available: boolean;
    models: string[];
    error: string | null;
  };
  hardware: {
    device: string;
    embedding_model: string;
    reranker_enabled: boolean;
    whisper_enabled: boolean;
  };
  notices: string[];
};

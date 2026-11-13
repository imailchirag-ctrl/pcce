export interface SampleSkill {
  name: string;
  value: number;
  color: string;
}

export interface SampleJob {
  role: string;
  company: string;
  match: number;
  missingSkills?: string[];
}

export interface SampleDashboardPreviewData {
  readinessScore: number;
  targetRole: string;
  skillsToImproveCount: number;
  skills: SampleSkill[];
  matchedJobs: SampleJob[];
  roadmapCompletedModules: number;
  roadmapTotalModules: number;
  roadmapPercent: number;
  interviewCompletedQuestions: number;
  interviewTotalQuestions: number;
  interviewPercent: number;
}

export const SAMPLE_DASHBOARD_PREVIEW: SampleDashboardPreviewData = {
  readinessScore: 82,
  targetRole: "Data Analyst",
  skillsToImproveCount: 3,
  skills: [
    { name: "Python", value: 90, color: "#F4B942" },
    { name: "SQL", value: 70, color: "#F4B942" },
    { name: "System design", value: 40, color: "#E99A32" },
    { name: "Docker", value: 20, color: "#E99A32" },
  ],
  matchedJobs: [
    { role: "Data Analyst", company: "Metro Financial", match: 88, missingSkills: ["Docker"] },
    { role: "Backend Developer", company: "Acme Cloud", match: 74, missingSkills: ["Kubernetes", "gRPC"] },
  ],
  roadmapCompletedModules: 4,
  roadmapTotalModules: 9,
  roadmapPercent: 44,
  interviewCompletedQuestions: 6,
  interviewTotalQuestions: 10,
  interviewPercent: 60,
};

export interface LandingFeature {
  iconName: "FileText" | "BarChart3" | "BriefcaseBusiness" | "Map" | "MessageSquareQuote" | "Target";
  title: string;
  text: string;
}

export const LANDING_FEATURES: LandingFeature[] = [
  {
    iconName: "FileText",
    title: "Resume intelligence",
    text: "Extract your skills, experience, and keywords automatically to uncover your market readiness.",
  },
  {
    iconName: "BarChart3",
    title: "Skill gap detection",
    text: "Compare your profile against target roles and discover exactly what skills are missing or partial.",
  },
  {
    iconName: "BriefcaseBusiness",
    title: "Job matching",
    text: "Browse roles ranked with explainable match percentages based on your verified skillset.",
  },
  {
    iconName: "Map",
    title: "Learning roadmap",
    text: "Follow a step-by-step personalized learning path to efficiently close critical skill gaps.",
  },
  {
    iconName: "MessageSquareQuote",
    title: "Mock interviews",
    text: "Rehearse role-specific technical and behavioral questions with instant AI-powered feedback.",
  },
  {
    iconName: "Target",
    title: "Application tracking",
    text: "Track every job application, interview stage, and recruiter update in one streamlined pipeline.",
  },
];

export interface LandingStep {
  n: string;
  title: string;
  text: string;
}

export const LANDING_STEPS: LandingStep[] = [
  {
    n: "01",
    title: "Upload your resume",
    text: "Drop in your resume and choose your desired role to initiate deep skill extraction.",
  },
  {
    n: "02",
    title: "See your skill gap",
    text: "Review your readiness score, matched capabilities, and prioritized missing skills.",
  },
  {
    n: "03",
    title: "Follow your roadmap",
    text: "Learn through curated milestones and resources tailored to your exact career goals.",
  },
  {
    n: "04",
    title: "Practice & apply",
    text: "Simulate real interview questions, track applications, and land your next position.",
  },
];

export interface LandingFaq {
  question: string;
  answer: string;
}

export const LANDING_FAQS: LandingFaq[] = [
  {
    question: "What is SkillBridge AI?",
    answer: "SkillBridge AI is a comprehensive career intelligence workspace that analyzes your resume, calculates role readiness, generates custom learning roadmaps, and coaches you through mock interviews.",
  },
  {
    question: "Can recruiters use SkillBridge AI?",
    answer: "Yes! SkillBridge AI includes a dedicated recruiter workspace to publish job postings, discover matching candidates, and manage your hiring pipeline.",
  },
  {
    question: "How does the skill gap analysis work?",
    answer: "Our system extracts skills from your resume and matches them against role requirements and job descriptions to classify skills into matched, partial, or missing categories.",
  },
  {
    question: "Is my resume data kept private?",
    answer: "Yes. Your resume documents and analyses remain strictly private to your authenticated account and are never shared publicly without your explicit consent.",
  },
  {
    question: "Can I sign in with Google?",
    answer: "Yes! SkillBridge supports seamless, secure sign-in with Google in addition to standard email and password authentication.",
  },
];

export const NAV_ITEMS_CANDIDATE = [
  { href: "/dashboard", label: "Overview", iconName: "LayoutDashboard" },
  { href: "/resume", label: "Resume intelligence", iconName: "FileText" },
  { href: "/career", label: "Career match", iconName: "Sparkles" },
  { href: "/learn", label: "Learning hub", iconName: "GraduationCap" },
  { href: "/interviews", label: "Mock interviews", iconName: "MessageSquareText" },
  { href: "/jobs", label: "Explore jobs", iconName: "BriefcaseBusiness" },
  { href: "/applications", label: "Applications", iconName: "Bookmark" },
] as const;

export const NAV_ITEMS_RECRUITER = [
  { href: "/recruiter", label: "Overview", iconName: "LayoutDashboard" },
  { href: "/recruiter/jobs", label: "Manage jobs", iconName: "BriefcaseBusiness" },
  { href: "/recruiter/candidates", label: "Candidates", iconName: "Users" },
  { href: "/recruiter/pipeline", label: "Pipeline", iconName: "Activity" },
] as const;

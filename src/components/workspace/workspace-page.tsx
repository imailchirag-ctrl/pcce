"use client";

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
  | "pipeline";

const PAGE_MAP: Record<WorkspaceMode, React.ComponentType<any>> = {
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
};

export function WorkspacePage({ mode }: { mode: WorkspaceMode }) {
  const Page = PAGE_MAP[mode];
  if (!Page) return <div className="p-4 text-xs text-muted-foreground">Unknown workspace mode.</div>;
  return <Page />;
}

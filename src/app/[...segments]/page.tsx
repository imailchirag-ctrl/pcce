import { notFound } from "next/navigation";
import { AuthFlow, type AuthMode } from "@/components/auth/auth-flow";
import { LandingPage } from "@/components/landing/landing-page";
import { WorkspacePage, type WorkspaceMode } from "@/components/workspace/workspace-page";

type RouteProps = { params: Promise<{ segments: string[] }> };

export default async function RoutedPage({ params }: RouteProps) {
  const { segments } = await params;
  const path = `/${segments.join("/")}`;
  const authRoutes: Record<string, AuthMode> = {
    "/auth/role": "role",
    "/auth/signup": "signup",
    "/auth/signup/recruiter": "recruiterSignup",
    "/auth/login": "login",
    "/auth/forgot": "forgot",
    "/auth/setup": "setup",
    "/login": "login",
    "/signup": "signup",
  };
  const workspaceRoutes: Record<string, WorkspaceMode> = {
    "/dashboard": "dashboard",
    "/dashboard/resume": "resume",
    "/dashboard/career": "career",
    "/dashboard/skills": "career",
    "/dashboard/learning": "learn",
    "/dashboard/courses": "learn",
    "/dashboard/quizzes": "learn",
    "/dashboard/interviews": "interviews",
    "/dashboard/interviews/report": "report",
    "/dashboard/jobs": "jobs",
    "/dashboard/applications": "applications",
    "/dashboard/profile": "dashboard",
    "/resume": "resume",
    "/career": "career",
    "/learn": "learn",
    "/interviews": "interviews",
    "/interviews/session": "session",
    "/interviews/report": "report",
    "/jobs": "jobs",
    "/applications": "applications",
    "/recruiter": "recruiter",
    "/recruiter/jobs": "recruiterJobs",
    "/recruiter/candidates": "candidates",
    "/recruiter/pipeline": "pipeline",
    "/recruiter/jobs/new": "recruiterJobs",
    "/recruiter/applications": "pipeline",
    "/recruiter/analytics": "recruiter",
    "/recruiter/profile": "recruiter",
  };
  if (authRoutes[path]) return <AuthFlow mode={authRoutes[path]} />;
  if (workspaceRoutes[path]) return <WorkspacePage mode={workspaceRoutes[path]} />;
  if (path === "/about" || path === "/features") return <LandingPage />;
  notFound();
}

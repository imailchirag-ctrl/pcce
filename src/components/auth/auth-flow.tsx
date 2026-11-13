"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-provider";

export type AuthMode = "role" | "signup" | "recruiterSignup" | "login" | "forgot" | "setup";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.97 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

const ERROR_MESSAGES: Record<string, string> = {
  google_cancelled: "Google sign-in was cancelled.",
  google_not_configured: "Google sign-in is not configured yet. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and the matching INTERNAL_API_SECRET in both app environments.",
  google_email_unverified: "Your Google account email is not verified.",
  google_state_mismatch: "Security validation failed. Please try signing in again.",
  google_token_failed: "Unable to retrieve credentials from Google. Please try again.",
  google_account_failed: "Could not create or link your account with Google.",
  google_unavailable: "Google authentication service is currently unreachable.",
  backend_unavailable: "The API service is not running. Start the app with npm run dev:all.",
};

function AuthFrame({
  children,
  title,
  detail,
  back = "/",
}: {
  children: React.ReactNode;
  title: string;
  detail: string;
  back?: string;
}) {
  return (
    <main className="grid min-h-screen bg-[#FFFCF6] lg:grid-cols-[0.85fr_1.15fr]">
      {/* Left side: Warm / Cream info panel */}
      <aside className="relative hidden overflow-hidden border-r border-[#EDE6DA] bg-[#FFF5E5] p-10 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-20 size-[380px] rounded-full bg-[#F4B942]/15 blur-3xl pointer-events-none" />
        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-2.5 font-display text-[17px] font-bold tracking-tight text-[#24211D]">
            <span className="grid size-9 place-items-center rounded-xl bg-[#F4B942] text-[#75451F] shadow-sm">
              <Sparkles size={18} />
            </span>
            SkillBridge <span className="text-[#E99A32]">AI</span>
          </Link>
        </div>

        <div className="relative max-w-md my-auto py-10">
          <span className="grid size-12 place-items-center rounded-2xl bg-white border border-[#EDE6DA] text-[#75451F] shadow-sm">
            <Sparkles size={22} className="text-[#E99A32]" />
          </span>
          <h2 className="mt-6 font-display text-3xl font-bold leading-tight tracking-tight text-[#24211D]">
            Turn your next career step into an actionable plan.
          </h2>
          <p className="mt-3.5 text-sm leading-relaxed text-[#6F675C]">
            Understand your strengths, identify missing capabilities, practice mock interviews, and step into new roles with total confidence.
          </p>

          <div className="mt-7 rounded-2xl border border-[#EDE6DA] bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-[#FFF5E5] text-[#75451F]">
                <Check size={18} strokeWidth={2.5} />
              </span>
              <div>
                <p className="text-xs font-bold text-[#24211D]">Real-time intelligence</p>
                <p className="mt-0.5 text-[11px] text-[#6F675C]">
                  Sign in to analyze resumes, track skill gaps, and view matched jobs.
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="relative text-xs text-[#6F675C]">
          SkillBridge AI · Secure cookie session & Google OAuth
        </p>
      </aside>

      {/* Right side: Form container */}
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 bg-[#FFFCF6]">
        <div className="w-full max-w-[420px]">
          <Link
            href={back}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6F675C] hover:text-[#24211D] transition-colors"
          >
            <ArrowLeft size={14} /> Back
          </Link>

          <Link href="/" className="mt-5 flex items-center gap-2 font-display text-base font-bold text-[#24211D] lg:hidden">
            <span className="grid size-8 place-items-center rounded-lg bg-[#F4B942] text-[#75451F]">
              <Sparkles size={16} />
            </span>
            SkillBridge AI
          </Link>

          <div className="mt-5">
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#24211D]">{title}</h1>
            <p className="mt-1 text-xs text-[#6F675C]">{detail}</p>
          </div>

          {children}
        </div>
      </section>
    </main>
  );
}

function AuthFlowInner({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { googleAvailable, reloadSession } = useWorkspace();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("candidate");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const urlError = searchParams.get("error");
  const queryError = urlError ? (ERROR_MESSAGES[urlError] || `Authentication error: ${urlError}`) : "";

  const signup = mode === "signup" || mode === "recruiterSignup";
  const recruiter = mode === "recruiterSignup";
  const title = signup
    ? (recruiter ? "Create recruiter account" : "Create your account")
    : (mode === "role" ? "Choose your workspace" : "Welcome back");
  const detail = signup
    ? (recruiter
        ? "Start reviewing candidates and managing your hiring pipeline."
        : "Your next career step starts with a few simple details.")
    : (mode === "role" ? "What brings you to SkillBridge today?" : "Log in to continue to your SkillBridge workspace.");

  const clear = () => { setError(""); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clear();
    setBusy(true);
    try {
      if (signup) {
        await authApi.register({
          name,
          email,
          password,
          role: role as "candidate" | "recruiter",
          company: company || undefined,
        });
      } else {
        await authApi.login({ email, password });
      }
      await reloadSession();
      const session = await authApi.session();
      const user = (session as { user: { role: string; onboarded: boolean } | null }).user;
      if (!user) throw new Error("Signed in but session could not be confirmed.");
      const destination = user.role === "recruiter" ? "/recruiter" : user.onboarded ? "/dashboard" : "/onboarding";
      router.replace(destination);
    } catch (err: any) {
      setError(err?.message || "Authentication failed. Please check your details and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (mode === "role") {
    return (
      <AuthFrame title={title} detail={detail} back="/">
        <div className="mt-6 space-y-3">
          <Link
            href="/auth/signup"
            className="group flex items-center gap-4 rounded-2xl border border-[#EDE6DA] bg-white p-4 shadow-sm hover:border-[#F4B942] hover:bg-[#FFF5E5] transition-all"
          >
            <span className="grid size-11 place-items-center rounded-xl bg-[#FFF5E5] text-[#75451F] group-hover:bg-[#F4B942]">
              <UserRound size={20} />
            </span>
            <span className="flex-1">
              <b className="block text-sm font-bold text-[#24211D]">I'm building my career</b>
              <small className="text-xs text-[#6F675C]">Resume analysis, skill gaps, learning roadmaps, mock interviews.</small>
            </span>
            <ArrowRight size={16} className="shrink-0 text-[#75451F] transition group-hover:translate-x-1" />
          </Link>

          <Link
            href="/auth/signup/recruiter"
            className="group flex items-center gap-4 rounded-2xl border border-[#EDE6DA] bg-white p-4 shadow-sm hover:border-[#F4B942] hover:bg-[#FFF5E5] transition-all"
          >
            <span className="grid size-11 place-items-center rounded-xl bg-[#FFF5E5] text-[#75451F] group-hover:bg-[#F4B942]">
              <Users size={20} />
            </span>
            <span className="flex-1">
              <b className="block text-sm font-bold text-[#24211D]">I'm hiring talent</b>
              <small className="text-xs text-[#6F675C]">Job management, candidate matching, application pipelines.</small>
            </span>
            <ArrowRight size={16} className="shrink-0 text-[#75451F] transition group-hover:translate-x-1" />
          </Link>

          <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-[#6F675C]">
            <span className="h-px flex-1 bg-[#EDE6DA]" />or<span className="h-px flex-1 bg-[#EDE6DA]" />
          </div>

          <Link
            href="/auth/login"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#EDE6DA] bg-white px-4 py-3 text-xs font-semibold text-[#24211D] hover:bg-[#FFF5E5] transition"
          >
            Already have an account? Sign in <ArrowRight size={14} />
          </Link>
        </div>
      </AuthFrame>
    );
  }

  const activeError = error || queryError;

  return (
    <AuthFrame title={title} detail={detail} back={signup ? "/auth/role" : "/"}>
      {activeError && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-[#C62828]/25 bg-[#C62828]/10 p-3 text-xs font-medium text-[#C62828]"
        >
          {activeError}
        </div>
      )}

      {googleAvailable && (
        <div className="mt-5">
          <a
            href="/api/auth/google/start"
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-[#EDE6DA] bg-white px-4 py-2.5 text-xs font-semibold text-[#24211D] shadow-sm hover:bg-[#FFF5E5] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4B942]"
            aria-label="Continue with Google"
          >
            <GoogleIcon />
            <span>Continue with Google</span>
          </a>

          <div className="my-4 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-[#6F675C]">
            <span className="h-px flex-1 bg-[#EDE6DA]" />
            or
            <span className="h-px flex-1 bg-[#EDE6DA]" />
          </div>
        </div>
      )}

      <form className="space-y-4" onSubmit={handleSubmit}>
        {signup && (
          <>
            <div>
              <label className="block text-xs font-semibold text-[#24211D]">
                {recruiter ? "Full name" : "Your name"}
              </label>
              <div className="relative mt-1.5">
                <UserRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#75451F]" />
                <input
                  required
                  className="input pl-9"
                  placeholder="Alex Morgan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

            {recruiter && (
              <div>
                <label className="block text-xs font-semibold text-[#24211D]">Company name</label>
                <input
                  className="input mt-1.5"
                  placeholder="e.g. Acme Corp"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
            )}
          </>
        )}

        <div>
          <label className="block text-xs font-semibold text-[#24211D]">Email address</label>
          <div className="relative mt-1.5">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#75451F]" />
            <input
              required
              type="email"
              className="input pl-9"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#24211D]">Password</label>
          <div className="relative mt-1.5">
            <LockKeyhole size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#75451F]" />
            <input
              required
              type={showPassword ? "text" : "password"}
              minLength={signup ? 8 : 1}
              maxLength={200}
              className="input pl-9 pr-10"
              placeholder={signup ? "At least 8 characters" : "Enter your password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6F675C] hover:text-[#24211D]"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {!signup && (
          <div className="-mt-1 flex justify-end">
            <Link href="/auth/forgot" className="text-xs font-semibold text-[#75451F] hover:text-[#E99A32]">
              Forgot password?
            </Link>
          </div>
        )}

        <Button type="submit" className="w-full mt-2" disabled={busy}>
          {busy ? (
            <><ArrowRight size={14} className="animate-spin" /> {signup ? "Creating account…" : "Signing in…"}</>
          ) : (
            signup ? "Create account" : "Sign in"
          )}
        </Button>

        {signup && (
          <p className="text-center text-[11px] leading-4 text-[#6F675C]">
            By continuing, you agree to the Terms of Service and Privacy Policy.
          </p>
        )}

        <p className="mt-5 text-center text-xs text-[#6F675C]">
          {signup ? "Already have an account?" : "New to SkillBridge?"}{" "}
          <Link
            href={signup ? "/auth/login" : "/auth/role"}
            className="font-bold text-[#75451F] hover:text-[#E99A32]"
          >
            {signup ? "Sign in" : "Choose a workspace"}
          </Link>
        </p>
      </form>
    </AuthFrame>
  );
}

export function AuthFlow({ mode }: { mode: AuthMode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#FFFCF6]" />}>
      <AuthFlowInner mode={mode} />
    </Suspense>
  );
}

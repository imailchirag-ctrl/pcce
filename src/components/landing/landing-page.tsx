"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Check,
  FileText,
  GraduationCap,
  Map,
  MessageSquareQuote,
  Sparkles,
  Target,
  UploadCloud,
} from "lucide-react";
import type { ReactNode } from "react";

import { useWorkspace } from "@/lib/workspace-provider";
import {
  LANDING_FAQS,
  LANDING_FEATURES,
  LANDING_STEPS,
  SAMPLE_DASHBOARD_PREVIEW,
} from "@/lib/sample-data";

const iconMap = {
  FileText,
  BarChart3,
  BriefcaseBusiness,
  Map,
  MessageSquareQuote,
  Target,
};

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

function Bar({ value, color, delay = 0 }: { value: number; color: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#FFF5E5]">
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={reduce ? false : { width: 0 }}
        whileInView={{ width: `${value}%` }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay, ease: "easeOut" }}
      />
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const reduce = useReducedMotion();
  const r = 40;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative size-24 shrink-0" role="img" aria-label={`Readiness score: ${score}%`}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#FFF5E5" strokeWidth="9" />
        <motion.circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#F4B942"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={reduce ? false : { strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - score / 100) }}
          transition={{ duration: 1.1, delay: 0.2, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-xl font-bold text-[#24211D]">{score}%</span>
      </div>
    </div>
  );
}

function FloatChip({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={`absolute hidden items-center gap-2 rounded-xl border border-[#EDE6DA] bg-white px-3 py-2 text-xs font-semibold text-[#24211D] shadow-lg md:flex ${className}`}
      animate={reduce ? undefined : { y: [0, -5, 0] }}
      transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay }}
    >
      {children}
    </motion.div>
  );
}

function DashboardPreview() {
  const data = SAMPLE_DASHBOARD_PREVIEW;

  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <div className="overflow-hidden rounded-2xl border border-[#EDE6DA] bg-white shadow-[0_20px_50px_-16px_rgba(117,69,31,0.18)]">
        {/* Window Chrome Header */}
        <div className="flex items-center justify-between border-b border-[#EDE6DA] bg-[#FFFCF6] px-4 py-2.5">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-[#E99A32]/40" />
            <span className="size-2.5 rounded-full bg-[#F4B942]/60" />
            <span className="size-2.5 rounded-full bg-[#EDE6DA]" />
          </div>
          <span className="rounded-full border border-[#EDE6DA] bg-[#FFF5E5] px-2.5 py-0.5 text-[11px] font-semibold text-[#75451F]">
            Sample preview
          </span>
        </div>

        <div className="grid gap-3.5 p-4 sm:p-5">
          {/* Readiness + Skill Gap Row */}
          <div className="grid gap-3 sm:grid-cols-[1fr_1.25fr]">
            <div className="flex items-center gap-3.5 rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] p-3.5">
              <ScoreRing score={data.readinessScore} />
              <div>
                <p className="text-xs font-medium text-[#6F675C]">Career readiness</p>
                <p className="mt-0.5 text-sm font-bold text-[#24211D]">{data.targetRole}</p>
                <p className="mt-1 text-xs text-[#75451F]">{data.skillsToImproveCount} skills to improve</p>
              </div>
            </div>

            <div className="rounded-xl border border-[#EDE6DA] bg-white p-3.5">
              <p className="text-xs font-semibold text-[#6F675C]">Skill gap analysis</p>
              <div className="mt-2.5 space-y-2">
                {data.skills.map((s, i) => (
                  <div key={s.name}>
                    <div className="mb-0.5 flex justify-between text-[11px]">
                      <span className="font-medium text-[#24211D]">{s.name}</span>
                      <span className="text-[#6F675C]">{s.value}%</span>
                    </div>
                    <Bar value={s.value} color={s.color} delay={0.2 + i * 0.1} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Matched Roles Row */}
          <div className="rounded-xl border border-[#EDE6DA] bg-white p-3.5">
            <p className="text-xs font-semibold text-[#6F675C]">Matched roles</p>
            <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
              {data.matchedJobs.map((j) => (
                <div
                  key={j.role}
                  className="flex items-center justify-between rounded-lg border border-[#EDE6DA] bg-[#FFFCF6] px-3 py-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#FFF5E5] text-[#75451F]">
                      <BriefcaseBusiness size={15} />
                    </span>
                    <div className="truncate">
                      <p className="truncate text-xs font-bold text-[#24211D]">{j.role}</p>
                      <p className="truncate text-[10px] text-[#6F675C]">{j.company}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-[#FFF5E5] px-2 py-0.5 text-xs font-bold text-[#75451F]">
                    {j.match}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Roadmap + Interview Row */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#6F675C]">
                <GraduationCap size={15} className="text-[#75451F]" /> Learning roadmap
              </div>
              <p className="mt-1.5 text-xs font-bold text-[#24211D]">
                {data.roadmapCompletedModules} of {data.roadmapTotalModules} modules completed
              </p>
              <div className="mt-2">
                <Bar value={data.roadmapPercent} color="#F4B942" delay={0.4} />
              </div>
            </div>

            <div className="rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] p-3.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#6F675C]">
                <MessageSquareQuote size={15} className="text-[#E99A32]" /> Interview prep
              </div>
              <p className="mt-1.5 text-xs font-bold text-[#24211D]">
                {data.interviewCompletedQuestions} of {data.interviewTotalQuestions} questions practiced
              </p>
              <div className="mt-2">
                <Bar value={data.interviewPercent} color="#E99A32" delay={0.5} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <FloatChip className="-left-5 top-24" delay={0.1}>
        <span className="grid size-5 place-items-center rounded-full bg-[#F4B942] text-[#24211D]">
          <Check size={12} strokeWidth={3} />
        </span>
        Resume analyzed
      </FloatChip>
      <FloatChip className="-right-5 bottom-16" delay={0.8}>
        <Sparkles size={14} className="text-[#E99A32]" />
        New role match
      </FloatChip>
    </div>
  );
}

export function LandingPage() {
  const reduce = useReducedMotion();
  const { user } = useWorkspace();
  const destination = user ? (user.role === "recruiter" ? "/recruiter" : "/dashboard") : null;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#FFFCF6] text-[#24211D]">
      {/* Sticky Navigation Header */}
      <header className="sticky top-0 z-50 border-b border-[#EDE6DA] bg-[#FFFCF6]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 font-display text-[17px] font-bold tracking-tight">
            <span className="grid size-8 place-items-center rounded-lg bg-[#F4B942] text-[#75451F] shadow-sm">
              <Sparkles size={17} />
            </span>
            <span>SkillBridge <span className="text-[#E99A32]">AI</span></span>
          </Link>

          <nav className="hidden items-center gap-7 text-xs font-semibold text-[#6F675C] md:flex" aria-label="Main navigation">
            <a href="#features" className="transition-colors hover:text-[#24211D]">Features</a>
            <a href="#how-it-works" className="transition-colors hover:text-[#24211D]">How it works</a>
            <a href="#faq" className="transition-colors hover:text-[#24211D]">FAQ</a>
          </nav>

          <div className="flex items-center gap-2.5">
            {user ? (
              <Link
                href={destination!}
                className="inline-flex items-center gap-2 rounded-xl bg-[#F4B942] px-4 py-2 text-xs font-semibold text-[#24211D] shadow-sm hover:bg-[#E99A32] transition"
              >
                Go to dashboard <ArrowRight size={14} />
              </Link>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="rounded-xl px-3.5 py-2 text-xs font-semibold text-[#24211D] hover:bg-[#FFF5E5] transition"
                >
                  Log in
                </Link>
                <Link
                  href="/auth/role"
                  className="rounded-xl bg-[#F4B942] px-3.5 py-2 text-xs font-semibold text-[#24211D] shadow-sm hover:bg-[#E99A32] transition"
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Two-Column Hero Section */}
      <section className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 65% 55% at 80% 20%, rgba(244,185,66,0.18), transparent 70%), radial-gradient(ellipse 45% 40% at 5% 90%, rgba(233,154,50,0.12), transparent 70%)",
          }}
        />

        <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-5 py-12 sm:px-8 md:py-18 lg:grid-cols-[1fr_1.1fr] lg:gap-10 lg:py-20">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-[#EDE6DA] bg-white px-3 py-1 text-xs font-semibold text-[#75451F] shadow-sm">
              <span className="size-1.5 rounded-full bg-[#E99A32]" />
              AI Career Readiness Platform
            </span>

            <h1 className="mt-4 font-display text-[32px] font-bold leading-[1.15] tracking-tight sm:text-[42px] lg:text-[46px] text-[#24211D]">
              Build your skills.
              <span className="block text-[#75451F]">Discover your next opportunity.</span>
            </h1>

            <p className="mt-4 max-w-[480px] text-sm leading-relaxed text-[#6F675C] sm:text-base">
              Understand your strengths, identify missing capabilities, practice mock interviews, and follow a personalized roadmap towards your career goals.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href={user ? "/resume" : "/auth/role"}
                className="inline-flex items-center gap-2 rounded-xl bg-[#F4B942] px-5 py-3 text-xs font-bold text-[#24211D] shadow-[0_6px_18px_-4px_rgba(233,154,50,0.5)] transition hover:-translate-y-0.5 hover:bg-[#E99A32]"
              >
                <UploadCloud size={17} /> Analyse my resume
              </Link>
              <Link
                href={user ? destination! : "/auth/login"}
                className="inline-flex items-center gap-2 rounded-xl border border-[#EDE6DA] bg-white px-5 py-3 text-xs font-bold text-[#24211D] transition hover:-translate-y-0.5 hover:bg-[#FFF5E5]"
              >
                Explore SkillBridge <ArrowRight size={15} />
              </Link>
            </div>

            <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-[#6F675C]">
              {["Skill gap analysis", "Learning roadmap", "Interview coaching"].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check size={14} className="text-[#E99A32]" strokeWidth={2.5} /> {item}
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12, ease: "easeOut" }}
          >
            <DashboardPreview />
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="border-t border-[#EDE6DA] bg-white py-16 md:py-20">
        <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
          <Reveal className="max-w-xl">
            <p className="eyebrow">Features</p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#24211D] sm:text-3xl">
              Everything in one career workspace
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#6F675C]">
              From resume analysis to mock interview coaching, each step connects smoothly to the next.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {LANDING_FEATURES.map((feature, i) => {
              const IconComponent = iconMap[feature.iconName] || FileText;
              return (
                <Reveal key={feature.title} delay={(i % 3) * 0.08}>
                  <div className="group h-full rounded-2xl border border-[#EDE6DA] bg-[#FFFCF6] p-6 transition duration-300 hover:-translate-y-1 hover:shadow-lg">
                    <span className="grid size-11 place-items-center rounded-xl bg-[#FFF5E5] text-[#75451F] transition-colors group-hover:bg-[#F4B942]">
                      <IconComponent size={20} />
                    </span>
                    <h3 className="mt-4 text-base font-bold text-[#24211D]">{feature.title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-[#6F675C]">{feature.text}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="border-t border-[#EDE6DA] bg-[#FFF5E5]/60 py-16 md:py-20">
        <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
          <Reveal className="max-w-xl">
            <p className="eyebrow">How it works</p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#24211D] sm:text-3xl">
              From resume to ready in four steps
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {LANDING_STEPS.map((step, i) => (
              <Reveal key={step.n} delay={i * 0.08}>
                <div className="h-full rounded-2xl border border-[#EDE6DA] bg-white p-6 shadow-sm">
                  <span className="font-display text-sm font-bold text-[#E99A32]">{step.n}</span>
                  <h3 className="mt-3 text-base font-bold text-[#24211D]">{step.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#6F675C]">{step.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="border-t border-[#EDE6DA] bg-[#FFFCF6] py-16 md:py-20">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
          <Reveal>
            <p className="eyebrow">FAQ</p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#24211D] sm:text-3xl">
              Frequently asked questions
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-[#6F675C]">
              Everything you need to know about getting started with SkillBridge AI.
            </p>
          </Reveal>

          <div className="space-y-3">
            {LANDING_FAQS.map((faq, i) => (
              <Reveal key={faq.question} delay={i * 0.05}>
                <details className="group rounded-xl border border-[#EDE6DA] bg-white px-5 py-4 transition-shadow open:shadow-sm">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold text-[#24211D]">
                    <span>{faq.question}</span>
                    <span className="ml-4 text-base font-bold text-[#E99A32] transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-2.5 text-xs leading-relaxed text-[#6F675C]">{faq.answer}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-5 pb-16 sm:px-8 md:pb-20">
        <Reveal>
          <div className="mx-auto max-w-[1200px] rounded-3xl bg-[#24211D] px-6 py-12 text-center text-white sm:px-12">
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl text-white">
              Ready to accelerate your career?
            </h2>
            <p className="mx-auto mt-2.5 max-w-md text-xs leading-relaxed text-[#EDE6DA] sm:text-sm">
              Upload your resume and get a clear, personalized roadmap in under two minutes.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href={user ? "/resume" : "/auth/role"}
                className="inline-flex items-center gap-2 rounded-xl bg-[#F4B942] px-5 py-3 text-xs font-bold text-[#24211D] shadow-md transition hover:-translate-y-0.5 hover:bg-[#E99A32]"
              >
                <UploadCloud size={16} /> Analyse my resume
              </Link>
              <Link
                href={user ? destination! : "/auth/role"}
                className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-5 py-3 text-xs font-bold text-white transition hover:-translate-y-0.5 hover:bg-white/10"
              >
                Get started <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#EDE6DA] bg-white py-8 text-center text-xs text-[#6F675C]">
        <div className="mx-auto max-w-[1200px] px-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} SkillBridge AI. Built for private career readiness.</p>
          <div className="flex gap-4 text-xs font-medium">
            <Link href="/" className="hover:text-[#24211D]">Home</Link>
            <Link href="/auth/login" className="hover:text-[#24211D]">Log in</Link>
            <Link href="/auth/role" className="hover:text-[#24211D]">Register</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

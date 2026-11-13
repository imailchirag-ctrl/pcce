"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2, Sparkles, Target, UserRound } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardTitle } from "@/components/ui/primitives";
import { Heading } from "@/components/workspace/shared";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace-provider";

export function OnboardingPage() {
  const router = useRouter();
  const { user, updateProfile, refresh } = useWorkspace();
  const [targetRole, setTargetRole] = useState(user?.target_role ?? "Software Engineer");
  const [yearsExperience, setYearsExperience] = useState(user?.years_experience ?? 2);
  const [openToWork, setOpenToWork] = useState(user?.open_to_work ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg("");
    try {
      await updateProfile({
        target_role: targetRole || undefined,
        years_experience: Number(yearsExperience) || 0,
        open_to_work: openToWork,
        onboarded: true,
      });
      await refresh();
      router.replace(user?.role === "recruiter" ? "/recruiter" : "/dashboard");
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to complete onboarding.");
    } finally {
      setSubmitting(false);
    }
  };

  const commonRoles = [
    "Software Engineer",
    "Frontend Engineer",
    "Backend Engineer",
    "Full Stack Developer",
    "Data Scientist",
    "Machine Learning Engineer",
    "DevOps / Cloud Engineer",
    "Product Manager",
    "Data Analyst",
    "Cybersecurity Analyst",
  ];

  return (
    <AppShell>
      <Heading
        eyebrow="Onboarding"
        title="Complete your career workspace setup"
        detail="Tell us about your target role and goals to customize your skill analysis and job matching."
      />

      {errorMsg && (
        <div role="alert" className="mb-4 rounded-xl border border-[#C62828]/25 bg-[#C62828]/10 p-3.5 text-xs font-medium text-[#C62828]">
          {errorMsg}
        </div>
      )}

      <Card className="p-5 sm:p-7 max-w-xl">
        <CardTitle detail="Step 1 of 1 · Basic career preferences">
          Career profile setup
        </CardTitle>

        <form onSubmit={handleFinish} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#24211D] mb-1.5">
              Target role title
            </label>
            <input
              className="input mb-2"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="e.g. Full Stack Developer"
              required
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {commonRoles.slice(0, 6).map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setTargetRole(r)}
                  className={`rounded-lg border px-2 py-0.5 text-[11px] font-medium transition ${
                    targetRole === r
                      ? "border-[#F4B942] bg-[#FFF5E5] text-[#75451F]"
                      : "border-[#EDE6DA] bg-white text-[#6F675C] hover:bg-[#FFFCF6]"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#24211D] mb-1.5">
              Years of professional experience
            </label>
            <input
              className="input"
              type="number"
              min="0"
              max="50"
              value={yearsExperience}
              onChange={(e) => setYearsExperience(Number(e.target.value))}
              required
            />
          </div>

          <div className="rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] p-3.5">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={openToWork}
                onChange={(e) => setOpenToWork(e.target.checked)}
                className="size-4 rounded border-[#EDE6DA] text-[#F4B942] focus:ring-[#F4B942]"
              />
              <div>
                <span className="block text-xs font-semibold text-[#24211D]">
                  Open to work & recruiter discovery
                </span>
                <span className="block text-[11px] text-[#6F675C]">
                  Allow verified recruiters to view your skill profile and send invitations.
                </span>
              </div>
            </label>
          </div>

          <Button type="submit" className="w-full mt-3" disabled={submitting}>
            {submitting ? (
              <><Loader2 size={15} className="animate-spin mr-1.5" /> Initializing workspace…</>
            ) : (
              <>Finish setup and open dashboard <ArrowRight size={14} className="ml-1" /></>
            )}
          </Button>
        </form>
      </Card>
    </AppShell>
  );
}

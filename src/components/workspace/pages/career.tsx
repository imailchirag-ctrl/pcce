"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2, Sparkles, Target, UploadCloud } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge, Card, CardTitle, EmptyState, Progress, SkillPill } from "@/components/ui/primitives";
import { Heading, Metric } from "@/components/workspace/shared";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace-provider";

export function CareerPage() {
  const router = useRouter();
  const { analysis, dashboard, analyze, generateRoadmap, refresh } = useWorkspace();
  const [targetRole, setTargetRole] = useState("Software Engineer");
  const [jobDescription, setJobDescription] = useState("");
  const [running, setRunning] = useState(false);
  const [buildingRoadmap, setBuildingRoadmap] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const current = analysis ?? dashboard?.analysis ?? null;
  const latestRole = current?.target_role ?? targetRole;

  const handleAnalyze = async () => {
    setRunning(true);
    setErrorMsg("");
    try {
      await analyze(latestRole, jobDescription || undefined);
      await refresh();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to analyze career fit.");
    } finally {
      setRunning(false);
    }
  };

  const handleBuildRoadmap = async () => {
    if (!current) return;
    setBuildingRoadmap(true);
    try {
      await generateRoadmap(current.target_role, current.missing_skills);
      router.push("/learn");
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to generate roadmap.");
    } finally {
      setBuildingRoadmap(false);
    }
  };

  if (!current) {
    return (
      <AppShell>
        <Heading
          eyebrow="Career readiness"
          title="Analyze career fit"
          detail="Compare your resume against a target role to compute your skill-gap score and career readiness."
        />

        {errorMsg && (
          <div role="alert" className="mb-4 rounded-xl border border-[#C62828]/25 bg-[#C62828]/10 p-3.5 text-xs font-medium text-[#C62828]">
            {errorMsg}
          </div>
        )}

        <Card className="p-5 sm:p-6 max-w-2xl">
          <CardTitle detail="Run an in-depth skill comparison against any target role">
            Career match analysis
          </CardTitle>
          <form onSubmit={(e) => { e.preventDefault(); void handleAnalyze(); }} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#24211D] mb-1.5">Target role title</label>
              <input
                className="input"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="e.g. Data Scientist, Cloud Architect"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#24211D] mb-1.5">Job description (optional)</label>
              <textarea
                className="input h-36"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the full job posting text to test direct semantic match against requirements…"
              />
            </div>
            <Button type="submit" className="w-full mt-2" disabled={running}>
              {running ? (
                <><Loader2 size={16} className="animate-spin mr-2" /> Computing skill gap…</>
              ) : (
                <><Target size={16} className="mr-2" /> Analyze career fit</>
              )}
            </Button>
          </form>
          <p className="mt-3 text-xs leading-relaxed text-[#6F675C]">
            Our AI model compares your detected resume capabilities against industry role requirements, categorizing skills into exact matches and near matches.
          </p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Heading
        eyebrow="Career readiness"
        title={`Fit for ${current.target_role}`}
        detail={`Skill-gap score: ${current.skill_match_percent}% · Weighted coverage: ${current.weighted_match_percent}% · Readiness: ${current.readiness?.score ?? 0}%`}
        action={
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            Refresh
          </Button>
        }
      />

      {errorMsg && (
        <div role="alert" className="mb-4 rounded-xl border border-[#C62828]/25 bg-[#C62828]/10 p-3.5 text-xs font-medium text-[#C62828]">
          {errorMsg}
        </div>
      )}

      {/* 3 Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="Direct skill match"
          value={`${current.skill_match_percent}%`}
          caption="Exact role requirements found"
          icon={Check}
          tint="primary"
        />
        <Metric
          label="Weighted coverage"
          value={`${current.weighted_match_percent}%`}
          caption="Matched + partial transferable skills"
          icon={Target}
          tint="orange"
        />
        <Metric
          label="Career readiness"
          value={`${current.readiness?.score ?? 0}%`}
          caption="Overall coaching readiness score"
          icon={Sparkles}
          tint="brown"
        />
      </div>

      {/* Score Breakdown and Readiness */}
      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="p-5 sm:p-6 lg:col-span-2">
          <CardTitle detail="Calculation methodology">Score breakdown</CardTitle>
          <p className="text-xs leading-relaxed text-[#6F675C] mb-4">
            The score evaluates your detected capabilities against the required skillset for "{current.target_role}". Exact keyword matches receive full credit, while closely related skills identified via semantic similarity receive partial credit.
          </p>

          <div className="grid gap-2.5 text-xs">
            <div className="flex justify-between rounded-lg bg-[#FFFCF6] border border-[#EDE6DA] p-2.5">
              <span className="font-medium text-[#6F675C]">Total role requirements</span>
              <span className="font-bold text-[#24211D]">{current.required_skills.length}</span>
            </div>
            <div className="flex justify-between rounded-lg bg-[#FFF5E5]/50 border border-[#EDE6DA] p-2.5">
              <span className="font-medium text-[#75451F]">Direct matches</span>
              <span className="font-bold text-[#75451F]">{current.matched_skills.length}</span>
            </div>
            <div className="flex justify-between rounded-lg bg-[#FFF5E5]/25 border border-[#EDE6DA] p-2.5">
              <span className="font-medium text-[#75451F]">Partial / adjacent matches</span>
              <span className="font-bold text-[#E99A32]">{current.partial_skills.length}</span>
            </div>
            <div className="flex justify-between rounded-lg bg-white border border-[#EDE6DA] p-2.5">
              <span className="font-medium text-[#6F675C]">Missing capabilities</span>
              <span className="font-bold text-[#6F675C]">{current.missing_skills.length}</span>
            </div>
          </div>
        </Card>

        {/* Readiness Components */}
        <Card className="p-5 sm:p-6">
          <CardTitle detail="Breakdown by factor">Readiness breakdown</CardTitle>
          {current.readiness ? (
            <div className="space-y-3 text-xs">
              {Object.entries(current.readiness.breakdown || {}).map(([k, v]) => (
                <div key={k}>
                  <div className="flex justify-between mb-1">
                    <span className="font-medium text-[#6F675C] capitalize">{k.replace(/_/g, " ")}</span>
                    <span className="font-bold text-[#24211D]">{Number(v)}%</span>
                  </div>
                  <Progress value={Number(v)} />
                </div>
              ))}
              {current.readiness.explanation && (
                <p className="mt-3 text-[11px] leading-relaxed text-[#6F675C]">
                  {current.readiness.explanation}
                </p>
              )}
            </div>
          ) : (
            <EmptyState title="No breakdown" detail="Readiness breakdown not calculated yet." />
          )}
        </Card>
      </div>

      {/* Matched vs Missing Skills */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <CardTitle detail="Skills detected on your profile">Matched skills</CardTitle>
          <div className="flex flex-wrap gap-2">
            {current.matched_skills.map((s) => (
              <SkillPill key={s} tone="matched">{s}</SkillPill>
            ))}
            {current.matched_skills.length === 0 && (
              <p className="text-xs text-[#6F675C]">No direct matches detected for this role.</p>
            )}
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <CardTitle detail="Prioritize these skills to close the gap">Missing skills</CardTitle>
          <div className="flex flex-wrap gap-2">
            {current.missing_skills.map((s) => (
              <SkillPill key={s} tone="missing">{s}</SkillPill>
            ))}
            {current.missing_skills.length === 0 && (
              <p className="text-xs text-[#2E7D32] font-semibold">Outstanding fit! No missing core skills detected.</p>
            )}
          </div>

          {current.missing_skills.length > 0 && (
            <div className="mt-5 border-t border-[#EDE6DA] pt-4">
              <Button
                size="sm"
                className="w-full"
                onClick={() => void handleBuildRoadmap()}
                disabled={buildingRoadmap}
              >
                {buildingRoadmap ? (
                  <><Loader2 size={14} className="animate-spin mr-1.5" /> Building customized roadmap…</>
                ) : (
                  <><Sparkles size={14} className="mr-1.5" /> Generate learning roadmap to close gaps <ArrowRight size={14} /></>
                )}
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* Keywords */}
      <Card className="mt-5 p-5 sm:p-6">
        <CardTitle detail="Extracted ATS terminology from your resume">Extracted keywords</CardTitle>
        <div className="flex flex-wrap gap-2">
          {current.keywords?.keywords?.slice(0, 20).map((k) => (
            <Badge key={k.term} tone="warm">{k.term}</Badge>
          ))}
          {!current.keywords?.keywords?.length && (
            <p className="text-xs text-[#6F675C]">No keywords found.</p>
          )}
        </div>
      </Card>
    </AppShell>
  );
}

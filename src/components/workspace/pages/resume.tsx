"use client";

import { useState } from "react";
import { CheckCircle2, FileText, Loader2, Sparkles, Target, Trash2, UploadCloud } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardTitle, EmptyState, SkillPill } from "@/components/ui/primitives";
import { Heading, Metric } from "@/components/workspace/shared";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace-provider";

export function ResumePage() {
  const {
    analysis,
    dashboard,
    upload,
    deleteResume,
    refresh,
  } = useWorkspace();
  const [file, setFile] = useState<File | null>(null);
  const [targetRole, setTargetRole] = useState("Software Engineer");
  const [jobDescription, setJobDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const latest = dashboard?.resume;
  const currentAnalysis = analysis ?? dashboard?.analysis ?? null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setErrorMsg("");
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setErrorMsg("");
    try {
      await upload(file, { targetRole, jobDescription, onProgress: () => {} });
      await refresh();
      setFile(null);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to analyze resume. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <AppShell>
      <Heading
        eyebrow="Resume intelligence"
        title="Analyze your resume"
        detail="Upload a PDF, DOCX, or TXT resume to extract verified capabilities, compute your skill gap against a target role, and get personalized job recommendations."
      />

      {errorMsg && (
        <div role="alert" className="mb-4 rounded-xl border border-[#C62828]/25 bg-[#C62828]/10 p-3.5 text-xs font-medium text-[#C62828]">
          {errorMsg}
        </div>
      )}

      {/* Upload Card */}
      <Card className="p-5 sm:p-6">
        <CardTitle detail="Upload a document for automated skill extraction">
          Upload resume
        </CardTitle>
        <form onSubmit={handleUpload} className="mt-4 space-y-4">
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#24211D] mb-1.5">Resume file (PDF, DOCX, TXT)</label>
              <input
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                className="input text-xs"
                onChange={handleFileChange}
                disabled={uploading}
              />
              {file && (
                <p className="mt-1.5 text-xs font-medium text-[#75451F]">
                  Selected: {file.name} · {(file.size / 1024).toFixed(1)} KB
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#24211D] mb-1.5">Target career role</label>
              <input
                className="input text-xs"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="e.g. Full Stack Engineer, Data Analyst"
                disabled={uploading}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#24211D] mb-1.5">Job description (optional)</label>
              <textarea
                className="input text-xs h-28"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste a specific job description to compute a direct job match score…"
                disabled={uploading}
              />
            </div>

            <Button type="submit" className="w-full mt-2" disabled={!file || uploading}>
              {uploading ? (
                <><Loader2 size={16} className="animate-spin mr-2" /> Analyzing resume with AI…</>
              ) : (
                <><UploadCloud size={16} className="mr-2" /> Upload & analyze</>
              )}
            </Button>
          </div>
        </form>
        <p className="mt-3 text-[11px] text-[#6F675C]">
          Max file size: 10 MB. Files are processed privately and tied securely to your account.
        </p>
      </Card>

      {/* Latest Uploaded Resume Card */}
      {latest && (
        <Card className="mt-5 p-5 sm:p-6">
          <CardTitle detail={`Processed on ${new Date(latest.created_at).toLocaleDateString()}`}>
            Active resume on file
          </CardTitle>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[#FFF5E5] text-[#75451F]">
                <FileText size={20} />
              </span>
              <div>
                <p className="font-bold text-[#24211D] text-sm">{latest.filename}</p>
                <p className="text-xs text-[#6F675C]">Active version in your workspace</p>
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                await deleteResume(latest.id);
                await refresh();
              }}
            >
              <Trash2 size={14} className="mr-1.5" /> Remove
            </Button>
          </div>
        </Card>
      )}

      {/* Analysis Results */}
      {currentAnalysis && (
        <div className="mt-5 space-y-5">
          <Card className="p-5 sm:p-6">
            <CardTitle detail={`Evaluated against ${currentAnalysis.target_role || targetRole}`}>
              Skill analysis results
            </CardTitle>

            <div className="grid gap-4 sm:grid-cols-3">
              <Metric
                label="Skill match"
                value={`${currentAnalysis.skill_match_percent}%`}
                caption="Required role skills covered"
                icon={CheckCircle2}
                tint="primary"
              />
              <Metric
                label="Career readiness"
                value={`${currentAnalysis.readiness?.score ?? 0}%`}
                caption="Overall preparation score"
                icon={Target}
                tint="orange"
              />
              <Metric
                label="Skills extracted"
                value={String(currentAnalysis.skill_names.length)}
                caption={currentAnalysis.skills_by_category ? `${Object.keys(currentAnalysis.skills_by_category).length} categories` : "Capabilities detected"}
                icon={Sparkles}
                tint="brown"
              />
            </div>

            {/* Matched, Partial, Missing 3-Column Box */}
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-[#EDE6DA] bg-[#FFF5E5]/60 p-4">
                <p className="text-xs font-bold text-[#75451F] uppercase tracking-wider mb-2">
                  Matched skills ({currentAnalysis.matched_skills.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {currentAnalysis.matched_skills.slice(0, 15).map((s) => (
                    <SkillPill key={s} tone="matched">{s}</SkillPill>
                  ))}
                  {currentAnalysis.matched_skills.length === 0 && (
                    <p className="text-xs text-[#6F675C]">None detected</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-[#EDE6DA] bg-[#FFF5E5]/30 p-4">
                <p className="text-xs font-bold text-[#75451F] uppercase tracking-wider mb-2">
                  Partial matches ({currentAnalysis.partial_skills.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {currentAnalysis.partial_skills.slice(0, 10).map((s) => (
                    <SkillPill key={s} tone="partial">{s}</SkillPill>
                  ))}
                  {currentAnalysis.partial_skills.length === 0 && (
                    <p className="text-xs text-[#6F675C]">None detected</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-[#EDE6DA] bg-white p-4">
                <p className="text-xs font-bold text-[#6F675C] uppercase tracking-wider mb-2">
                  Missing skills ({currentAnalysis.missing_skills.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {currentAnalysis.missing_skills.slice(0, 15).map((s) => (
                    <SkillPill key={s} tone="missing">{s}</SkillPill>
                  ))}
                  {currentAnalysis.missing_skills.length === 0 && (
                    <p className="text-xs text-[#6F675C]">All required skills covered!</p>
                  )}
                </div>
              </div>
            </div>

            {/* Readiness Breakdown */}
            {currentAnalysis.readiness && (
              <div className="mt-5 rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] p-4">
                <p className="text-xs font-bold text-[#24211D] mb-3">Readiness breakdown</p>
                <div className="grid gap-2.5 text-xs sm:grid-cols-2">
                  {Object.entries(currentAnalysis.readiness.breakdown || {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between rounded-lg bg-white p-2 border border-[#EDE6DA]">
                      <span className="font-medium text-[#6F675C] capitalize">{k.replace(/_/g, " ")}</span>
                      <span className="font-bold text-[#24211D]">{Number(v)}%</span>
                    </div>
                  ))}
                </div>
                {currentAnalysis.readiness.explanation && (
                  <p className="mt-3 text-xs leading-relaxed text-[#6F675C]">
                    {currentAnalysis.readiness.explanation}
                  </p>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {!currentAnalysis && !latest && (
        <div className="mt-5">
          <EmptyState
            title="No resume analyzed yet"
            detail="Upload your resume above to start extracting skills, computing your skill-gap score, and viewing matched jobs."
          />
        </div>
      )}
    </AppShell>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  MessageSquareText,
  Sparkles,
  Target,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge, Card, CardTitle, EmptyState } from "@/components/ui/primitives";
import { Heading, Metric } from "@/components/workspace/shared";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace-provider";

export function InterviewsPage() {
  const router = useRouter();
  const { interviewHistory, dashboard, startInterview, refresh } = useWorkspace();
  const [role, setRole] = useState(dashboard?.analysis?.target_role || "Software Engineer");
  const [mode, setMode] = useState("Technical");
  const [difficulty, setDifficulty] = useState("intermediate");
  const [starting, setStarting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const history = interviewHistory ?? [];
  const completedSessions = history.filter((s) => s.status === "COMPLETED");
  const totalScore = completedSessions.reduce((acc, s) => acc + (s.score || 0), 0);
  const avgScore = completedSessions.length ? Math.round(totalScore / completedSessions.length) : null;

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setStarting(true);
    setErrorMsg("");
    try {
      await startInterview({
        role,
        mode,
        type: mode.toLowerCase(),
        difficulty,
      });
      router.push("/interviews/session");
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to generate interview questions. Please try again.");
      setStarting(false);
    }
  };

  return (
    <AppShell>
      <Heading
        eyebrow="Mock interviews"
        title="AI interview coaching"
        detail="Rehearse role-specific technical and behavioral questions with instant AI-powered scoring and actionable feedback."
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
          label="Total sessions"
          value={String(history.length)}
          caption={`${completedSessions.length} sessions fully completed`}
          icon={MessageSquareText}
          tint="primary"
        />
        <Metric
          label="Average score"
          value={avgScore !== null ? `${avgScore}%` : "—"}
          caption="Across completed rehearsals"
          icon={CheckCircle2}
          tint="orange"
        />
        <Metric
          label="Coaching readiness"
          value={dashboard?.readiness?.score ? `${dashboard.readiness.score}%` : "—"}
          caption="Current career readiness"
          icon={Target}
          tint="brown"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {/* Start Interview Setup Card */}
        <Card className="p-5 sm:p-6 lg:col-span-1">
          <CardTitle detail="Configure a simulated session">Start mock interview</CardTitle>
          <form onSubmit={handleStart} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#24211D] mb-1.5">Target role</label>
              <input
                className="input"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Senior Frontend Engineer"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#24211D] mb-1.5">Interview mode</label>
              <select
                className="input"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="Technical">Technical & Coding Concepts</option>
                <option value="Behavioral">Behavioral (STAR Method)</option>
                <option value="System Design">System Architecture & Design</option>
                <option value="Leadership">Leadership & Collaboration</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#24211D] mb-1.5">Difficulty level</label>
              <select
                className="input"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              >
                <option value="entry">Entry level</option>
                <option value="intermediate">Mid-level / Intermediate</option>
                <option value="senior">Senior / Staff level</option>
              </select>
            </div>

            <Button type="submit" className="w-full mt-2" disabled={starting}>
              {starting ? (
                <><Loader2 size={16} className="animate-spin mr-2" /> Preparing questions…</>
              ) : (
                <><Sparkles size={16} className="mr-2" /> Start interview session</>
              )}
            </Button>
          </form>
          <p className="mt-3 text-xs leading-relaxed text-[#6F675C]">
            Questions are generated to assess your problem-solving depth, communication clarity, and role alignment.
          </p>
        </Card>

        {/* History Card (2/3 width) */}
        <Card className="p-5 sm:p-6 lg:col-span-2">
          <CardTitle detail="Review your past performance and evaluation rubrics">
            Session history
          </CardTitle>

          {history.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#EDE6DA] text-[11px] font-bold uppercase tracking-wider text-[#6F675C]">
                    <th className="pb-2.5 font-bold">Role</th>
                    <th className="pb-2.5 font-bold">Mode</th>
                    <th className="pb-2.5 font-bold">Status</th>
                    <th className="pb-2.5 font-bold">Score</th>
                    <th className="pb-2.5 font-bold">Date</th>
                    <th className="pb-2.5 font-bold text-right">Report</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EDE6DA]/70">
                  {history.map((session) => (
                    <tr key={session.id} className="hover:bg-[#FFF5E5]/40 transition-colors">
                      <td className="py-3 font-bold text-[#24211D]">{session.role}</td>
                      <td className="py-3 text-[#6F675C]">
                        <span className="capitalize">{session.mode}</span> · {session.difficulty}
                      </td>
                      <td className="py-3">
                        <Badge tone={session.status === "COMPLETED" ? "green" : "warm"}>
                          {session.status === "COMPLETED" ? "Completed" : "In progress"}
                        </Badge>
                      </td>
                      <td className="py-3 font-bold text-[#24211D]">
                        {session.score !== null ? `${session.score}%` : "—"}
                      </td>
                      <td className="py-3 text-[#6F675C]">
                        {new Date(session.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 text-right">
                        <Link
                          href={`/interviews/report?sessionId=${session.id}`}
                          className="inline-flex items-center gap-1 font-bold text-[#75451F] hover:text-[#E99A32]"
                        >
                          View <ArrowRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No mock interviews recorded yet"
              detail="Select your target role and click 'Start interview session' above to practice."
            />
          )}
        </Card>
      </div>
    </AppShell>
  );
}

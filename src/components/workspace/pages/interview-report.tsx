"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, MessageSquareText, Target } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge, Card, CardTitle, EmptyState, Progress } from "@/components/ui/primitives";
import { Heading, Metric } from "@/components/workspace/shared";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace-provider";
import { api } from "@/lib/api";

export function InterviewReportPage() {
  const searchParams = useSearchParams();
  const { interviewHistory, refresh } = useWorkspace();
  const [sessionId, setSessionId] = useState("");
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const querySessionId = searchParams.get("sessionId");

  const loadSession = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const s = await api.interviewSession(id);
      setSession(s);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (querySessionId) {
      setSessionId(querySessionId);
      void loadSession(querySessionId);
    } else {
      const sessions = interviewHistory ?? [];
      const last = sessions[sessions.length - 1];
      if (last?.id) {
        setSessionId(last.id);
        void loadSession(last.id);
      }
    }
  }, [querySessionId, interviewHistory, loadSession]);

  if (loading) {
    return (
      <AppShell>
        <Heading
          eyebrow="Interview report"
          title="Loading evaluation report…"
          detail="Fetching your session questions and feedback."
        />
        <div className="rounded-2xl border border-[#EDE6DA] bg-white p-8 text-center max-w-lg">
          <p className="text-xs text-[#6F675C]">Retrieving rubric evaluations…</p>
        </div>
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell>
        <Heading
          eyebrow="Interview report"
          title="Session report"
          detail="View your comprehensive mock interview evaluation and AI rubric scoring."
        />
        <Card className="p-5 sm:p-6 max-w-lg">
          <CardTitle detail="Look up an interview report by Session ID">
            Select interview
          </CardTitle>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (sessionId) void loadSession(sessionId);
            }}
            className="mt-3 space-y-3"
          >
            <input
              className="input"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="e.g. session-id"
            />
            <Button type="submit" disabled={!sessionId}>
              Load report <ArrowRight size={14} />
            </Button>
          </form>
          <div className="mt-4 pt-3 border-t border-[#EDE6DA]">
            <Link href="/interviews">
              <Button variant="outline" size="sm">
                <ArrowLeft size={13} className="mr-1" /> Back to mock interviews
              </Button>
            </Link>
          </div>
        </Card>
      </AppShell>
    );
  }

  const questions = session.questions ?? [];
  const answers = session.answers ?? [];

  return (
    <AppShell>
      <Heading
        eyebrow="Interview evaluation report"
        title={session.role}
        detail={`${session.mode} interview · ${session.difficulty} difficulty · ${new Date(session.created_at || session.started_at).toLocaleDateString()}`}
        action={
          <div className="flex gap-2">
            <Link href="/interviews">
              <Button variant="outline" size="sm">
                <ArrowLeft size={13} className="mr-1" /> Back
              </Button>
            </Link>
            <Link href="/interviews">
              <Button size="sm">Practice again</Button>
            </Link>
          </div>
        }
      />

      {/* 3 Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="Overall performance"
          value={session.score != null ? `${session.score}%` : "—"}
          caption="Aggregate interview evaluation score"
          icon={Target}
          tint="primary"
        />
        <Metric
          label="Questions completed"
          value={String(questions.length)}
          caption="Assessed against job requirements"
          icon={MessageSquareText}
          tint="orange"
        />
        <Metric
          label="Session status"
          value={session.status === "COMPLETED" ? "Complete" : "In review"}
          caption="Saved to your permanent profile"
          icon={CheckCircle2}
          tint="brown"
        />
      </div>

      {/* Detailed Questions & Evaluations List */}
      <Card className="mt-5 p-5 sm:p-6">
        <CardTitle detail="Detailed breakdown of each question, your answer, and AI rubric scoring">
          Questions & responses
        </CardTitle>

        <div className="mt-4 space-y-4">
          {questions.map((q: any, i: number) => {
            const ans = answers.find((a: any) => a.question === q.prompt || a.question_id === q.id);
            return (
              <div
                key={i}
                className="rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] p-4 sm:p-5"
              >
                <div className="flex items-center justify-between border-b border-[#EDE6DA] pb-2 mb-3">
                  <span className="text-xs font-bold text-[#75451F]">Question {i + 1}</span>
                  {q.topic && <Badge tone="warm">{q.topic}</Badge>}
                </div>

                <p className="text-sm font-bold text-[#24211D] mb-3">{q.prompt}</p>

                {ans ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-[#EDE6DA] bg-white p-3.5">
                      <p className="text-xs font-bold text-[#75451F] mb-1">Your response:</p>
                      <p className="text-xs text-[#24211D] leading-relaxed whitespace-pre-wrap">
                        {ans.answer}
                      </p>
                    </div>

                    {ans.evaluation && (
                      <div className="rounded-xl border border-[#EDE6DA] bg-[#FFF5E5]/50 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-bold text-[#24211D]">AI evaluation</p>
                          <span className="text-xs font-bold text-[#75451F]">{ans.evaluation.overall}%</span>
                        </div>
                        {ans.evaluation.strengths && ans.evaluation.strengths.length > 0 && (
                          <div className="mt-2 text-xs">
                            <p className="font-semibold text-[#2E7D32]">Strengths:</p>
                            <p className="text-[#24211D] mt-0.5">{ans.evaluation.strengths.join(". ")}</p>
                          </div>
                        )}
                        {ans.evaluation.improvements && ans.evaluation.improvements.length > 0 && (
                          <div className="mt-2 text-xs">
                            <p className="font-semibold text-[#75451F]">Recommendations:</p>
                            <p className="text-[#24211D] mt-0.5">{ans.evaluation.improvements.join(". ")}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-[#6F675C]">No recorded response for this question.</p>
                )}
              </div>
            );
          })}

          {questions.length === 0 && (
            <p className="text-xs text-[#6F675C] text-center py-4">No questions recorded in this session.</p>
          )}
        </div>
      </Card>
    </AppShell>
  );
}

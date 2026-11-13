"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Send } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge, Card, CardTitle, Progress } from "@/components/ui/primitives";
import { Heading } from "@/components/workspace/shared";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace-provider";

export function InterviewSessionPage() {
  const router = useRouter();
  const { interview, evaluateAnswer, completeInterview, resetInterview } = useWorkspace();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<any>(null);
  const [finishing, setFinishing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  if (!interview || !interview.questions?.length) {
    return (
      <AppShell>
        <Heading
          eyebrow="Mock interviews"
          title="No active session"
          detail="Start a new mock interview session to practice questions and receive AI feedback."
        />
        <div className="rounded-2xl border border-[#EDE6DA] bg-white p-8 text-center max-w-lg">
          <p className="font-bold text-sm text-[#24211D]">Ready to practice?</p>
          <p className="mt-1 text-xs text-[#6F675C]">
            Select your target role and question format to start an interactive rehearsal.
          </p>
          <div className="mt-4">
            <Link href="/interviews">
              <Button>Configure interview session <ArrowRight size={14} className="ml-1" /></Button>
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const questions = interview.questions;
  const current = questions[currentIndex];
  const answered = interview.answers ?? [];
  const hasAnswered = answered.some((a) => a.question === current?.prompt);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || evaluating || !answer.trim()) return;
    setEvaluating(true);
    setErrorMsg("");
    try {
      const result = await evaluateAnswer(current.prompt, answer, current.id);
      setEvaluation(result);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to score answer. Please try again.");
    } finally {
      setEvaluating(false);
    }
  };

  const handleNext = () => {
    setEvaluation(null);
    setAnswer("");
    setErrorMsg("");
    setCurrentIndex((i) => Math.min(i + 1, questions.length - 1));
  };

  const handleComplete = async () => {
    setFinishing(true);
    const score = evaluation?.overall ?? 80;
    try {
      await completeInterview(score);
      router.push(`/interviews/report?sessionId=${interview.sessionId || ""}`);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to complete interview.");
      setFinishing(false);
    }
  };

  const isCompleted = currentIndex >= questions.length - 1 && evaluation !== null;

  return (
    <AppShell>
      <Heading
        eyebrow="Live mock interview"
        title={interview.role}
        detail={`${interview.mode} interview · ${interview.difficulty} level · Question ${currentIndex + 1} of ${questions.length}`}
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              resetInterview();
              router.push("/interviews");
            }}
          >
            End session
          </Button>
        }
      />

      {errorMsg && (
        <div role="alert" className="mb-4 rounded-xl border border-[#C62828]/25 bg-[#C62828]/10 p-3.5 text-xs font-medium text-[#C62828]">
          {errorMsg}
        </div>
      )}

      {/* Question & Answer Card */}
      <Card className="p-5 sm:p-6 max-w-3xl">
        <div className="flex items-center justify-between border-b border-[#EDE6DA] pb-3 mb-4">
          <Badge tone="primary">Question {currentIndex + 1} of {questions.length}</Badge>
          {current?.topic && <Badge tone="warm">{current.topic}</Badge>}
        </div>

        <h2 className="font-display text-lg sm:text-xl font-bold text-[#24211D] leading-snug">
          {current?.prompt}
        </h2>
        {current?.why && (
          <p className="mt-2 text-xs text-[#6F675C]">
            <span className="font-bold text-[#75451F]">Evaluation objective: </span>
            {current.why}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <label className="block text-xs font-semibold text-[#24211D]">Your response</label>
          <textarea
            ref={inputRef}
            className="input h-44 text-sm"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Structure your answer using the STAR method: Situation, Task, Action, Result…"
            disabled={evaluating || hasAnswered}
          />

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-[#6F675C]">{answer.trim().length} characters</span>
            <Button
              type="submit"
              disabled={evaluating || !answer.trim() || hasAnswered}
            >
              {evaluating ? (
                <><Loader2 size={14} className="animate-spin mr-1.5" /> Evaluating with AI…</>
              ) : (
                <><Send size={14} className="mr-1.5" /> Submit answer</>
              )}
            </Button>
          </div>
          {hasAnswered && (
            <p className="text-xs text-[#75451F] font-medium">Answer submitted for this question.</p>
          )}
        </form>

        {/* AI Evaluation Box */}
        {evaluation && (
          <div className="mt-6 rounded-2xl border border-[#EDE6DA] bg-[#FFFCF6] p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#EDE6DA] pb-3 mb-4">
              <div>
                <p className="font-bold text-sm text-[#24211D]">AI evaluation & feedback</p>
                <p className="text-xs text-[#6F675C]">Scored against role benchmarks</p>
              </div>
              <div className="text-right">
                <span className="font-display text-2xl font-bold text-[#75451F]">{evaluation.overall}%</span>
                <span className="block text-[10px] text-[#6F675C]">Overall score</span>
              </div>
            </div>

            {/* Dimension Breakdown */}
            {evaluation.dimensions && Object.keys(evaluation.dimensions).length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 mb-4">
                {Object.entries(evaluation.dimensions).map(([dim, val]) => (
                  <div key={dim} className="rounded-xl border border-[#EDE6DA] bg-white p-3 text-xs">
                    <div className="flex justify-between mb-1">
                      <span className="font-medium text-[#6F675C] capitalize">{dim}</span>
                      <span className="font-bold text-[#24211D]">{Number(val)}%</span>
                    </div>
                    <Progress value={Number(val)} />
                  </div>
                ))}
              </div>
            )}

            {/* Strengths & Improvements */}
            <div className="space-y-3 text-xs">
              {evaluation.strengths && evaluation.strengths.length > 0 && (
                <div className="rounded-xl border border-[#2E7D32]/25 bg-[#2E7D32]/10 p-3.5">
                  <p className="font-bold text-[#2E7D32] mb-1 flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> Key strengths
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-[#24211D]">
                    {evaluation.strengths.map((s: string, i: number) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {evaluation.improvements && evaluation.improvements.length > 0 && (
                <div className="rounded-xl border border-[#EDE6DA] bg-[#FFF5E5] p-3.5">
                  <p className="font-bold text-[#75451F] mb-1">Areas for improvement</p>
                  <ul className="list-disc list-inside space-y-1 text-[#24211D]">
                    {evaluation.improvements.map((imp: string, i: number) => (
                      <li key={i}>{imp}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Navigation buttons */}
            <div className="mt-5 flex justify-end gap-3 pt-3 border-t border-[#EDE6DA]">
              {currentIndex < questions.length - 1 ? (
                <Button onClick={handleNext}>
                  Next question <ArrowRight size={14} />
                </Button>
              ) : (
                <Button onClick={handleComplete} disabled={finishing}>
                  {finishing ? (
                    <><Loader2 size={14} className="animate-spin mr-1.5" /> Saving session…</>
                  ) : (
                    <>Finish interview & view report <ArrowRight size={14} /></>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>
    </AppShell>
  );
}

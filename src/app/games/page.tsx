"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Trophy, Clock, ShieldAlert, Flame, Award, Play, Code2, BrainCircuit, HelpCircle, ArrowRight, Pause, Save, Loader2 } from "lucide-react";

type GameMode = "coding" | "logical" | "gk";

interface GameStats {
  wins: number;
  losses: number;
  streak: number;
}

interface Question {
  id: number;
  question: string;
  options: string[];
  correct: number;
}

interface CodingChallenge {
  title: string;
  problem: string;
  examples: string[];
  starterCode: string;
}

function GamesPage() {
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null);
  
  const [matchStarted, setMatchStarted] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [codingChallenge, setCodingChallenge] = useState<CodingChallenge | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300);
  const timeLeftRef = useRef(300);
  const timeoutHandlerRef = useRef<() => void>(() => {});
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [matchOver, setMatchOver] = useState(false);
  const [matchResult, setMatchResult] = useState<"win" | "loss" | null>(null);
  const [warnings, setWarnings] = useState(0);

  // Stats storage
  const [stats, setStats] = useState<GameStats>(() => {
    if (typeof window === "undefined") return { wins: 0, losses: 0, streak: 0 };
    try {
      const saved = localStorage.getItem("skillbridge_battle_stats");
      return saved ? (JSON.parse(saved) as GameStats) : { wins: 0, losses: 0, streak: 0 };
    } catch {
      return { wins: 0, losses: 0, streak: 0 };
    }
  });

  // Coding state
  const [code, setCode] = useState("// Write your optimal solution here\nfunction solve(arr) {\n  \n}");
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);

  // Question palette quiz state.
  const [questionsList, setQuestionsList] = useState<Question[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [visitedQuestions, setVisitedQuestions] = useState<Set<number>>(new Set([0]));
  const [questionTimes, setQuestionTimes] = useState<Record<number, number>>({});
  const [timedOutQuestions, setTimedOutQuestions] = useState<Set<number>>(new Set());

  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);

  // ESC key listener for pause / cancel
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape" && matchStarted && !matchOver) {
      setIsPaused((prev) => !prev);
    }
  }, [matchStarted, matchOver]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const endMatch = useCallback((result: "win" | "loss") => {
    setMatchOver(true);
    setMatchResult(result);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});

    const nextStats = {
      wins: result === "win" ? stats.wins + 1 : stats.wins,
      losses: result === "loss" ? stats.losses + 1 : stats.losses,
      streak: result === "win" ? stats.streak + 1 : 0,
    };
    setStats(nextStats);
    localStorage.setItem("skillbridge_battle_stats", JSON.stringify(nextStats));
  }, [stats]);

  const finalizeMatch = useCallback((answers = selectedAnswers, codingScore?: number, codingCorrect = false) => {
    const finalCorrectCount = selectedMode === "coding"
      ? Number(codingCorrect)
      : Object.entries(answers).reduce((total, [index, answer]) => total + Number(questionsList[Number(index)]?.correct === answer), 0);
    const finalScore = selectedMode === "coding" ? (codingScore ?? 0) : Math.round((finalCorrectCount / Math.max(1, questionsList.length)) * 100);
    setCorrectCount(finalCorrectCount);
    setScore(finalScore);
    const simulatedOpponent = Math.floor(Math.random() * 150) + 180;
    const scaledOpponent = Math.round(simulatedOpponent / 4.5);
    setOpponentScore(scaledOpponent);
    const won = finalScore >= scaledOpponent;
    endMatch(won ? "win" : "loss");
  }, [endMatch, questionsList, selectedAnswers, selectedMode]);

  const handleTimeoutNext = useCallback(() => {
    const nextTimedOut = new Set(timedOutQuestions);
    nextTimedOut.add(currentQIndex);
    setTimedOutQuestions(nextTimedOut);
    const nextIdx = questionsList.findIndex((_, index) => index > currentQIndex && !nextTimedOut.has(index));
    if (nextIdx >= 0) {
      setCurrentQIndex(nextIdx);
      setVisitedQuestions((visited) => new Set(visited).add(nextIdx));
      setTimeLeft(questionTimes[nextIdx] ?? (selectedMode === "logical" ? 60 : 30));
      return;
    }
    finalizeMatch();
  }, [currentQIndex, finalizeMatch, questionTimes, questionsList, selectedMode, timedOutQuestions]);

  useEffect(() => {
    timeoutHandlerRef.current = handleTimeoutNext;
  }, [handleTimeoutNext]);

  // Timer loop
  useEffect(() => {
    if (!matchStarted || matchOver || isPaused || loadingQuestions) return;
    const timer = setInterval(() => {
      if (timeLeftRef.current <= 0) return;
      const nextTime = Math.max(0, timeLeftRef.current - 1);
      timeLeftRef.current = nextTime;
      setTimeLeft(nextTime);
      if (selectedMode !== "coding") {
        setQuestionTimes((times) => ({ ...times, [currentQIndex]: nextTime }));
      }
      if (nextTime === 0) {
        if (selectedMode === "coding") finalizeMatch();
        else {
          setQuestionTimes((times) => ({ ...times, [currentQIndex]: 0 }));
          timeoutHandlerRef.current();
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [matchStarted, matchOver, isPaused, loadingQuestions, currentQIndex, selectedMode, selectedAnswers, finalizeMatch]);

  // Anti-cheat Fullscreen & Tab Switch Detection
  useEffect(() => {
    if (!matchStarted || matchOver || isPaused || loadingQuestions) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setWarnings((w) => {
          const nextW = w + 1;
          if (nextW >= 2) {
            alert("⚠️ Anti-Cheat Violation: Multiple tab switches detected. Match forfeited.");
            endMatch("loss");
          } else {
            alert("⚠️ Warning: Leaving the game window is restricted and flagged as cheating!");
          }
          return nextW;
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.documentElement.requestFullscreen().catch(() => {});

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [matchStarted, matchOver, isPaused, loadingQuestions, endMatch]);

  const startMatch = async (mode: GameMode) => {
    setSelectedMode(mode);
    setMatchStarted(true);
    setLoadingQuestions(true);
    setQuestionError(null);
    setQuestionsList([]);
    setCodingChallenge(null);
    setIsPaused(false);
    setScore(0);
    setCorrectCount(0);
    setOpponentScore(0);
    setMatchOver(false);
    setMatchResult(null);
    setAiFeedback(null);
    setWarnings(0);
    setCurrentQIndex(0);
    setSelectedAnswers({});
    setVisitedQuestions(new Set([0]));
    setQuestionTimes({});
    setTimedOutQuestions(new Set());

    try {
      const previousQuestions = JSON.parse(localStorage.getItem("skillbridge_battle_seen_questions") || "[]");
      const res = await fetch("/api/games/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ mode, previousQuestions: Array.isArray(previousQuestions) ? previousQuestions : [] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not generate questions. Please try again.");
      if (mode === "coding") {
        setCodingChallenge(data);
        setCode(data.starterCode);
        previousQuestions.push(data.title);
        setTimeLeft(300);
      } else {
        setQuestionsList(data);
        previousQuestions.push(...data.map((question: Question) => question.question));
        setTimeLeft(mode === "logical" ? 60 : 30);
      }
      localStorage.setItem("skillbridge_battle_seen_questions", JSON.stringify(previousQuestions.slice(-60)));
      setMatchStarted(true);
    } catch (error) {
      setMatchStarted(false);
      setQuestionError(error instanceof DOMException && error.name === "TimeoutError"
        ? "Question generation timed out. Please try again."
        : error instanceof Error ? error.message : "Could not generate questions. Please try again.");
      setSelectedMode(null);
    } finally {
      setLoadingQuestions(false);
    }
  };

  const submitCodeForAi = async () => {
    setEvaluating(true);
    try {
      const res = await fetch("/api/games/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: codingChallenge?.title,
          problem: codingChallenge?.problem,
          code,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Code review failed.");
      const grade = Number(data.score) || 0;
      setScore(grade);
      setAiFeedback(data.feedback || "Code review completed.");
      setCorrectCount(data.correct ? 1 : 0);
      setTimeout(() => finalizeMatch({}, grade, Boolean(data.correct)), 2500);
    } catch (error) {
      setAiFeedback(error instanceof Error ? error.message : "Code review failed. Please try again.");
    } finally {
      setEvaluating(false);
    }
  };

  const handleSelectOption = (optIndex: number) => {
    if (timedOutQuestions.has(currentQIndex)) return;
    setSelectedAnswers({ ...selectedAnswers, [currentQIndex]: optIndex });
  };

  const moveToNextQuestion = () => {
    setQuestionTimes((times) => ({ ...times, [currentQIndex]: timeLeft }));
    const nextIdx = questionsList.findIndex((_, index) => index > currentQIndex && !timedOutQuestions.has(index));
    if (nextIdx >= 0) {
      setCurrentQIndex(nextIdx);
      setVisitedQuestions(new Set(visitedQuestions).add(nextIdx));
      setTimeLeft(questionTimes[nextIdx] ?? (selectedMode === "logical" ? 60 : 30));
    } else {
      finalizeMatch();
    }
  };

  const jumpToQuestion = (idx: number) => {
    if (timedOutQuestions.has(idx)) return;
    setQuestionTimes((times) => ({ ...times, [currentQIndex]: timeLeft }));
    setCurrentQIndex(idx);
    setVisitedQuestions(new Set(visitedQuestions).add(idx));
    setTimeLeft(questionTimes[idx] ?? (selectedMode === "logical" ? 60 : 30));
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header & Stats Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-[#EDE6DA] shadow-sm">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-[#FFF5E5] px-3 py-1 text-xs font-semibold text-[#75451F]">
            <Trophy size={14} /> SkillBridge Battle Arena
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#24211D] mt-2">Competitive Skill Battles & Practice Arena</h1>
          <p className="text-sm text-[#6F675C]">Randomized practice matches with per-question timers and interactive navigation.</p>
        </div>
        <div className="flex items-center gap-4 bg-[#FFFCF6] p-3 rounded-xl border border-[#EDE6DA]">
          <div className="text-center px-3">
            <div className="text-xs text-[#6F675C]">Wins</div>
            <div className="text-lg font-bold text-[#2E7D32]">{stats.wins}</div>
          </div>
          <div className="text-center px-3 border-x border-[#EDE6DA]">
            <div className="text-xs text-[#6F675C]">Losses</div>
            <div className="text-lg font-bold text-[#C62828]">{stats.losses}</div>
          </div>
          <div className="text-center px-3 flex items-center gap-2">
            <Flame className="text-[#E99A32]" size={20} />
            <div>
              <div className="text-xs text-[#6F675C]">Streak</div>
              <div className="text-lg font-bold text-[#E99A32]">{stats.streak}</div>
            </div>
          </div>
        </div>
      </div>

      {questionError && !matchStarted && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{questionError}</div>
      )}

      {loadingQuestions ? (
        <div className="max-w-md mx-auto bg-white border border-[#EDE6DA] p-12 rounded-2xl text-center shadow-sm">
          <Loader2 className="w-12 h-12 text-[#75451F] animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[#24211D]">Preparing Your Questions...</h3>
          <p className="text-sm text-[#6F675C] mt-1">Creating a fresh randomized practice set.</p>
        </div>
      ) : !matchStarted ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border border-[#EDE6DA] p-6 rounded-2xl flex flex-col justify-between shadow-sm hover:border-[#F4B942] transition">
            <div>
              <div className="size-12 rounded-xl bg-[#FFF5E5] text-[#75451F] flex items-center justify-center mb-4"><Code2 size={24} /></div>
              <h3 className="text-lg font-bold text-[#24211D]">Coding Challenge</h3>
              <p className="text-sm text-[#6F675C] mt-2">Solve a randomized algorithm problem in the side editor and get a basic local code review.</p>
              <div className="mt-4 text-xs font-semibold text-[#75451F]">⏱️ 5 Minutes Timer</div>
            </div>
            <button onClick={() => startMatch("coding")} className="mt-6 w-full bg-[#F4B942] hover:bg-[#E99A32] text-[#24211D] font-medium py-3 rounded-xl transition flex items-center justify-center gap-2">
              <Play size={16} /> Play Coding Match
            </button>
          </div>

          <div className="bg-white border border-[#EDE6DA] p-6 rounded-2xl flex flex-col justify-between shadow-sm hover:border-[#F4B942] transition">
            <div>
              <div className="size-12 rounded-xl bg-[#FFF5E5] text-[#75451F] flex items-center justify-center mb-4"><BrainCircuit size={24} /></div>
              <h3 className="text-lg font-bold text-[#24211D]">Logical Reasoning</h3>
              <p className="text-sm text-[#6F675C] mt-2">10 randomized pattern and deduction questions with interactive navigation.</p>
              <div className="mt-4 text-xs font-semibold text-[#75451F]">⏱️ 1 Min per Question · 10 Qs</div>
            </div>
            <button onClick={() => startMatch("logical")} className="mt-6 w-full bg-[#F4B942] hover:bg-[#E99A32] text-[#24211D] font-medium py-3 rounded-xl transition flex items-center justify-center gap-2">
              <Play size={16} /> Play Logical Match
            </button>
          </div>

          <div className="bg-white border border-[#EDE6DA] p-6 rounded-2xl flex flex-col justify-between shadow-sm hover:border-[#F4B942] transition">
            <div>
              <div className="size-12 rounded-xl bg-[#FFF5E5] text-[#75451F] flex items-center justify-center mb-4"><HelpCircle size={24} /></div>
              <h3 className="text-lg font-bold text-[#24211D]">GK & Tech MCQs</h3>
              <p className="text-sm text-[#6F675C] mt-2">10 randomized computer science and technology multiple-choice questions.</p>
              <div className="mt-4 text-xs font-semibold text-[#75451F]">⏱️ 30 Sec per Question · 10 Qs</div>
            </div>
            <button onClick={() => startMatch("gk")} className="mt-6 w-full bg-[#F4B942] hover:bg-[#E99A32] text-[#24211D] font-medium py-3 rounded-xl transition flex items-center justify-center gap-2">
              <Play size={16} /> Play MCQ Match
            </button>
          </div>
        </div>
      ) : matchOver ? (
        <div className="max-w-lg mx-auto bg-white border border-[#EDE6DA] p-8 rounded-2xl text-center shadow-lg space-y-6">
          <Award className={`w-16 h-16 mx-auto ${matchResult === "win" ? "text-[#2E7D32]" : "text-[#C62828]"}`} />
          <h2 className="text-2xl font-bold text-[#24211D]">{matchResult === "win" ? "🎉 Victory! Match Won" : "❌ Defeat! Match Lost"}</h2>
          
          {/* Calculated Score Breakdown Card */}
          <div className="bg-[#FFFCF6] p-4 rounded-xl border border-[#EDE6DA] text-left space-y-2 text-sm">
            <div className="flex justify-between font-semibold text-[#24211D] border-b border-[#EDE6DA] pb-2">
              <span>Performance Summary</span>
              <span>Score</span>
            </div>
            <div className="flex justify-between text-[#6F675C]">
              <span>{selectedMode === "coding" ? "Code Checks Passed:" : "Correct Answers:"}</span>
              <span className="font-bold text-[#2E7D32]">{correctCount} / {selectedMode === "coding" ? 1 : questionsList.length}</span>
            </div>
            <div className="flex justify-between text-[#6F675C]">
              <span>Your Calculated Total Score:</span>
              <span className="font-bold text-[#75451F]">{score}%</span>
            </div>
            <div className="flex justify-between text-[#6F675C]">
              <span>Opponent Score:</span>
              <span className="font-bold text-[#C62828]">{opponentScore}%</span>
            </div>
          </div>

          <button onClick={() => setMatchStarted(false)} className="w-full bg-[#F4B942] hover:bg-[#E99A32] text-[#24211D] font-medium py-3 rounded-xl transition">
            Back to Arena Lobby
          </button>
        </div>
      ) : isPaused ? (
        <div className="max-w-md mx-auto bg-white border border-[#EDE6DA] p-8 rounded-2xl text-center shadow-2xl">
          <Pause className="w-16 h-16 text-[#E99A32] mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-[#24211D]">Match Paused</h2>
          <p className="text-sm text-[#6F675C] mt-2">You pressed ESC. Choose whether to resume or cancel the match.</p>
          <div className="mt-6 flex gap-3">
            <button onClick={() => setIsPaused(false)} className="flex-1 bg-[#F4B942] hover:bg-[#E99A32] text-[#24211D] font-medium py-2.5 rounded-xl transition text-sm">
              Resume Match
            </button>
            <button onClick={() => setMatchStarted(false)} className="flex-1 bg-[#FBEDEB] text-[#C62828] border border-[#F0D5D0] font-medium py-2.5 rounded-xl transition text-sm">
              Cancel Match
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#EDE6DA] rounded-2xl p-6 shadow-sm">
          <div className="flex justify-between items-center mb-6 border-b border-[#EDE6DA] pb-4">
            <div className="flex items-center gap-3">
              <span className="bg-[#FFF5E5] text-[#75451F] px-3 py-1 rounded-full text-xs font-semibold uppercase">
                {selectedMode === "coding" ? "Coding Challenge (5 Mins)" : `Question ${currentQIndex + 1} of 10 (${selectedMode})`}
              </span>
              <span className={`flex items-center gap-1.5 font-mono text-sm font-bold px-3 py-1 rounded-full border ${timeLeft === 0 ? "text-[#C62828] bg-[#FBEDEB] border-[#F0D5D0]" : "text-[#75451F] bg-[#FFF5E5] border-[#F4B942]"}`}>
                <Clock size={15} /> {Math.floor(timeLeft / 60)}:{("0" + (timeLeft % 60)).slice(-2)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => finalizeMatch()} className="bg-[#2E7D32] hover:bg-[#256428] text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition">
                Submit Match Now
              </button>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#C62828] bg-[#FBEDEB] px-3 py-1 rounded-full border border-[#F0D5D0]">
                <ShieldAlert size={14} /> Screen Lock Active (Warning: {warnings}/2)
              </div>
            </div>
          </div>

          {selectedMode === "coding" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#FFFCF6] p-6 rounded-xl border border-[#EDE6DA] flex flex-col justify-between">
                <div>
                  <h3 className="text-base font-bold text-[#24211D] mb-2">{codingChallenge?.title ?? "Coding Challenge"}</h3>
                  <p className="text-sm text-[#6F675C] leading-relaxed">
                    {codingChallenge?.problem}
                  </p>
                  {codingChallenge?.examples.map((example, index) => (
                    <div key={index} className="mt-4 p-3 bg-white rounded-lg font-mono text-xs text-[#6F675C] border border-[#EDE6DA] whitespace-pre-wrap">{example}</div>
                  ))}
                </div>
                {aiFeedback && (
                  <div className="mt-4 whitespace-pre-wrap p-4 bg-[#FFF5E5] border border-[#EDE6DA] rounded-xl text-xs text-[#75451F]">
                    <strong>Offline Code Review:</strong> {aiFeedback}
                  </div>
                )}
              </div>

              <div className="flex flex-col">
                <div className="text-xs font-semibold text-[#6F675C] mb-2">Code Editor Panel</div>
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full h-64 bg-[#24211D] text-[#F4B942] font-mono text-sm p-4 rounded-xl border border-[#24211D] focus:outline-none focus:border-[#F4B942] resize-none"
                />
                <button
                  disabled={evaluating}
                  onClick={submitCodeForAi}
                  className="mt-4 w-full bg-[#F4B942] hover:bg-[#E99A32] disabled:opacity-50 text-[#24211D] font-medium py-3 rounded-xl transition flex items-center justify-center gap-2"
                >
                  {evaluating ? "Checking code structure..." : "Submit for Local Code Review"}
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto py-4 space-y-6">
              {/* Question palette */}
              <div className="bg-[#FFFCF6] p-4 rounded-xl border border-[#EDE6DA]">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-[#6F675C]">Question Palette (timed-out questions are locked):</div>
                  <div className="flex flex-wrap gap-3 text-[10px] font-medium text-[#6F675C]">
                    <span className="flex items-center gap-1"><i className="size-2.5 rounded-sm bg-[#F4B942]" /> In progress</span>
                    <span className="flex items-center gap-1"><i className="size-2.5 rounded-sm bg-[#2E7D32]" /> Answered</span>
                    <span className="flex items-center gap-1"><i className="size-2.5 rounded-sm bg-[#C62828]" /> Time expired</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {questionsList.map((q, idx) => {
                    const isAnswered = selectedAnswers[idx] !== undefined;
                    const isCurrent = currentQIndex === idx;
                    const isTimedOut = timedOutQuestions.has(idx);
                    const isVisited = visitedQuestions.has(idx);
                    return (
                      <button
                        key={q.id || idx}
                        onClick={() => jumpToQuestion(idx)}
                        disabled={isTimedOut && !isCurrent}
                        aria-label={`Question ${idx + 1}${isAnswered ? ", answered" : isTimedOut ? ", time expired and locked" : isVisited ? ", in progress" : ", not started"}`}
                        className={`size-9 rounded-lg font-bold text-xs flex items-center justify-center transition border disabled:cursor-not-allowed ${
                          isAnswered
                            ? "bg-[#2E7D32] text-white border-[#2E7D32]"
                            : isTimedOut
                              ? "bg-[#C62828] text-white border-[#C62828]"
                              : isVisited
                                ? "bg-[#FFF5E5] text-[#75451F] border-[#F4B942]"
                                : "bg-white text-[#6F675C] border-[#EDE6DA]"
                        } ${isCurrent ? "ring-2 ring-[#F4B942]/35 ring-offset-2" : ""}`}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Question Box with Options Rendering Properly */}
              {questionsList[currentQIndex] ? (
                <div className="bg-[#FFFCF6] p-6 rounded-xl border border-[#EDE6DA]">
                  <div className="text-xs font-semibold text-[#75451F] mb-1">Question {currentQIndex + 1} of {questionsList.length}</div>
                  <h3 className="text-lg font-bold text-[#24211D] mb-4">
                    {questionsList[currentQIndex].question}
                  </h3>
                  <div className="space-y-3">
                    {questionsList[currentQIndex].options.map((opt, i) => {
                      const isSelected = selectedAnswers[currentQIndex] === i;
                      return (
                        <button
                          key={i}
                          onClick={() => handleSelectOption(i)}
                          className={`w-full text-left p-4 rounded-xl transition text-sm font-medium border ${
                            isSelected
                              ? "bg-[#FFF5E5] border-[#F4B942] text-[#75451F] shadow-sm"
                              : "bg-white border-[#EDE6DA] text-[#24211D] hover:border-[#F4B942]"
                          }`}
                        >
                          <span className="font-bold mr-2 text-[#75451F]">{String.fromCharCode(65 + i)}.</span> {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center text-sm text-slate-500">Loading questions...</div>
              )}

              {/* Separate Action Buttons */}
              <div className="flex gap-4">
                <button
                  onClick={moveToNextQuestion}
                  className="flex-1 bg-[#2E7D32] hover:bg-[#256428] text-white font-medium py-3 rounded-xl transition text-sm flex items-center justify-center gap-2 shadow-sm"
                >
                  <Save size={16} /> Save Answer & Next
                </button>
                <button
                  onClick={moveToNextQuestion}
                  className="flex-1 bg-[#F4B942] hover:bg-[#E99A32] text-[#24211D] font-medium py-3 rounded-xl transition text-sm flex items-center justify-center gap-2 shadow-sm"
                >
                  Skip Question <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <AppShell>
      <GamesPage />
    </AppShell>
  );
}

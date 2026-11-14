"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AiError, ai, aiCache, uploadResume as uploadResumeFile } from "./client";
import type {
  InterviewEvaluation,
  InterviewQuestion,
  InterviewQuestionsResponse,
  JobMatch,
  ModelStatus,
  ResumeAnalysis,
  RoadmapResponse,
  SkillMatchResult,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Browser speech APIs are not in the default TypeScript DOM lib.             */
/* -------------------------------------------------------------------------- */
type SpeechResultAlternative = { transcript: string };
type SpeechResult = { isFinal: boolean; 0: SpeechResultAlternative };
type SpeechEvent = { resultIndex: number; results: { length: number; [index: number]: SpeechResult } };
type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => RecognitionLike;

export type LiveInterviewAnswer = {
  question: string;
  questionId?: string;
  answer: string;
  evaluation: InterviewEvaluation;
};

export type LiveInterview = {
  sessionId?: string;
  type: string;
  role: string;
  questions: InterviewQuestion[];
  answers: LiveInterviewAnswer[];
  provider?: string;
};

export type LiveHistoryItem = { type: string; score: number; date: string; status?: string };

const FALLBACK_MATCH: SkillMatchResult = {
  matched: [],
  partial: [],
  missing: [],
  matched_names: [],
  partial_names: [],
  missing_names: [],
  coverage: 0,
  weighted_coverage: 0,
};

function errorMessage(error: unknown): string {
  if (error instanceof AiError) return error.message;
  if (error instanceof Error) return error.message;
  return "The AI service could not complete that request.";
}

function toHistory(sessions: Record<string, unknown>[]): LiveHistoryItem[] {
  return sessions
    .filter((session) => typeof session.role === "string")
    .slice(0, 12)
    .map((session) => ({
      type: String(session.role),
      score: Number(session.score ?? 0),
      status: String(session.status ?? "COMPLETED"),
      date: String(session.created_at ?? "").slice(0, 10) || "Recently",
    }));
}

export function useAiWorkspace() {
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [jobs, setJobs] = useState<JobMatch[]>([]);
  const [savedJobIds, setSavedJobIds] = useState<string[]>([]);
  const [applications, setApplications] = useState<Record<string, unknown>[]>([]);
  const [roadmap, setRoadmap] = useState<RoadmapResponse | null>(null);
  const [history, setHistory] = useState<LiveHistoryItem[]>([]);
  const [interview, setInterview] = useState<LiveInterview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"live" | "cache" | "idle">("idle");
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognition = useRef<RecognitionLike | null>(null);

  /* Restore cached results instantly, then reconcile with the live service. */
  useEffect(() => {
    const cachedAnalysis = aiCache.getAnalysis();
    if (cachedAnalysis) {
      setAnalysis(cachedAnalysis);
      setSource("cache");
    }
    const cachedRoadmap = aiCache.getRoadmap();
    if (cachedRoadmap) setRoadmap(cachedRoadmap);
    const cachedInterview = aiCache.getInterview();
    if (cachedInterview) {
      setInterview({
        sessionId: cachedInterview.sessionId,
        type: cachedInterview.type,
        role: cachedInterview.type,
        questions: cachedInterview.questions,
        answers: cachedInterview.answers.map((item: { question: string; answer: string; evaluation: InterviewEvaluation }) => ({
          question: item.question,
          answer: item.answer,
          evaluation: item.evaluation,
        })),
        provider: cachedInterview.provider,
      });
    }

    const speechWindow = window as unknown as {
      SpeechRecognition?: RecognitionCtor;
      webkitSpeechRecognition?: RecognitionCtor;
    };
    setVoiceSupported(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));

    let alive = true;
    (async () => {
      const [latest, models, saved, apps, sessions] = await Promise.allSettled([
        ai.latestResume(),
        ai.modelStatus(),
        ai.savedJobs(),
        ai.applications(),
        ai.interviewHistory(),
      ]);
      if (!alive) return;
      const latestAnalysis = latest.status === "fulfilled" ? latest.value.analysis : null;
      if (latestAnalysis) {
        setAnalysis(latestAnalysis);
        setSource("live");
      }
      if (models.status === "fulfilled") setModelStatus(models.value);
      if (saved.status === "fulfilled") setSavedJobIds(saved.value.saved_job_ids);
      if (apps.status === "fulfilled") setApplications(apps.value.applications);
      if (sessions.status === "fulfilled") setHistory(toHistory(sessions.value.sessions));
      if (latestAnalysis) {
        try {
          const matched = await ai.matchJobs({
            skills: latestAnalysis.skill_names,
            resumeText: latestAnalysis.profile.summary ?? "",
            limit: 20,
          });
          if (alive) setJobs(matched.jobs);
        } catch {
          // Job scoring degrades quietly; the screens keep their sample cards.
        }
      }
    })();

    return () => {
      alive = false;
      try {
        recognition.current?.abort();
      } catch {
        // The browser may already have released the recognizer.
      }
    };
  }, []);

  const run = useCallback(async <T,>(label: string, task: () => Promise<T>): Promise<T> => {
    setBusy(label);
    setError(null);
    try {
      const value = await task();
      setSource("live");
      return value;
    } catch (caught) {
      setError(errorMessage(caught));
      throw caught;
    } finally {
      setBusy(null);
    }
  }, []);

  const upload = useCallback(
    async (
      file: File,
      options: { targetRole: string; jobDescription?: string; onProgress?: (percent: number) => void },
    ) => {
      return run("Reading and analyzing your resume", async () => {
        const result = await uploadResumeFile(file, {
          targetRole: options.targetRole,
          jobDescription: options.jobDescription,
          onProgress: options.onProgress,
        });
        setAnalysis(result.analysis);
        aiCache.setAnalysis(result.analysis);
        return result;
      });
    },
    [run],
  );

  const analyze = useCallback(
    async (targetRole: string, jobDescription = "") => {
      return run("Matching your profile to the role", async () => {
        const result = await ai.analyzeCareer({ targetRole, jobDescription });
        setAnalysis(result);
        aiCache.setAnalysis(result);
        return result;
      });
    },
    [run],
  );

  const loadJobs = useCallback(
    async (skills?: string[], resumeText = "") => {
      return run("Scoring jobs with MiniLM", async () => {
        const result = await ai.matchJobs({
          skills: skills ?? analysis?.skill_names ?? [],
          resumeText: resumeText || analysis?.profile.summary || "",
          limit: 20,
        });
        setJobs(result.jobs);
        return result;
      });
    },
    [analysis, run],
  );

  const buildRoadmap = useCallback(
    async (targetRole: string, missingSkills?: string[]) => {
      return run("Building your learning plan with Qwen", async () => {
        const result = await ai.generateRoadmap({
          missingSkills: missingSkills ?? analysis?.missing_skills ?? [],
          targetRole,
          learnerContext: analysis?.profile.headline || "",
          useLlm: true,
        });
        setRoadmap(result);
        aiCache.setRoadmap(result);
        return result;
      });
    },
    [analysis, run],
  );

  const startInterview = useCallback(
    async (options: {
      type: string;
      role: string;
      difficulty?: string;
      skills?: string[];
      resumeContext?: string;
      useLlm?: boolean;
    }) => {
      return run("Preparing personalized questions", async () => {
        const result: InterviewQuestionsResponse = await ai.interviewQuestions({
          role: options.role,
          mode: options.type,
          difficulty: options.difficulty ?? "intermediate",
          resumeContext: options.resumeContext ?? analysis?.profile.summary ?? "",
          skills: options.skills ?? analysis?.skill_names ?? [],
          useLlm: options.useLlm ?? true,
        });
        const next: LiveInterview = {
          sessionId: result.session_id,
          type: options.type,
          role: options.role,
          questions: result.questions,
          answers: [],
          provider: result.provider,
        };
        setInterview(next);
        aiCache.setInterview({
          sessionId: next.sessionId,
          type: next.type,
          questions: next.questions,
          answers: [],
          provider: next.provider,
        });
        return result;
      });
    },
    [analysis, run],
  );

  const evaluate = useCallback(
    async (question: string, answer: string, role: string, questionId?: string) => {
      return run("Scoring your answer", async () => {
        const result = await ai.evaluateAnswer({
          question,
          answer,
          role,
          sessionId: interview?.sessionId,
          questionId,
        });
        setInterview((current) => {
          if (!current) return current;
          const next: LiveInterview = {
            ...current,
            answers: [
              ...current.answers,
              { question, questionId, answer, evaluation: result },
            ],
          };
          aiCache.setInterview({
            sessionId: next.sessionId,
            type: next.type,
            questions: next.questions,
            answers: next.answers,
            provider: next.provider,
          });
          return next;
        });
        return result;
      });
    },
    [interview?.sessionId, run],
  );

  const finishInterview = useCallback(
    async (score: number, type: string) => {
      if (interview?.sessionId) {
        try {
          await ai.completeInterview(interview.sessionId, score);
          const sessions = await ai.interviewHistory();
          setHistory(toHistory(sessions.sessions));
        } catch {
          // The local report still renders if persistence is unavailable.
        }
      }
      aiCache.addInterviewHistory({
        type,
        score,
        date: new Date().toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
      });
    },
    [interview?.sessionId],
  );

  const toggleSave = useCallback(
    async (jobId: string) => {
      const result = await ai.toggleSavedJob(jobId);
      setSavedJobIds(result.saved_job_ids);
      return result;
    },
    [],
  );

  const apply = useCallback(async (jobId: string) => {
    const result = await ai.applyJob(jobId);
    const apps = await ai.applications();
    setApplications(apps.applications);
    return result;
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 600));
    utterance.lang = "en-US";
    utterance.rate = 0.98;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  const stopListening = useCallback(() => {
    try {
      recognition.current?.stop();
    } catch {
      // Ignore a recognizer that already stopped.
    }
    setListening(false);
  }, []);

  const startListening = useCallback(
    (onTranscript: (text: string) => void) => {
      if (typeof window === "undefined") return;
      const speechWindow = window as unknown as {
        SpeechRecognition?: RecognitionCtor;
        webkitSpeechRecognition?: RecognitionCtor;
      };
      const Ctor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
      if (!Ctor) {
        setError("Voice input is not supported in this browser. Chrome or Edge works best.");
        return;
      }
      try {
        recognition.current?.abort();
        const instance = new Ctor();
        instance.lang = "en-US";
        instance.continuous = true;
        instance.interimResults = true;
        let finalText = "";
        instance.onresult = (event) => {
          let interim = "";
          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index];
            const transcript = result[0]?.transcript ?? "";
            if (result.isFinal) finalText += `${transcript} `;
            else interim += transcript;
          }
          onTranscript(`${finalText}${interim}`.trim());
        };
        instance.onerror = () => setListening(false);
        instance.onend = () => setListening(false);
        instance.start();
        recognition.current = instance;
        setListening(true);
      } catch {
        setError("The microphone could not start. Check browser permissions.");
      }
    },
    [],
  );

  const refreshModels = useCallback(async () => {
    try {
      const status = await ai.modelStatus();
      setModelStatus(status);
      return status;
    } catch {
      return null;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const match: SkillMatchResult = analysis?.match ?? FALLBACK_MATCH;

  return {
    analysis,
    match,
    modelStatus,
    jobs,
    savedJobIds,
    applications,
    roadmap,
    history,
    interview,
    busy,
    error,
    source,
    listening,
    voiceSupported,
    upload,
    analyze,
    loadJobs,
    buildRoadmap,
    startInterview,
    evaluate,
    finishInterview,
    toggleSave,
    apply,
    speak,
    stopSpeaking,
    startListening,
    stopListening,
    refreshModels,
    clearError,
  };
}

export type AiWorkspace = ReturnType<typeof useAiWorkspace>;

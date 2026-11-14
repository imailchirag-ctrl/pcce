"use client";

/**
 * interviewer-live-view.tsx — Remote Proctor & Interviewer Command Center.
 *
 * Real-time capabilities:
 *  1. Live candidate webcam feed and screen rendering via BroadcastChannel + HTTP fallback.
 *  2. Multi-Model Telemetry: MediaPipe 3D head pose, eye gaze vectors, YOLO objects.
 *  3. 3-Strike Enforcement: Real-time strike tracking with negative marking (-25% penalty score).
 *  4. Live Candidate Speech Transcript: Streams candidate spoken answers in real-time.
 *  5. Direct Proctor Intervention: Issue warnings, apply manual strikes, terminate for malpractice.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Award,
  Ban,
  Camera,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Cpu,
  Eye,
  FileText,
  Layers,
  Loader2,
  Maximize2,
  Mic,
  Radio,
  RefreshCw,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Video,
  Volume2,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";

type ProctorEvent = {
  id: string;
  rule: string;
  event_type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  duration_seconds?: number;
  active?: boolean;
};

type ProctorMessage = {
  id: string;
  sender: string;
  message: string;
  timestamp: string;
};

type StrikeRecord = {
  strike: number;
  timestamp: string;
  persons_count: number;
  detail: string;
};

type LiveProctorState = {
  session_id: string;
  connected: boolean;
  latest_frame_b64: string;
  latest_telemetry: {
    head_pose?: { yaw: number; pitch: number; roll: number; direction: string };
    eye_gaze?: { direction: string; horizontal: string; vertical: string; diverted?: boolean; ratio?: number };
    micro_metrics?: { mouth_open: boolean; mouth_ratio: number; ear: number };
    people_count?: number;
    objects_count?: number;
    strikes?: number;
  };
  latest_boxes: {
    faces?: Array<{ x: number; y: number; w: number; h: number; label: string; is_primary: boolean; status: string }>;
    objects?: Array<{ class: string; confidence: number; bbox: [number, number, number, number]; flagged: boolean }>;
    mesh_points?: Array<[number, number]>;
    frame_w?: number;
    frame_h?: number;
  };
  multi_face_strikes: number;
  terminated: boolean;
  negative_marking: {
    penalty_score: number;
    status: string;
    verdict: string;
    strike_records: StrikeRecord[];
    incident_summary: string;
  } | null;
  events_log: ProctorEvent[];
  proctor_messages: ProctorMessage[];
  integrity_score: number;
  transcript?: string;
};

export function InterviewerLiveView({
  initialSessionId,
  onBack,
}: {
  initialSessionId?: string;
  onBack?: () => void;
}) {
  const [sessionId, setSessionId] = useState<string>(() => {
    if (initialSessionId) return initialSessionId;
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const s = urlParams.get("session");
      if (s) return s;
    }
    return "default_interview";
  });

  const [state, setState] = useState<LiveProctorState>({
    session_id: sessionId,
    connected: false,
    latest_frame_b64: "",
    latest_telemetry: {
      head_pose: { yaw: 0, pitch: 0, roll: 0, direction: "CENTER" },
      eye_gaze: { direction: "CENTER", horizontal: "CENTER", vertical: "CENTER" },
      micro_metrics: { mouth_open: false, mouth_ratio: 0, ear: 0.3 },
      people_count: 1,
      objects_count: 0,
      strikes: 0,
    },
    latest_boxes: { faces: [], objects: [], mesh_points: [], frame_w: 640, frame_h: 480 },
    multi_face_strikes: 0,
    terminated: false,
    negative_marking: null,
    events_log: [],
    proctor_messages: [],
    integrity_score: 100,
    transcript: "",
  });

  const [customMsg, setCustomMsg] = useState("");
  const [sendingAction, setSendingAction] = useState(false);
  const [showMesh, setShowMesh] = useState(true);
  const [showBoxes, setShowBoxes] = useState(true);
  const [broadcastActive, setBroadcastActive] = useState(false);
  const [pollingActive, setPollingActive] = useState(true);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // ── Sync via BroadcastChannel across local tabs ─────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel("skillbridge_interview_proctor");
    broadcastChannelRef.current = channel;

    channel.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data) return;

      if (data.type === "CANDIDATE_FRAME_SYNC") {
        setBroadcastActive(true);
        setState((prev) => ({
          ...prev,
          connected: true,
          session_id: data.sessionId || prev.session_id,
          latest_frame_b64: data.frameB64 || prev.latest_frame_b64,
          latest_telemetry: data.telemetry || prev.latest_telemetry,
          latest_boxes: data.boxes || prev.latest_boxes,
          multi_face_strikes: data.strikes ?? prev.multi_face_strikes,
          terminated: Boolean(data.terminated),
          negative_marking: data.negative_marking ?? prev.negative_marking,
          events_log: data.eventsLog || prev.events_log,
          integrity_score: data.integrityScore ?? prev.integrity_score,
          transcript: data.transcript ?? prev.transcript,
        }));
      } else if (data.type === "CANDIDATE_TRANSCRIPT_UPDATE") {
        setState((prev) => ({ ...prev, transcript: data.transcript }));
      }
    };

    return () => {
      channel.close();
    };
  }, []);

  // ── Periodic Polling Fallback to FastAPI Backend ─────────────────────────────
  const fetchProctorData = useCallback(async () => {
    try {
      const res = await fetch(`/api/backend/interviews/anticheat/proctor/${encodeURIComponent(sessionId)}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as LiveProctorState;
      if (data && data.connected) {
        setState((prev) => ({
          ...prev,
          connected: true,
          latest_frame_b64: data.latest_frame_b64 || prev.latest_frame_b64,
          latest_telemetry: data.latest_telemetry || prev.latest_telemetry,
          latest_boxes: data.latest_boxes || prev.latest_boxes,
          multi_face_strikes: data.multi_face_strikes ?? prev.multi_face_strikes,
          terminated: Boolean(data.terminated),
          negative_marking: data.negative_marking,
          events_log: data.events_log || prev.events_log,
          proctor_messages: data.proctor_messages || prev.proctor_messages,
          integrity_score: data.integrity_score ?? prev.integrity_score,
        }));
      }
    } catch {
      // transient network polling error
    }
  }, [sessionId]);

  useEffect(() => {
    if (!pollingActive) return;
    const interval = setInterval(() => {
      void fetchProctorData();
    }, 1200);
    return () => clearInterval(interval);
  }, [pollingActive, fetchProctorData]);

  // ── Dispatch Proctor Actions ────────────────────────────────────────────────
  const sendProctorAction = async (action: "WARN" | "ADD_STRIKE" | "TERMINATE" | "RESET_STRIKES" | "MESSAGE", text?: string) => {
    setSendingAction(true);
    const msg = text || customMsg || `Proctor action: ${action}`;

    // Broadcast across windows directly
    broadcastChannelRef.current?.postMessage({
      type: "PROCTOR_ACTION",
      action,
      message: msg,
      timestamp: new Date().toLocaleTimeString(),
    });

    try {
      await fetch("/api/backend/interviews/anticheat/proctor/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          action,
          message: msg,
          sender: "Lead Proctor",
        }),
      });
      setCustomMsg("");
      void fetchProctorData();
    } catch {
      // handle error
    } finally {
      setSendingAction(false);
    }
  };

  const frameW = state.latest_boxes.frame_w || 640;
  const frameH = state.latest_boxes.frame_h || 480;
  const strikes = state.multi_face_strikes;
  const isTerminated = state.terminated;

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-2 sm:p-4">
      {/* Top Command Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#EDE6DA] bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="grid size-9 place-items-center rounded-xl border border-[#EDE6DA] bg-white text-[#6F675C] hover:bg-[#FFFCF6]"
              title="Return"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          <span className="grid size-11 place-items-center rounded-2xl bg-[#FFF5E5] text-[#75451F] shadow-sm">
            <Radio size={22} className="animate-pulse" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-[#24211D]">Interviewer Proctoring Command Center</h1>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                state.connected ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"
              }`}>
                <span className={`size-1.5 rounded-full ${state.connected ? "bg-emerald-500 animate-ping" : "bg-amber-500"}`} />
                {state.connected ? (broadcastActive ? "Live Feed (P2P Stream)" : "Live Feed (API Synced)") : "Waiting for Stream"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[#6F675C]">
              Session ID: <code className="font-mono text-[#75451F]">{sessionId}</code> · 3-Strike Disqualification & Negative Marking Active
            </p>
          </div>
        </div>

        {/* Top Indicators */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Integrity Badge */}
          <div className="flex items-center gap-2 rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] px-3.5 py-2">
            <Shield size={16} className={state.integrity_score >= 80 ? "text-[#2E7D32]" : "text-[#C62828]"} />
            <div>
              <p className="text-[10px] uppercase font-bold text-[#6F675C]">Integrity Score</p>
              <p className={`text-xs font-bold ${state.integrity_score >= 80 ? "text-[#2E7D32]" : "text-[#C62828]"}`}>
                {state.integrity_score}%
              </p>
            </div>
          </div>

          {/* Strikes Counter */}
          <div className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 ${
            strikes >= 3
              ? "border-red-300 bg-red-50 text-red-700"
              : strikes === 2
              ? "border-amber-300 bg-amber-50 text-amber-700"
              : strikes === 1
              ? "border-yellow-300 bg-yellow-50 text-yellow-700"
              : "border-[#EDE6DA] bg-[#FFFCF6] text-[#24211D]"
          }`}>
            <ShieldAlert size={16} />
            <div>
              <p className="text-[10px] uppercase font-bold">Multi-Face Strikes</p>
              <p className="text-xs font-bold">
                {strikes >= 3 ? "3/3 (DISQUALIFIED)" : `${strikes} / 3 Strikes`}
              </p>
            </div>
          </div>

          <button
            onClick={() => void fetchProctorData()}
            className="grid size-9 place-items-center rounded-xl border border-[#EDE6DA] bg-white text-[#6F675C] hover:bg-[#FFFCF6]"
            title="Refresh State"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Disqualification Banner if Terminated */}
      {isTerminated && (
        <div className="rounded-2xl border-2 border-red-500 bg-red-950/90 p-5 text-white shadow-2xl backdrop-blur-md">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-red-600 text-white shadow-md">
                <Ban size={24} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white tracking-wide">
                    CANDIDATE DISQUALIFIED · INTERVIEW TERMINATED
                  </h2>
                  <span className="rounded bg-red-500 px-2 py-0.5 text-[10px] font-black uppercase">
                    Negative Marking Applied: -25%
                  </span>
                </div>
                <p className="mt-1 text-xs text-red-200">
                  Malpractice Rule Triggered: Secondary candidate / multiple persons entered frame on 3 distinct occasions.
                </p>
              </div>
            </div>
            <button
              onClick={() => sendProctorAction("RESET_STRIKES", "False alarm overridden by Lead Proctor")}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white/20 px-4 py-2 text-xs font-semibold text-white hover:bg-white/30"
            >
              <RefreshCw size={14} /> Override Disqualification
            </button>
          </div>
        </div>
      )}

      {/* Main Grid: Video Stream + Telemetry & Controls */}
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        {/* Left Column: Live Video Canvas & Biometric Reticle */}
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-2xl border border-[#2a273a] bg-[#0c0a14] shadow-2xl" style={{ aspectRatio: "4/3" }}>
            {/* Live Video Canvas Image */}
            {state.latest_frame_b64 ? (
              <img
                src={state.latest_frame_b64.startsWith("data:") ? state.latest_frame_b64 : `data:image/jpeg;base64,${state.latest_frame_b64}`}
                alt="Candidate Live Feed"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-500">
                <Video size={48} className="animate-pulse text-slate-600" />
                <p className="text-xs">Connecting to candidate live video feed…</p>
                <p className="text-[10px] text-slate-600">Ensure candidate has webcam active in interview tab.</p>
              </div>
            )}

            {/* Cyberpunk HUD Grid & Corner Reticles */}
            <div className="pointer-events-none absolute inset-0">
              {/* Scanlines / Subtle Vignette */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />

              {/* Glowing Corner Reticles */}
              <div className="absolute top-4 left-4 h-6 w-6 border-l-2 border-t-2 border-[#F4B942]" />
              <div className="absolute top-4 right-4 h-6 w-6 border-r-2 border-t-2 border-[#F4B942]" />
              <div className="absolute bottom-4 left-4 h-6 w-6 border-l-2 border-b-2 border-[#F4B942]" />
              <div className="absolute bottom-4 right-4 h-6 w-6 border-r-2 border-b-2 border-[#F4B942]" />

              {/* Live Status HUD Tags in Top Left */}
              <div className="absolute top-4 left-6 flex items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-[10px] font-mono text-emerald-400 backdrop-blur-md">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  PROCTOR LIVE FEED
                </span>
                <span className="rounded-md bg-black/60 px-2 py-1 text-[10px] font-mono text-[#F4B942] backdrop-blur-md">
                  MediaPipe 3D · YOLOv8
                </span>
              </div>

              {/* Threat Status in Top Right */}
              <div className="absolute top-4 right-6">
                <span className={`rounded-md px-2.5 py-1 text-[10px] font-mono font-bold tracking-wide backdrop-blur-md ${
                  strikes >= 3 ? "bg-red-600/90 text-white" : strikes > 0 ? "bg-amber-600/90 text-white" : "bg-emerald-600/80 text-white"
                }`}>
                  STRIKES: {strikes}/3
                </span>
              </div>
            </div>

            {/* Live SVG Overlays (Bounding Boxes + 3D Mesh Wireframe) */}
            {showBoxes && (
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full"
                viewBox={`0 0 ${frameW} ${frameH}`}
                preserveAspectRatio="none"
              >
                {/* 3D Facial Mesh Points & Wireframe */}
                {showMesh && state.latest_boxes.mesh_points && state.latest_boxes.mesh_points.length > 0 && (
                  <g opacity={0.65}>
                    {state.latest_boxes.mesh_points.map(([mx, my], mIdx) => (
                      <circle
                        key={`pt-${mIdx}`}
                        cx={mx}
                        cy={my}
                        r={1.8}
                        fill="#F4B942"
                      />
                    ))}
                  </g>
                )}

                {/* Face Bounding Boxes */}
                {state.latest_boxes.faces?.map((f, idx) => {
                  const isBad = f.status === "flagged" || !f.is_primary;
                  const strokeColor = isBad ? "#ef4444" : "#22c55e";
                  return (
                    <g key={`face-${idx}`}>
                      <rect
                        x={f.x}
                        y={f.y}
                        width={f.w}
                        height={f.h}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={2.5}
                        strokeDasharray={isBad ? "4 2" : "none"}
                        rx={8}
                      />
                      <rect
                        x={f.x}
                        y={Math.max(0, f.y - 22)}
                        width={Math.max(130, f.w)}
                        height={20}
                        fill={strokeColor}
                        opacity={0.9}
                        rx={4}
                      />
                      <text
                        x={f.x + 6}
                        y={Math.max(14, f.y - 8)}
                        fill="#ffffff"
                        fontSize={11}
                        fontWeight="bold"
                        fontFamily="sans-serif"
                      >
                        {f.label} {isBad ? "⚠️ UNCONFIRMED" : "✓ CANDIDATE"}
                      </text>
                    </g>
                  );
                })}

                {/* YOLO Object Bounding Boxes */}
                {state.latest_boxes.objects?.map((obj, idx) => {
                  if (!obj.flagged) return null;
                  const [x1, y1, x2, y2] = obj.bbox;
                  const w = x2 - x1;
                  const h = y2 - y1;
                  return (
                    <g key={`obj-${idx}`}>
                      <rect
                        x={x1}
                        y={y1}
                        width={w}
                        height={h}
                        fill="none"
                        stroke="#E99A32"
                        strokeWidth={2.5}
                        rx={6}
                      />
                      <rect
                        x={x1}
                        y={Math.max(0, y1 - 22)}
                        width={Math.max(130, w)}
                        height={20}
                        fill="#E99A32"
                        opacity={0.92}
                        rx={4}
                      />
                      <text
                        x={x1 + 6}
                        y={Math.max(14, y1 - 8)}
                        fill="#ffffff"
                        fontSize={11}
                        fontWeight="bold"
                        fontFamily="sans-serif"
                      >
                        {obj.class.toUpperCase()} ({Math.round(obj.confidence * 100)}%) ⚠️
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}

            {/* Bottom HUD controls */}
            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between rounded-xl bg-black/60 px-3 py-1.5 text-white backdrop-blur-md text-xs">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowBoxes((b) => !b)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                    showBoxes ? "bg-[#F4B942] text-[#24211D]" : "bg-white/10 text-white/70"
                  }`}
                >
                  <Layers size={13} /> Bounding Boxes
                </button>
                <button
                  onClick={() => setShowMesh((m) => !m)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                    showMesh ? "bg-[#F4B942] text-slate-950 font-bold" : "bg-white/10 text-white/70"
                  }`}
                >
                  <Sparkles size={13} /> 3D Face Wireframe
                </button>
              </div>

              <span className="font-mono text-[10px] text-slate-400">
                Res: {frameW}×{frameH}px · 15 FPS Target
              </span>
            </div>
          </div>

          {/* Biometric Telemetry Sensors */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {/* Sensor 1: Head Pose */}
            <div className="rounded-2xl border border-[#EDE6DA] bg-white p-3 shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F675C]">3D Head Pose</span>
              <div className="mt-1 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[#24211D]">
                    {state.latest_telemetry.head_pose?.direction || "CENTER"}
                  </p>
                  <p className="text-[10px] text-[#6F675C]">
                    Yaw {state.latest_telemetry.head_pose?.yaw ?? 0}° · Pitch {state.latest_telemetry.head_pose?.pitch ?? 0}°
                  </p>
                </div>
                <span className={`size-2.5 rounded-full ${
                  state.latest_telemetry.head_pose?.direction === "CENTER" ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
                }`} />
              </div>
            </div>

            {/* Sensor 2: Eye Gaze */}
            <div className="rounded-2xl border border-[#EDE6DA] bg-white p-3 shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F675C]">Eye Gaze</span>
              <div className="mt-1 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[#24211D]">
                    {state.latest_telemetry.eye_gaze?.direction || "CENTER"}
                  </p>
                  <p className="text-[10px] text-[#6F675C]">
                    Iris Ratio: {Math.round((state.latest_telemetry.eye_gaze?.ratio ?? 0.5) * 100)}%
                  </p>
                </div>
                <span className={`size-2.5 rounded-full ${
                  state.latest_telemetry.eye_gaze?.direction === "CENTER" ? "bg-emerald-500" : "bg-amber-500"
                }`} />
              </div>
            </div>

            {/* Sensor 3: Whisper / Mouth */}
            <div className="rounded-2xl border border-[#EDE6DA] bg-white p-3 shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F675C]">Mouth Activity</span>
              <div className="mt-1 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[#24211D]">
                    {state.latest_telemetry.micro_metrics?.mouth_open ? "Speaking / Moving" : "Resting"}
                  </p>
                  <p className="text-[10px] text-[#6F675C]">
                    Aperture: {state.latest_telemetry.micro_metrics?.mouth_ratio ?? 0}
                  </p>
                </div>
                <span className={`size-2.5 rounded-full ${
                  state.latest_telemetry.micro_metrics?.mouth_open ? "bg-[#E99A32]" : "bg-slate-300"
                }`} />
              </div>
            </div>

            {/* Sensor 4: People & Objects */}
            <div className="rounded-2xl border border-[#EDE6DA] bg-white p-3 shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6F675C]">People & Devices</span>
              <div className="mt-1 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-[#24211D]">
                    {state.latest_telemetry.people_count ?? 1} Person(s)
                  </p>
                  <p className="text-[10px] text-[#6F675C]">
                    {state.latest_boxes.objects?.filter((o) => o.flagged).length ? "Device Flagged 📱" : "No devices"}
                  </p>
                </div>
                <span className={`size-2.5 rounded-full ${
                  (state.latest_telemetry.people_count ?? 1) > 1 || state.latest_boxes.objects?.some((o) => o.flagged)
                    ? "bg-red-500 animate-ping"
                    : "bg-emerald-500"
                }`} />
              </div>
            </div>
          </div>

          {/* Live Transcript Stream */}
          <div className="rounded-2xl border border-[#EDE6DA] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#EDE6DA] pb-2">
              <div className="flex items-center gap-2">
                <Mic size={15} className="text-[#75451F]" />
                <h3 className="text-xs font-semibold text-[#24211D]">Candidate Live Speech Transcript</h3>
              </div>
              <span className="text-[10px] font-mono text-[#6F675C]">Real-time STT feed</span>
            </div>
            <div className="mt-3 min-h-[50px] rounded-xl bg-[#FFFCF6] p-3 text-xs leading-5 text-[#24211D]">
              {state.transcript ? (
                <span>&ldquo;{state.transcript}&rdquo;</span>
              ) : (
                <span className="italic text-[#6F675C]">Candidate has not spoken yet in this question…</span>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Strike Controls & Proctoring Log */}
        <div className="space-y-3">
          {/* Strike Management Panel */}
          <div className="rounded-2xl border border-[#EDE6DA] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#EDE6DA] pb-3">
              <div>
                <h3 className="text-sm font-semibold text-[#24211D]">Strike & Disqualification Center</h3>
                <p className="text-[11px] text-[#6F675C]">Multi-face policy: 3 strikes = auto termination with negative marking</p>
              </div>
              <span className="rounded-lg bg-[#FFF5E5] px-2.5 py-1 text-xs font-bold text-[#75451F]">
                Strike {strikes} / 3
              </span>
            </div>

            {/* Visual Strike Indicators */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[1, 2, 3].map((num) => {
                const active = strikes >= num;
                return (
                  <div
                    key={num}
                    className={`rounded-xl border p-3 text-center transition ${
                      active
                        ? num === 3
                          ? "border-red-500 bg-red-50 text-red-700"
                          : "border-amber-400 bg-amber-50 text-amber-700"
                        : "border-[#EDE6DA] bg-[#FFFCF6] text-[#6F675C]"
                    }`}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider">Strike {num}</p>
                    <p className="mt-1 text-sm font-bold">
                      {active ? (num === 3 ? "DISQUALIFIED" : "TRIGGERED") : "CLEAR"}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Quick Strike Actions */}
            <div className="mt-4 space-y-2">
              <button
                onClick={() => sendProctorAction("ADD_STRIKE", "Manual strike issued by proctor")}
                disabled={sendingAction || isTerminated}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                <AlertTriangle size={15} /> Issue Strike (+1)
              </button>

              <button
                onClick={() => sendProctorAction("TERMINATE", "Immediate disqualification for serious malpractice")}
                disabled={sendingAction || isTerminated}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                <Ban size={15} /> Immediate Disqualify & Apply Negative Marking (-25%)
              </button>

              {strikes > 0 && (
                <button
                  onClick={() => sendProctorAction("RESET_STRIKES", "Strikes cleared by interviewer")}
                  disabled={sendingAction}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#EDE6DA] bg-white px-4 py-2 text-xs font-semibold text-[#6F675C] hover:bg-[#FFFCF6]"
                >
                  <RefreshCw size={13} /> Reset Strikes to 0
                </button>
              )}
            </div>
          </div>

          {/* Send Proctor Warning to Candidate */}
          <div className="rounded-2xl border border-[#EDE6DA] bg-white p-5 shadow-sm">
            <h3 className="text-xs font-semibold text-[#24211D]">Dispatch Live Warning / Message</h3>
            <p className="mt-0.5 text-[10px] text-[#6F675C]">This will pop up immediately on the candidate&apos;s interview HUD.</p>

            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={customMsg}
                onChange={(e) => setCustomMsg(e.target.value)}
                placeholder="e.g. Please face the screen and remove phones..."
                className="flex-1 rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] px-3 py-2 text-xs text-[#24211D] placeholder:text-[#6F675C] focus:border-[#F4B942] focus:outline-none"
              />
              <button
                onClick={() => sendProctorAction("WARN", customMsg)}
                disabled={!customMsg.trim() || sendingAction}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#F4B942] px-3.5 py-2 text-xs font-semibold text-[#24211D] hover:bg-[#E99A32] disabled:opacity-50"
              >
                <Send size={13} /> Send
              </button>
            </div>

            {/* Quick Preset Buttons */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[
                "Please face the camera directly.",
                "Ensure only you are in the frame.",
                "Remove mobile devices from view.",
              ].map((preset) => (
                <button
                  key={preset}
                  onClick={() => sendProctorAction("WARN", preset)}
                  className="rounded-lg border border-[#EDE6DA] bg-[#FFFCF6] px-2.5 py-1 text-[10px] font-medium text-[#6F675C] hover:border-[#F4B942] hover:text-[#75451F]"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Real-time Flagged Events Timeline */}
          <div className="rounded-2xl border border-[#EDE6DA] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#EDE6DA] pb-3">
              <h3 className="text-xs font-semibold text-[#24211D]">Audit & Malpractice Log</h3>
              <span className="text-[10px] font-bold text-[#75451F]">{state.events_log.length} incidents</span>
            </div>

            <div className="mt-3 space-y-2 max-h-[300px] overflow-y-auto">
              {state.events_log.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#6F675C]">
                  <CheckCircle2 size={24} className="mx-auto mb-1.5 text-emerald-500" />
                  No violations or suspicious behavior detected.
                </div>
              ) : (
                state.events_log.map((ev, i) => (
                  <div key={i} className="rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] p-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                        ev.severity === "HIGH" || ev.severity === "CRITICAL"
                          ? "bg-red-100 text-red-700"
                          : ev.severity === "MEDIUM"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-[#FFF5E5] text-[#75451F]"
                      }`}>
                        {ev.severity}
                      </span>
                      <span className="text-[10px] text-[#6F675C]">{ev.rule}</span>
                    </div>
                    <p className="mt-1 text-[11px] font-medium text-[#24211D]">{ev.description}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

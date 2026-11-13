"use client";

import { useId, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Cpu, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/ui/motion";

/** Renders "82%", "12", "4.5 hrs" with a count-up on the leading number. */
function AnimatedValue({ value }: { value: string }) {
  const match = value.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
  if (!match) return <>{value}</>;
  const decimals = match[1].includes(".") ? match[1].split(".")[1].length : 0;
  return <CountUp value={Number(match[1])} suffix={match[2]} decimals={decimals} />;
}

export function Heading({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div className="min-w-0">
        <p className="eyebrow inline-flex items-center gap-2">
          <span className="h-px w-5 bg-gradient-to-r from-[#E99A32] to-transparent" />
          {eyebrow}
        </p>
        <h1 className="font-display mt-1.5 text-2xl font-bold tracking-tight text-[#24211D] sm:text-[30px] sm:leading-tight">
          {title}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[#6F675C]">{detail}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Metric({
  label,
  value,
  caption,
  icon: Icon,
  tint = "primary",
}: {
  label: string;
  value: string;
  caption: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  tint?: "primary" | "orange" | "brown" | "violet" | "lime" | "coral" | "sky";
}) {
  // Use strictly tints of #F4B942 / #E99A32 / #75451F (no random pastel purple/green/blue/pink)
  const tints: Record<string, string> = {
    primary: "border-[#F4B942]/40 bg-[#F4B942]/15 text-[#75451F]",
    orange: "border-[#E99A32]/40 bg-[#E99A32]/15 text-[#75451F]",
    brown: "border-[#EDE6DA] bg-[#FFF5E5] text-[#75451F]",
    // Compatibility aliases mapping to approved warm palette
    violet: "border-[#F4B942]/40 bg-[#F4B942]/15 text-[#75451F]",
    lime: "border-[#E99A32]/40 bg-[#E99A32]/15 text-[#75451F]",
    coral: "border-[#EDE6DA] bg-[#FFF5E5] text-[#75451F]",
    sky: "border-[#F4B942]/40 bg-[#F4B942]/15 text-[#75451F]",
  };

  return (
    <section className="surface surface-hover group overflow-hidden p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6F675C]">{label}</span>
        <span
          className={cn(
            "grid size-9 place-items-center rounded-xl border transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110",
            tints[tint] ?? tints.primary,
          )}
        >
          <Icon size={17} />
        </span>
      </div>
      <p className="font-display mt-3 text-2xl font-bold leading-none tracking-tight text-[#24211D] tabular-nums sm:text-[28px]">
        <AnimatedValue value={value} />
      </p>
      <p className="mt-2 text-xs leading-4 text-[#6F675C]">{caption}</p>
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] origin-left scale-x-0 bg-gradient-to-r from-[#F4B942] to-[#E99A32] transition-transform duration-500 group-hover:scale-x-100" />
    </section>
  );
}

export function AiNotice({ busy, error, note }: { busy?: string | null; error?: string | null; note?: string }) {
  if (error) {
    return (
      <div role="alert" className="mt-3 flex items-start gap-2.5 rounded-xl border border-[#C62828]/25 bg-[#C62828]/8 px-3.5 py-3 text-xs leading-5 text-[#C62828]">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <span><b className="font-semibold">Notice: </b>{error}</span>
      </div>
    );
  }
  if (busy) {
    return (
      <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-[#F4B942]/40 bg-[#FFF5E5] px-3.5 py-2.5 text-xs text-[#75451F]">
        <Loader2 size={15} className="animate-spin text-[#E99A32]" />
        <span>{busy}…</span>
        <span className="ml-auto text-[11px] text-[#6F675C]">processing</span>
      </div>
    );
  }
  if (note) {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-xs text-[#6F675C]">
        <Cpu size={13} className="shrink-0 text-[#75451F]" />
        {note}
      </p>
    );
  }
  return null;
}

export function LivePill({ live, children }: { live: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        live
          ? "border-[#EDE6DA] bg-[#FFF5E5] text-[#75451F]"
          : "border-[#EDE6DA] bg-[#FFFCF6] text-[#6F675C]",
      )}
    >
      <span className={cn("size-1.5 rounded-full", live ? "live-dot bg-[#E99A32]" : "bg-[#6F675C]")} />
      {children}
    </span>
  );
}

export function ScoreRing({
  value,
  label,
  size = 132,
}: {
  value: number | null;
  label: string;
  size?: number;
}) {
  const score = value === null ? 0 : Math.max(0, Math.min(100, Math.round(value)));
  const gradientId = `ring-${useId().replace(/:/g, "")}`;
  const reduce = useReducedMotion();
  const r = 40;
  const circ = 2 * Math.PI * r;
  const strokeOffset = circ * (1 - score / 100);

  return (
    <div
      className="relative mx-auto flex items-center justify-center"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${label}: ${value === null ? "not available" : `${score}%`}`}
    >
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#FFF5E5"
          strokeWidth="9"
        />
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F4B942" />
            <stop offset="100%" stopColor="#E99A32" />
          </linearGradient>
        </defs>
        <motion.circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={reduce ? false : { strokeDashoffset: circ }}
          animate={{ strokeDashoffset: value === null ? circ : strokeOffset }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-2xl font-bold leading-none text-[#24211D]">
          {value === null ? "—" : <CountUp value={score} suffix="%" />}
        </span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-[#6F675C]">
          {label}
        </span>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const tone =
    normalized === "OFFER" || normalized === "SHORTLISTED" || normalized === "COMPLETED" || normalized === "PUBLISHED"
      ? "green"
      : normalized === "REJECTED" || normalized === "CLOSED" || normalized === "WITHDRAWN"
        ? "coral"
        : normalized === "INTERVIEW" || normalized === "REVIEWING"
          ? "amber"
          : "warm";
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize", badgeTone(tone))}>
      {status.replaceAll("_", " ").toLowerCase()}
    </span>
  );
}

function badgeTone(tone: "green" | "coral" | "amber" | "warm"): string {
  if (tone === "green") return "border-[#2E7D32]/25 bg-[#2E7D32]/10 text-[#2E7D32]";
  if (tone === "coral") return "border-[#C62828]/25 bg-[#C62828]/10 text-[#C62828]";
  if (tone === "amber") return "border-[#E99A32]/35 bg-[#E99A32]/15 text-[#75451F]";
  return "border-[#EDE6DA] bg-[#FFF5E5] text-[#75451F]";
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return "";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function progressPercent(done: number, total: number): number {
  if (!total) return 0;
  return Math.round((done / total) * 100);
}

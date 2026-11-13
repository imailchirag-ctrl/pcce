"use client";

import Link from "next/link";
import { ArrowRight, BrainCircuit, TrendingUp, Users } from "lucide-react";

import { TIER_STYLE, type Tier } from "@/features/intelligence/api";
import { cn } from "@/lib/utils";

export function TierChip({
  tier,
  className,
  showDot = true,
}: {
  tier: Tier | "missing" | "adjacent";
  className?: string;
  showDot?: boolean;
}) {
  const style = TIER_STYLE[tier];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        style.chip,
        className,
      )}
    >
      {showDot && <span className="size-1.5 rounded-full" style={{ backgroundColor: style.dot }} />}
      {style.label}
    </span>
  );
}

const LOOP = [
  {
    key: "twin" as const,
    href: "/twin",
    label: "Digital Twin",
    detail: "What you can prove",
    icon: BrainCircuit,
  },
  {
    key: "market" as const,
    href: "/market",
    label: "Market Intelligence",
    detail: "What employers ask for",
    icon: TrendingUp,
  },
  {
    key: "exchange" as const,
    href: "/exchange",
    label: "Skill Exchange",
    detail: "Who can help you close the gap",
    icon: Users,
  },
];

/** Connects the three intelligence pages into one visible learning loop. */
export function LoopStrip({ active }: { active: "twin" | "market" | "exchange" }) {
  return (
    <nav
      aria-label="Intelligence loop"
      className="mb-5 flex flex-col gap-2 rounded-2xl border border-[#EDE6DA] bg-[#FFFCF6]/90 p-2 sm:flex-row sm:items-stretch"
    >
      {LOOP.map((step, index) => {
        const Icon = step.icon;
        const current = step.key === active;
        return (
          <div key={step.key} className="flex flex-1 items-center gap-2">
            <Link
              href={step.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-3 py-2.5 transition",
                current
                  ? "border-[#F4B942]/70 bg-[#F4B942]/15 text-[#75451F]"
                  : "border-transparent text-[#6F675C] hover:border-[#EDE6DA] hover:bg-white hover:text-[#24211D]",
              )}
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-lg border",
                  current
                    ? "border-[#E99A32]/40 bg-[#F4B942] text-[#75451F]"
                    : "border-[#EDE6DA] bg-[#FFF5E5] text-[#75451F]",
                )}
              >
                <Icon size={15} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-bold">{step.label}</span>
                <span className="block truncate text-[10px] text-[#8A7F71]">{step.detail}</span>
              </span>
            </Link>
            {index < LOOP.length - 1 && (
              <ArrowRight size={13} className="hidden shrink-0 text-[#C9B99F] sm:block" aria-hidden="true" />
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function InlineNote({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "warning" | "success" | "error";
}) {
  const tones = {
    info: "border-[#EDE6DA] bg-[#FFFCF6] text-[#6F675C]",
    warning: "border-[#E99A32]/35 bg-[#FFF5E5] text-[#75451F]",
    success: "border-[#2E7D32]/25 bg-[#2E7D32]/8 text-[#2E7D32]",
    error: "border-[#C62828]/25 bg-[#C62828]/8 text-[#C62828]",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-xl border px-3.5 py-3 text-xs leading-5", tones[tone])}>
      {children}
    </div>
  );
}

export function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#8A7F71]">
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-[#EDE6DA] bg-white px-3 py-2 text-xs text-[#24211D] outline-none transition placeholder:text-[#A89D8F] focus:border-[#E99A32] focus:ring-2 focus:ring-[#F4B942]/25";

export const selectClass = `${inputClass} appearance-none pr-7`;

export function splitList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,;\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("surface", className)}>{children}</section>;
}

export function CardTitle({
  children,
  detail,
  action,
}: {
  children: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="font-display text-[18px] sm:text-[19px] font-semibold tracking-tight text-[#24211D]">{children}</h2>
        {detail && <p className="mt-0.5 text-xs leading-5 text-[#6F675C]">{detail}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  const bounded = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("h-2 overflow-hidden rounded-full bg-[#FFF5E5]", className)}
      role="progressbar"
      aria-valuenow={bounded}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-[#F4B942] to-[#E99A32] transition-all duration-700 ease-out"
        style={{ width: `${bounded}%` }}
      />
    </div>
  );
}

export function Badge({
  children,
  tone = "warm",
}: {
  children: ReactNode;
  tone?: "warm" | "primary" | "amber" | "green" | "coral" | "gray" | "purple" | "lime";
}) {
  const tones: Record<string, string> = {
    warm: "border border-[#EDE6DA] bg-[#FFF5E5] text-[#75451F]",
    primary: "border border-[#F4B942]/50 bg-[#F4B942]/20 text-[#75451F]",
    amber: "border border-[#E99A32]/40 bg-[#E99A32]/15 text-[#75451F]",
    green: "border border-[#2E7D32]/25 bg-[#2E7D32]/10 text-[#2E7D32]",
    coral: "border border-[#C62828]/25 bg-[#C62828]/10 text-[#C62828]",
    gray: "border border-[#EDE6DA] bg-[#FFFCF6] text-[#6F675C]",
    // Compatibility aliases for previous code
    purple: "border border-[#F4B942]/50 bg-[#F4B942]/20 text-[#75451F]",
    lime: "border border-[#2E7D32]/25 bg-[#2E7D32]/10 text-[#2E7D32]",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold", tones[tone] ?? tones.warm)}>
      {children}
    </span>
  );
}

export function SkillPill({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "missing" | "partial" | "matched";
}) {
  const tones = {
    default: "border border-[#EDE6DA] bg-[#FFF5E5] text-[#75451F]",
    matched: "border border-[#F4B942] bg-[#F4B942]/25 text-[#75451F] font-semibold",
    partial: "border border-[#E99A32]/40 bg-[#E99A32]/15 text-[#75451F]",
    missing: "border border-[#EDE6DA] bg-white text-[#6F675C]",
  };
  return (
    <span className={cn("inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  detail,
  action,
  icon: Icon,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
  icon?: React.ComponentType<{ size?: number | string; className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-dashed border-[#EDE6DA] bg-[#FFFCF6]/80 px-5 py-8 text-center">
      {Icon && (
        <span className="mx-auto mb-3 grid size-10 place-items-center rounded-xl bg-[#FFF5E5] text-[#75451F]">
          <Icon size={20} />
        </span>
      )}
      <p className="text-sm font-semibold text-[#24211D]">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#6F675C]">{detail}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden="true" />;
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      className="fixed bottom-5 left-1/2 z-[80] flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-xl border border-[#EDE6DA] bg-white px-4 py-3 text-sm font-medium text-[#24211D] shadow-[0_12px_36px_-10px_rgba(117,69,31,0.2)]"
      role="status"
    >
      <span className="size-2 shrink-0 rounded-full bg-[#F4B942]" />
      <span>{message}</span>
      <button onClick={onClose} aria-label="Dismiss notification" className="ml-2 text-[#6F675C] hover:text-[#24211D]">
        ×
      </button>
    </div>
  );
}

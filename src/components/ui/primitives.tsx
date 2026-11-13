import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("surface", className)}>{children}</section>;
}
export function CardTitle({ children, detail, action }: { children: ReactNode; detail?: ReactNode; action?: ReactNode }) {
  return <div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="font-semibold tracking-tight text-[#29233e]">{children}</h2>{detail && <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>}</div>{action}</div>;
}
export function Progress({ value, className }: { value: number; className?: string }) {
  const bounded = Math.max(0, Math.min(100, value));
  return <div className={cn("h-2 overflow-hidden rounded-full bg-[#eeeaf6]", className)} role="progressbar" aria-valuenow={bounded} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-gradient-to-r from-[#8067ed] to-[#a18df5] transition-all duration-500" style={{ width: `${bounded}%` }} /></div>;
}
export function Badge({ children, tone = "purple" }: { children: ReactNode; tone?: "purple" | "green" | "gray" | "amber" }) {
  const tones = { purple: "bg-[#f0edff] text-[#6c55cf]", green: "bg-[#e8f8ef] text-[#268054]", gray: "bg-[#f1eff5] text-[#756e84]", amber: "bg-[#fff5e6] text-[#a66b1e]" };
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold", tones[tone])}>{children}</span>;
}
export function SkillPill({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "missing" | "partial" }) {
  const tones = { default: "border-[#e8e4f3] bg-white text-[#655d78]", missing: "border-[#ffe2dd] bg-[#fff5f2] text-[#c15c50]", partial: "border-[#ffe8c2] bg-[#fffaf0] text-[#a67426]" };
  return <span className={cn("inline-flex items-center rounded-lg border px-2.5 py-1.5 text-xs font-medium", tones[tone])}>{children}</span>;
}
export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-[#ded9e9] bg-[#fcfbfe] px-5 py-9 text-center"><p className="text-sm font-semibold">{title}</p><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{detail}</p>{action && <div className="mt-4">{action}</div>}</div>;
}
export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return <div className="fixed bottom-5 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-[#28213d] px-4 py-3 text-sm text-white shadow-xl" role="status"><span className="size-2 rounded-full bg-[#ab9dff]" />{message}<button onClick={onClose} aria-label="Dismiss notification" className="ml-2 text-white/60 hover:text-white">×</button></div>;
}

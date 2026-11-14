"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, Bell, Bookmark, BriefcaseBusiness, ChevronDown, FileText, GraduationCap, LayoutDashboard, Menu, MessageSquareText, Search, Settings2, Sparkles, Trophy, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ai } from "@/lib/ai/client";
import { Toast } from "@/components/ui/primitives";

const candidateLinks = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/resume", label: "Resume intelligence", icon: FileText },
  { href: "/career", label: "Career match", icon: Sparkles },
  { href: "/learn", label: "Learning hub", icon: GraduationCap },
  { href: "/interviews", label: "Mock interviews", icon: MessageSquareText },
  { href: "/jobs", label: "Explore jobs", icon: BriefcaseBusiness },
  { href: "/games", label: "Battle Arena", icon: Trophy },
  { href: "/applications", label: "Applications", icon: Bookmark },
];
const recruiterLinks = [
  { href: "/recruiter", label: "Overview", icon: LayoutDashboard },
  { href: "/recruiter/jobs", label: "Manage jobs", icon: BriefcaseBusiness },
  { href: "/recruiter/candidates", label: "Candidates", icon: Users },
  { href: "/recruiter/pipeline", label: "Pipeline", icon: Activity },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const recruiter = pathname.startsWith("/recruiter");
  const [open, setOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [aiStatus, setAiStatus] = useState<{ online: boolean; qwen: boolean; embedding: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const status = await ai.modelStatus();
        if (alive) {
          setAiStatus({
            online: true,
            qwen: status.ollama.reachable && status.ollama.available,
            embedding: status.models.some((model) => model.id.includes("minilm") && model.loaded),
          });
        }
      } catch {
        if (alive) setAiStatus({ online: false, qwen: false, embedding: false });
      }
    };
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    let timeout = 0;
    const show = (event: Event) => {
      setToastMessage((event as CustomEvent<string>).detail);
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => setToastMessage(""), 3000);
    };
    window.addEventListener("skillbridge-toast", show);
    return () => { window.removeEventListener("skillbridge-toast", show); window.clearTimeout(timeout); };
  }, []);
  const navItems = recruiter ? recruiterLinks : candidateLinks;
  const sidebar = <>
    <div className="flex h-[72px] items-center justify-between px-5">
      <Link href="/" className="flex items-center gap-2.5 font-bold tracking-tight"><span className="grid size-9 place-items-center rounded-xl bg-[#7559e8] text-white shadow-lg shadow-purple-200"><Sparkles size={18} /></span><span>SkillBridge <span className="text-[#8069dd]">AI</span></span></Link>
      <button aria-label="Close navigation" className="md:hidden" onClick={() => setOpen(false)}><X size={20} /></button>
    </div>
    <div className="mx-4 mb-5 rounded-xl bg-[#f6f4fb] p-3"><p className="eyebrow">Workspace</p><div className="mt-2 flex items-center justify-between text-sm font-semibold">{recruiter ? "Recruiter space" : "My career plan"}<ChevronDown size={15} className="text-muted-foreground" /></div></div>
    <nav className="space-y-1 px-3" aria-label="Main navigation">{navItems.map(({ href, label, icon: Icon }) => {
      const active = pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
      return <Link key={href} href={href} onClick={() => setOpen(false)} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium", active ? "bg-[#f0edff] text-[#674dd1]" : "text-[#777187] hover:bg-[#f8f7fb] hover:text-[#302944]")}><Icon size={17} strokeWidth={1.9} />{label}{href === "/applications" && <span className="ml-auto rounded-md bg-white px-1.5 py-0.5 text-[10px] text-[#817a91]">2</span>}</Link>;
    })}</nav>
    <div className="mt-auto p-4"><div className="rounded-2xl bg-gradient-to-br from-[#f3efff] to-[#faf8ff] p-4"><span className="grid size-8 place-items-center rounded-lg bg-white text-[#7459df] shadow-sm"><Sparkles size={16} /></span><p className="mt-3 text-sm font-semibold">Your next step, made clear</p><p className="mt-1 text-xs leading-5 text-[#827b95]">Keep your skills moving forward with a focused weekly plan.</p><Link href={recruiter ? "/recruiter/candidates" : "/career"} className="mt-3 inline-flex text-xs font-semibold text-[#6f54db]">{recruiter ? "Explore talent" : "View career match"} <span className="ml-1">→</span></Link></div><Link href="/" className="mt-4 flex items-center gap-2 px-2 text-xs text-muted-foreground hover:text-foreground"><Settings2 size={15} /> Back to SkillBridge home</Link></div>
  </>;

  return <div className="min-h-screen">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[252px] flex-col border-r border-[#eeebf4] bg-white md:flex">{sidebar}</aside>
    {open && <div className="fixed inset-0 z-50 bg-[#211b35]/25 md:hidden" onClick={() => setOpen(false)}><aside className="flex h-full w-[286px] flex-col bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>{sidebar}</aside></div>}
    <div className="md:pl-[252px]">
      <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-[#eeebf4] bg-white/90 px-4 backdrop-blur-xl sm:px-7">
        <div className="flex items-center gap-3"><button className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground md:hidden" aria-label="Open navigation" onClick={() => setOpen(true)}><Menu size={18} /></button><div className="hidden items-center gap-2 rounded-xl border border-[#efedf4] bg-[#faf9fc] px-3 py-2 text-xs text-muted-foreground sm:flex"><Search size={15} /><input aria-label="Search workspace" placeholder="Search anything..." className="w-44 bg-transparent outline-none placeholder:text-[#a49eaf]" onKeyDown={(e) => { if (e.key === "Enter" && e.currentTarget.value.trim()) window.location.href = recruiter ? "/recruiter/candidates" : "/jobs"; }} /></div><span className="text-xs text-muted-foreground sm:hidden">{recruiter ? "Recruiter workspace" : "Career workspace"}</span></div>
        <div className="flex items-center gap-3"><span title={aiStatus?.online ? `FastAPI online${aiStatus.embedding ? " · MiniLM loaded" : ""}${aiStatus.qwen ? " · Qwen reachable" : ""}` : "FastAPI is not running on port 8000"} className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold md:inline-flex ${aiStatus?.online ? "border-[#dcefe3] bg-[#f4fbf7] text-[#3f8b60]" : aiStatus ? "border-[#f2e6d7] bg-[#fffaf4] text-[#a9783f]" : "border-[#eeeaf4] bg-[#faf9fc] text-[#938ca2]"}`}><span className={`size-1.5 rounded-full ${aiStatus?.online ? "animate-pulse bg-[#4aab72]" : aiStatus ? "bg-[#d1a05c]" : "bg-[#b8b1c5]"}`} />{aiStatus === null ? "Checking local AI…" : aiStatus.online ? aiStatus.qwen ? "Qwen · local" : "AI · local" : "AI offline"}</span><span className="hidden text-xs text-[#8b8598] lg:inline">Local workspace</span><button aria-label="Notifications" onClick={() => window.dispatchEvent(new CustomEvent("skillbridge-toast", { detail: "You’re all caught up" }))} className="relative grid size-9 place-items-center rounded-xl border border-[#eeebf4] text-[#777187] hover:bg-[#faf9fc]"><span className="absolute right-2 top-2 size-1.5 rounded-full bg-[#805fe8]" /><Bell size={16} /></button><Link href="/auth/setup" className="flex items-center gap-2 rounded-xl p-1.5 pr-2.5 hover:bg-[#f8f7fb]"><span className="grid size-8 place-items-center rounded-full bg-[#ece7ff] text-xs font-bold text-[#6e56d2]">{recruiter ? "HR" : "AM"}</span><span className="hidden text-xs font-semibold sm:block">{recruiter ? "Recruiter" : "Alex Morgan"}</span></Link></div>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-7 sm:py-8 lg:px-9">{children}</main>
    </div>
    {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage("")} />}
  </div>;
}
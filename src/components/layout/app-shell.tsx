"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Bell,
  Bookmark,
  BriefcaseBusiness,
  CheckCheck,
  ChevronDown,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  RotateCw,
  Search,
  Settings2,
  Sparkles,
  UserRound,
  Users,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-provider";
import { Badge, Toast } from "@/components/ui/primitives";

const candidateLinks = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/resume", label: "Resume intelligence", icon: FileText },
  { href: "/career", label: "Career match", icon: Sparkles },
  { href: "/learn", label: "Learning hub", icon: GraduationCap },
  { href: "/interviews", label: "Mock interviews", icon: MessageSquareText },
  { href: "/jobs", label: "Explore jobs", icon: BriefcaseBusiness },
  { href: "/applications", label: "Applications", icon: Bookmark },
];

const recruiterLinks = [
  { href: "/recruiter", label: "Overview", icon: LayoutDashboard },
  { href: "/recruiter/jobs", label: "Manage jobs", icon: BriefcaseBusiness },
  { href: "/recruiter/candidates", label: "Candidates", icon: Users },
  { href: "/recruiter/pipeline", label: "Pipeline", icon: Activity },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function relativeTime(value: string): string {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "just now";
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    user,
    isRecruiter,
    notifications,
    unread,
    live,
    loading,
    refresh,
    logout,
    markAllRead,
    modelStatus,
    lastSync,
  } = useWorkspace();

  const [open, setOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const bellRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const navItems = isRecruiter ? recruiterLinks : candidateLinks;

  useEffect(() => {
    const show = (event: Event) => {
      setToastMessage((event as CustomEvent<string>).detail);
      window.setTimeout(() => setToastMessage(""), 3200);
    };
    window.addEventListener("skillbridge-toast", show);
    return () => window.removeEventListener("skillbridge-toast", show);
  }, []);

  useEffect(() => {
    setOpen(false);
    setBellOpen(false);
    setUserOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (bellRef.current && !bellRef.current.contains(target)) setBellOpen(false);
      if (userRef.current && !userRef.current.contains(target)) setUserOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const aiOnline = Boolean(modelStatus);

  const submitSearch = () => {
    const term = query.trim();
    if (!term) return;
    if (isRecruiter) router.push(`/recruiter/candidates?q=${encodeURIComponent(term)}`);
    else router.push(`/jobs?q=${encodeURIComponent(term)}`);
  };

  const sidebarContent = (
    <>
      {/* Brand logo in cream theme */}
      <div className="flex h-[72px] items-center justify-between border-b border-[#EDE6DA] px-5 bg-[#FFFCF6]">
        <Link
          href={isRecruiter ? "/recruiter" : "/dashboard"}
          className="flex items-center gap-2.5 font-display text-[16px] font-bold tracking-tight text-[#24211D]"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-[#F4B942] text-[#75451F] shadow-[0_4px_12px_-4px_rgba(233,154,50,0.6)]">
            <Sparkles size={18} />
          </span>
          <span>SkillBridge <span className="text-[#E99A32]">AI</span></span>
        </Link>
        <button
          aria-label="Close navigation"
          className="text-[#6F675C] hover:text-[#24211D] md:hidden"
          onClick={() => setOpen(false)}
        >
          <X size={20} />
        </button>
      </div>

      {/* Workspace status card */}
      <div className="mx-3 my-4 rounded-xl border border-[#EDE6DA] bg-white p-3.5 shadow-sm">
        <p className="eyebrow text-[11px]">Workspace</p>
        <div className="mt-1.5 flex items-center justify-between text-xs font-semibold text-[#24211D]">
          <span>{isRecruiter ? "Hiring desk" : "Career plan"}</span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium",
              live ? "bg-[#FFF5E5] text-[#75451F]" : "bg-[#FFFCF6] text-[#6F675C]",
            )}
          >
            <span className={cn("size-1.5 rounded-full", live ? "live-dot bg-[#E99A32]" : "bg-[#6F675C]")} />
            {live ? "realtime" : "synced"}
          </span>
        </div>
      </div>

      {/* Navigation items */}
      <nav className="space-y-1 px-3 flex-1 overflow-y-auto" aria-label="Main navigation">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition-colors",
                active
                  ? "border border-[#F4B942]/60 bg-[#F4B942]/20 font-semibold text-[#75451F] shadow-sm"
                  : "border border-transparent text-[#6F675C] hover:bg-[#FFF5E5] hover:text-[#24211D]",
              )}
            >
              <Icon
                size={17}
                strokeWidth={active ? 2.2 : 1.9}
                className={active ? "text-[#75451F]" : "text-[#6F675C] group-hover:text-[#75451F]"}
              />
              <span className="flex-1">{label}</span>
              {href === "/applications" && unread > 0 && (
                <span className="ml-auto rounded-full bg-[#F4B942] px-1.5 py-0.2 text-[10px] font-bold text-[#75451F]">
                  {unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom sidebar card & user snippet */}
      <div className="mt-auto space-y-2.5 p-3 border-t border-[#EDE6DA] bg-[#FFFCF6]">
        <div className="rounded-xl border border-[#EDE6DA] bg-[#FFF5E5] p-3.5">
          <div className="flex items-center gap-2 text-xs font-bold text-[#75451F]">
            <span className="grid size-6 place-items-center rounded-lg bg-[#F4B942] text-[#75451F]">
              <Sparkles size={13} />
            </span>
            <span>{isRecruiter ? "Recruitment pipeline" : "Your next step"}</span>
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-[#6F675C]">
            {isRecruiter
              ? "Every application and candidate status updates live in real time."
              : "Resume scores, skill gaps, and roadmaps refresh as you work."}
          </p>
          <Link
            href={isRecruiter ? "/recruiter/pipeline" : "/career"}
            className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-bold text-[#75451F] hover:text-[#E99A32]"
          >
            {isRecruiter ? "Open pipeline" : "View career match"} <ArrowRight size={12} />
          </Link>
        </div>

        <Link
          href="/profile"
          className="flex items-center gap-2.5 rounded-xl border border-[#EDE6DA] bg-white p-2.5 hover:bg-[#FFF5E5] transition-colors"
        >
          <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-[#FFF5E5] border border-[#EDE6DA] text-xs font-bold text-[#75451F]">
            {user?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar_url} alt="" className="size-full object-cover" />
            ) : (
              initials(user?.name || "SB")
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-[#24211D]">{user?.name || "Your profile"}</span>
            <span className="block truncate text-[10px] text-[#6F675C]">{user?.email || "Signed in"}</span>
          </span>
          <Settings2 size={14} className="text-[#6F675C]" />
        </Link>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#FFFCF6] text-[#24211D]">
      {/* Top progress bar when loading */}
      {loading && (
        <div className="fixed inset-x-0 top-0 z-[70] h-1 overflow-hidden bg-[#FFF5E5]">
          <div className="h-full w-1/3 animate-pulse bg-gradient-to-r from-[#F4B942] to-[#E99A32]" />
        </div>
      )}

      {/* Desktop Sidebar (Cream / Warm System) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[256px] flex-col border-r border-[#EDE6DA] bg-[#FFFCF6] md:flex">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer (Under 768px) */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-[#24211D]/40 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
        >
          <aside
            className="flex h-full w-[280px] max-w-[85vw] flex-col border-r border-[#EDE6DA] bg-[#FFFCF6] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="md:pl-[256px] pb-16 md:pb-0">
        {/* Top bar (White / Cream with border) */}
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between gap-3 border-b border-[#EDE6DA] bg-white/95 px-4 backdrop-blur-md sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="grid size-9 place-items-center rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] text-[#6F675C] hover:text-[#24211D] md:hidden"
              aria-label="Open navigation"
              onClick={() => setOpen(true)}
            >
              <Menu size={18} />
            </button>

            {/* Search input */}
            <div className="hidden items-center gap-2 rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] px-3 py-1.5 text-xs sm:flex">
              <Search size={14} className="text-[#6F675C]" />
              <input
                aria-label="Search workspace"
                placeholder={isRecruiter ? "Search candidates…" : "Search roles, skills…"}
                className="w-44 bg-transparent outline-none placeholder:text-[#9E9589] lg:w-56 text-[#24211D]"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitSearch();
                }}
              />
              <kbd className="rounded border border-[#EDE6DA] bg-white px-1.5 py-0.5 text-[9px] text-[#6F675C]">↵</kbd>
            </div>

            <span className="truncate text-xs font-medium text-[#6F675C] sm:hidden">
              {isRecruiter ? "Recruiter" : "Career"} workspace
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Refresh button with real loading spinner */}
            <button
              onClick={() => void refresh()}
              disabled={loading}
              title="Refresh workspace data"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] px-2.5 py-1.5 text-xs font-semibold text-[#75451F] hover:bg-[#FFF5E5] disabled:opacity-60 transition-colors"
            >
              <RotateCw size={13} className={cn("text-[#75451F]", loading && "animate-spin")} />
              <span className="hidden sm:inline">{loading ? "Refreshing…" : "Refresh"}</span>
            </button>

            {/* AI Status Badge */}
            <span
              className={cn(
                "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold md:inline-flex",
                aiOnline
                  ? "border-[#EDE6DA] bg-[#FFF5E5] text-[#75451F]"
                  : "border-[#EDE6DA] bg-[#FFFCF6] text-[#6F675C]",
              )}
              title={aiOnline ? "Local AI model connected" : "AI model standby"}
            >
              <span className={cn("size-1.5 rounded-full", aiOnline ? "bg-[#E99A32]" : "bg-[#6F675C]")} />
              {aiOnline ? "AI Active" : "AI Standby"}
            </span>

            {/* Live Synced Badge */}
            <span className="hidden items-center gap-1.5 rounded-full border border-[#EDE6DA] bg-[#FFFCF6] px-2.5 py-1 text-[11px] text-[#6F675C] lg:inline-flex">
              <span className={cn("size-1.5 rounded-full", live ? "live-dot bg-[#E99A32]" : "bg-[#6F675C]")} />
              {live ? "Live synced" : lastSync ? `Synced ${relativeTime(new Date(lastSync).toISOString())}` : "Standby"}
            </span>

            {/* Notifications Popover */}
            <div className="relative" ref={bellRef}>
              <button
                aria-label="Notifications"
                aria-expanded={bellOpen}
                onClick={() => {
                  setBellOpen((value) => !value);
                  setUserOpen(false);
                }}
                className="relative grid size-9 place-items-center rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] text-[#6F675C] hover:bg-[#FFF5E5] hover:text-[#24211D] transition-colors"
              >
                <Bell size={16} />
                {unread > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-[#E99A32]" />}
              </button>
              {bellOpen && (
                <div className="absolute right-0 top-12 z-50 w-[340px] max-w-[90vw] overflow-hidden rounded-2xl border border-[#EDE6DA] bg-white shadow-2xl">
                  <div className="flex items-center justify-between border-b border-[#EDE6DA] bg-[#FFFCF6] px-4 py-3">
                    <div>
                      <p className="text-xs font-bold text-[#24211D]">Notifications</p>
                      <p className="mt-0.5 text-[10px] text-[#6F675C]">
                        {unread ? `${unread} unread` : "All caught up"}
                      </p>
                    </div>
                    <button
                      onClick={() => void markAllRead()}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#75451F] hover:text-[#E99A32]"
                    >
                      <CheckCheck size={13} /> Mark read
                    </button>
                  </div>
                  <div className="max-h-[360px] overflow-y-auto">
                    {notifications.length === 0 && (
                      <p className="px-4 py-8 text-center text-xs text-[#6F675C]">Your activity will appear here.</p>
                    )}
                    {notifications.slice(0, 8).map((item) => (
                      <div
                        key={item.id}
                        className={cn(
                          "border-b border-[#EDE6DA]/60 px-4 py-3",
                          !item.read && "bg-[#FFF5E5]/50",
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={cn(
                              "mt-1.5 size-1.5 shrink-0 rounded-full",
                              item.read ? "bg-[#EDE6DA]" : "bg-[#E99A32]",
                            )}
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#24211D]">{item.title}</p>
                            {item.detail && <p className="mt-0.5 text-[11px] leading-4 text-[#6F675C]">{item.detail}</p>}
                            <p className="mt-1 text-[10px] font-medium text-[#75451F]">{relativeTime(item.created_at)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* User Account Dropdown */}
            <div className="relative" ref={userRef}>
              <button
                onClick={() => {
                  setUserOpen((value) => !value);
                  setBellOpen(false);
                }}
                aria-expanded={userOpen}
                className="flex items-center gap-2 rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] p-1.5 pr-2.5 hover:bg-[#FFF5E5] transition-colors"
              >
                <span className="grid size-7 place-items-center overflow-hidden rounded-full bg-[#FFF5E5] border border-[#EDE6DA] text-[10px] font-bold text-[#75451F]">
                  {user?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar_url} alt="" className="size-full object-cover" />
                  ) : (
                    initials(user?.name || "SB")
                  )}
                </span>
                <span className="hidden max-w-[120px] truncate text-xs font-semibold text-[#24211D] sm:block">
                  {user?.name || "Account"}
                </span>
                <ChevronDown size={13} className="hidden text-[#6F675C] sm:block" />
              </button>
              {userOpen && (
                <div className="absolute right-0 top-12 z-50 w-52 overflow-hidden rounded-xl border border-[#EDE6DA] bg-white p-1.5 shadow-xl">
                  <div className="px-2.5 py-2 border-b border-[#EDE6DA]">
                    <p className="truncate text-xs font-bold text-[#24211D]">{user?.name || "User"}</p>
                    <p className="truncate text-[10px] text-[#6F675C]">{user?.email}</p>
                    <div className="mt-1.5">
                      <Badge tone={isRecruiter ? "primary" : "warm"}>
                        {isRecruiter ? "Recruiter" : "Candidate"}
                      </Badge>
                    </div>
                  </div>
                  <div className="py-1">
                    <Link
                      href="/profile"
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-[#24211D] hover:bg-[#FFF5E5]"
                    >
                      <UserRound size={14} className="text-[#75451F]" /> Edit profile
                    </Link>
                    <Link
                      href="/settings"
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-[#24211D] hover:bg-[#FFF5E5]"
                    >
                      <Settings2 size={14} className="text-[#75451F]" /> Settings
                    </Link>
                    <button
                      onClick={() => void logout()}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-[#C62828] hover:bg-[#C62828]/10"
                    >
                      <LogOut size={14} /> Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Page Workspace Content */}
        <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-7 sm:py-8 lg:px-9">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (Under 768px) */}
      <nav
        className="fixed bottom-0 inset-x-0 z-40 flex h-14 items-center justify-around border-t border-[#EDE6DA] bg-white/95 px-2 backdrop-blur-md md:hidden"
        aria-label="Mobile Navigation"
      >
        {(isRecruiter ? recruiterLinks : candidateLinks.slice(0, 5)).map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-medium transition-colors",
                active ? "text-[#75451F] font-bold" : "text-[#6F675C] hover:text-[#24211D]",
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 1.8} className={active ? "text-[#75451F]" : "text-[#6F675C]"} />
              <span className="truncate max-w-[56px]">{label.split(" ")[0]}</span>
            </Link>
          );
        })}
        <Link
          href="/profile"
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-medium transition-colors",
            pathname === "/profile" ? "text-[#75451F] font-bold" : "text-[#6F675C] hover:text-[#24211D]",
          )}
        >
          <UserRound size={18} strokeWidth={pathname === "/profile" ? 2.4 : 1.8} className={pathname === "/profile" ? "text-[#75451F]" : "text-[#6F675C]"} />
          <span>Profile</span>
        </Link>
      </nav>

      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage("")} />}
    </div>
  );
}

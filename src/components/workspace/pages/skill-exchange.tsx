"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Ban,
  CalendarClock,
  Check,
  Circle,
  Clock3,
  Eye,
  EyeOff,
  Flag,
  FolderKanban,
  Handshake,
  Inbox,
  ListTodo,
  Loader2,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Unlock,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Badge, Card, CardTitle, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Heading, formatDate, relativeTime } from "@/components/workspace/shared";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  errorMessage,
  intelligenceApi,
  type ExchangeProfile,
  type ExchangeRequest,
  type Match,
  type ProjectDetail,
  type ProjectSummary,
  type PublicMember,
  type Tier,
} from "@/features/intelligence/api";
import { FieldLabel, InlineNote, LoopStrip, TierChip, inputClass, selectClass, splitList } from "@/features/intelligence/components";

type Tab = "matches" | "projects" | "workspace" | "requests" | "profile";

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ size?: number | string; className?: string }> }[] = [
  { key: "matches", label: "Matches", icon: Handshake },
  { key: "projects", label: "Projects", icon: FolderKanban },
  { key: "workspace", label: "Workspace", icon: ListTodo },
  { key: "requests", label: "Requests", icon: Inbox },
  { key: "profile", label: "Profile & privacy", icon: ShieldCheck },
];

const LEVEL_LABEL: Record<string, string> = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };

const STATUS_STYLE: Record<string, string> = {
  PENDING: "border-[#E99A32]/35 bg-[#FFF5E5] text-[#75451F]",
  ACCEPTED: "border-[#2E7D32]/25 bg-[#2E7D32]/10 text-[#2E7D32]",
  REJECTED: "border-[#C62828]/25 bg-[#C62828]/10 text-[#C62828]",
  WITHDRAWN: "border-[#EDE6DA] bg-[#FFFCF6] text-[#8A7F71]",
  OPEN: "border-[#2E7D32]/25 bg-[#2E7D32]/10 text-[#2E7D32]",
  CLOSED: "border-[#EDE6DA] bg-[#FFFCF6] text-[#8A7F71]",
  HIDDEN: "border-[#C62828]/25 bg-[#C62828]/10 text-[#C62828]",
};

type ProfileForm = {
  display_name: string;
  headline: string;
  teach: string;
  learn: string;
  tech: string;
  interests: string;
  roles: string;
  availability: string;
  level: ExchangeProfile["level"];
  visibility: ExchangeProfile["visibility"];
  show_evidence: boolean;
};

function formFromProfile(profile: ExchangeProfile): ProfileForm {
  return {
    display_name: profile.display_name,
    headline: profile.headline ?? "",
    teach: profile.teach.join(", "),
    learn: profile.learn.join(", "),
    tech: profile.tech.join(", "),
    interests: profile.interests.join(", "),
    roles: profile.roles.join(", "),
    availability: profile.availability ?? "",
    level: profile.level,
    visibility: profile.visibility,
    show_evidence: profile.show_evidence,
  };
}

function actionError(error: unknown, fallback: string): string {
  const message = errorMessage(error, fallback);
  return error instanceof ApiError && error.status === 422 ? `Moderation check: ${message}` : message;
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide", STATUS_STYLE[status] ?? STATUS_STYLE.PENDING)}>
      {status.replaceAll("_", " ").toLowerCase()}
    </span>
  );
}

export function SkillExchangePage() {
  const [tab, setTab] = useState<Tab>("matches");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const [profile, setProfile] = useState<ExchangeProfile | null>(null);
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [suggestions, setSuggestions] = useState<{ teach: string[]; teach_tiers: Record<string, Tier>; learn: string[]; target_role: string | null } | null>(null);

  const [matches, setMatches] = useState<Match[]>([]);
  const [matchMethod, setMatchMethod] = useState<string | null>(null);
  const [matchNote, setMatchNote] = useState("");
  const [learningGoals, setLearningGoals] = useState<string[]>([]);
  const [gapSkills, setGapSkills] = useState<string[]>([]);
  const [connectFor, setConnectFor] = useState<string | null>(null);
  const [connectMessage, setConnectMessage] = useState("");
  const [matchActionError, setMatchActionError] = useState("");

  const [projects, setProjects] = useState<{ mine: ProjectSummary[]; discover: ProjectSummary[] }>({ mine: [], discover: [] });
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    skills: "",
    roles: [{ role: "", skills: "" }],
  });

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [projectBusy, setProjectBusy] = useState(false);
  const [projectError, setProjectError] = useState("");
  const [projectNote, setProjectNote] = useState("");
  const [candidates, setCandidates] = useState<{ member: PublicMember; covers: string[]; suggested_role: string | null; score: number }[]>([]);
  const [responsibilities, setResponsibilities] = useState<Record<string, string>>({});
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDue, setMilestoneDue] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskSkills, setTaskSkills] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskMilestone, setTaskMilestone] = useState("");
  const [joinRole, setJoinRole] = useState("");
  const [joinMessage, setJoinMessage] = useState("");

  const [requests, setRequests] = useState<{ incoming: ExchangeRequest[]; outgoing: ExchangeRequest[] }>({ incoming: [], outgoing: [] });
  const [requestsBusy, setRequestsBusy] = useState<string | null>(null);

  const [blocks, setBlocks] = useState<{ member_id: string; display_name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [profileResponse, matchResponse, projectResponse, requestResponse, blockResponse] = await Promise.all([
          intelligenceApi.exchangeProfile(),
          intelligenceApi.matches(),
          intelligenceApi.projects(),
          intelligenceApi.requests(),
          intelligenceApi.blocks(),
        ]);
        if (cancelled) return;
        setProfile(profileResponse.profile);
        setForm(formFromProfile(profileResponse.profile));
        setSuggestions(profileResponse.suggestions);
        setMatches(matchResponse.matches);
        setMatchMethod(matchResponse.method);
        setMatchNote(matchResponse.note ?? "");
        setLearningGoals(matchResponse.your_learning_goals ?? []);
        setGapSkills(matchResponse.gap_skills_from_twin ?? []);
        setProjects(projectResponse);
        setRequests(requestResponse);
        setBlocks(blockResponse.blocked);
      } catch (loadError) {
        if (!cancelled) setError(errorMessage(loadError, "Skill Exchange could not load."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const projectId = new URLSearchParams(window.location.search).get("project");
    if (!projectId) return;
    const timer = window.setTimeout(() => {
      setSelectedProjectId(projectId);
      setTab("workspace");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const refreshMatches = useCallback(async () => {
    const response = await intelligenceApi.matches();
    setMatches(response.matches);
    setMatchMethod(response.method);
    setMatchNote(response.note ?? "");
    setLearningGoals(response.your_learning_goals ?? []);
    setGapSkills(response.gap_skills_from_twin ?? []);
  }, []);

  const refreshRequests = useCallback(async () => {
    const response = await intelligenceApi.requests();
    setRequests(response);
  }, []);

  const loadProject = useCallback(async (projectId: string) => {
    setProjectBusy(true);
    setProjectError("");
    setProjectNote("");
    try {
      const detail = await intelligenceApi.project(projectId);
      setProject(detail);
      setResponsibilities(Object.fromEntries(detail.team.map((member) => [member.member_id, member.responsibility ?? ""])));
      setJoinRole(detail.roles[0]?.role ?? "Contributor");
      if (detail.is_member) {
        const candidateResponse = await intelligenceApi.candidates(projectId);
        setCandidates(candidateResponse.candidates);
      } else {
        setCandidates([]);
      }
    } catch (loadError) {
      setProject(null);
      setProjectError(errorMessage(loadError, "This project could not be opened."));
    } finally {
      setProjectBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    const timer = window.setTimeout(() => void loadProject(selectedProjectId), 0);
    return () => window.clearTimeout(timer);
  }, [selectedProjectId, loadProject]);

  function openProject(projectId: string) {
    setSelectedProjectId(projectId);
    setTab("workspace");
    window.history.replaceState(null, "", `${window.location.pathname}?project=${encodeURIComponent(projectId)}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeWorkspace() {
    setSelectedProjectId(null);
    setProject(null);
    setProjectError("");
    window.history.replaceState(null, "", window.location.pathname);
    setTab("projects");
  }

  async function connect(member: PublicMember) {
    setActionBusy(`connect-${member.member_id}`);
    setMatchActionError("");
    setNote("");
    try {
      await intelligenceApi.connect(member.member_id, connectMessage.trim());
      setConnectFor(null);
      setConnectMessage("");
      setNote(`Connection request sent to ${member.display_name}. It stays pending until they accept.`);
      await refreshRequests();
    } catch (connectError) {
      setMatchActionError(actionError(connectError, "The connection request could not be sent."));
    } finally {
      setActionBusy(null);
    }
  }

  async function blockMember(member: PublicMember) {
    if (!window.confirm(`Block ${member.display_name}? You will disappear from each other's matches.`)) return;
    setActionBusy(`block-${member.member_id}`);
    setMatchActionError("");
    try {
      await intelligenceApi.block(member.member_id);
      setMatches((items) => items.filter((item) => item.member.member_id !== member.member_id));
      setBlocks((items) => [...items.filter((item) => item.member_id !== member.member_id), { member_id: member.member_id, display_name: member.display_name }]);
      setNote(`${member.display_name} was blocked.`);
    } catch (blockError) {
      setMatchActionError(actionError(blockError, "That member could not be blocked."));
    } finally {
      setActionBusy(null);
    }
  }

  async function reportMember(member: PublicMember) {
    const reason = window.prompt(`Why are you reporting ${member.display_name}? A moderator will review this.`);
    if (!reason) return;
    setActionBusy(`report-${member.member_id}`);
    setMatchActionError("");
    try {
      await intelligenceApi.report("user", member.member_id, reason);
      setNote("Report submitted for moderator review.");
    } catch (reportError) {
      setMatchActionError(actionError(reportError, "The report could not be submitted."));
    } finally {
      setActionBusy(null);
    }
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    setCreateBusy(true);
    setCreateError("");
    setNote("");
    try {
      const roles = createForm.roles
        .map((item) => ({ role: item.role.trim(), skills: splitList(item.skills) }))
        .filter((item) => item.role);
      const created = await intelligenceApi.createProject({
        title: createForm.title.trim(),
        description: createForm.description.trim(),
        roles,
        skills: splitList(createForm.skills),
      });
      const refresh = await intelligenceApi.projects();
      setProjects(refresh);
      setCreateOpen(false);
      setCreateForm({ title: "", description: "", skills: "", roles: [{ role: "", skills: "" }] });
      setNote("Project created. Invite collaborators from the workspace or discover matches.");
      setProject(created);
      setSelectedProjectId(created.id);
      setTab("workspace");
      window.history.replaceState(null, "", `${window.location.pathname}?project=${encodeURIComponent(created.id)}`);
    } catch (createFailure) {
      setCreateError(actionError(createFailure, "The project could not be created."));
    } finally {
      setCreateBusy(false);
    }
  }

  async function saveResponsibilities() {
    if (!project) return;
    setActionBusy("responsibilities");
    setProjectError("");
    try {
      const updated = await intelligenceApi.updateProject(project.id, {
        responsibilities: project.team.map((member) => ({ member_id: member.member_id, responsibility: responsibilities[member.member_id] ?? "" })),
      });
      setProject(updated);
      setProjectNote("Team responsibilities saved.");
    } catch (saveError) {
      setProjectError(actionError(saveError, "Responsibilities could not be saved."));
    } finally {
      setActionBusy(null);
    }
  }

  async function addMilestone(event: FormEvent) {
    event.preventDefault();
    if (!project || milestoneTitle.trim().length < 3) return;
    setActionBusy("milestone");
    setProjectError("");
    try {
      const updated = await intelligenceApi.addMilestone(project.id, milestoneTitle.trim(), milestoneDue || undefined);
      setProject(updated);
      setMilestoneTitle("");
      setMilestoneDue("");
    } catch (milestoneError) {
      setProjectError(actionError(milestoneError, "The milestone could not be added."));
    } finally {
      setActionBusy(null);
    }
  }

  async function toggleMilestone(milestoneId: string, done: boolean) {
    if (!project) return;
    setActionBusy(`milestone-${milestoneId}`);
    setProjectError("");
    try {
      const updated = await intelligenceApi.toggleMilestone(project.id, milestoneId, done);
      setProject(updated);
    } catch (milestoneError) {
      setProjectError(actionError(milestoneError, "The milestone could not be updated."));
    } finally {
      setActionBusy(null);
    }
  }

  async function addTask(event: FormEvent) {
    event.preventDefault();
    if (!project || taskTitle.trim().length < 3) return;
    setActionBusy("task");
    setProjectError("");
    try {
      const updated = await intelligenceApi.addTask(project.id, {
        title: taskTitle.trim(),
        skills: splitList(taskSkills),
        assignee_id: taskAssignee || null,
        milestone_id: taskMilestone || null,
      });
      setProject(updated);
      setTaskTitle("");
      setTaskSkills("");
      setTaskAssignee("");
      setTaskMilestone("");
    } catch (taskError) {
      setProjectError(actionError(taskError, "The task could not be added."));
    } finally {
      setActionBusy(null);
    }
  }

  async function moveTask(taskId: string, status: "TODO" | "DOING" | "DONE") {
    if (!project) return;
    setActionBusy(`task-${taskId}`);
    setProjectError("");
    try {
      const updated = await intelligenceApi.updateTask(project.id, taskId, { status });
      setProject(updated);
      if (status === "DONE") {
        setProjectNote("Task completed. If it has taxonomy skills and an assignee, it records a contribution and rebuilds their twin.");
        const refresh = await intelligenceApi.projects();
        setProjects(refresh);
      }
    } catch (taskError) {
      setProjectError(actionError(taskError, "The task could not be moved."));
    } finally {
      setActionBusy(null);
    }
  }

  async function toggleProjectStatus() {
    if (!project) return;
    setActionBusy("status");
    setProjectError("");
    try {
      const updated = await intelligenceApi.updateProject(project.id, { status: project.status === "OPEN" ? "CLOSED" : "OPEN" });
      setProject(updated);
      setProjectNote(updated.status === "OPEN" ? "Project reopened to new requests." : "Project closed to new requests. Existing members keep workspace access.");
      const refresh = await intelligenceApi.projects();
      setProjects(refresh);
    } catch (statusError) {
      setProjectError(actionError(statusError, "The project status could not be changed."));
    } finally {
      setActionBusy(null);
    }
  }

  async function requestJoin(event: FormEvent) {
    event.preventDefault();
    if (!project) return;
    setActionBusy("join");
    setProjectError("");
    try {
      await intelligenceApi.join(project.id, joinRole, joinMessage.trim());
      setProject({ ...project, pending_request: true });
      setJoinMessage("");
      setProjectNote("Join request sent. The owner decides whether you join the team.");
      await refreshRequests();
    } catch (joinError) {
      setProjectError(actionError(joinError, "The join request could not be sent."));
    } finally {
      setActionBusy(null);
    }
  }

  async function reportProject() {
    if (!project) return;
    const reason = window.prompt("Why are you reporting this project? A moderator will review this.");
    if (!reason) return;
    setActionBusy("report-project");
    setProjectError("");
    try {
      await intelligenceApi.report("project", project.id, reason);
      setProjectNote("Project reported for moderator review.");
    } catch (reportError) {
      setProjectError(actionError(reportError, "The report could not be submitted."));
    } finally {
      setActionBusy(null);
    }
  }

  async function decideRequest(request: ExchangeRequest, accept: boolean) {
    setRequestsBusy(`${request.id}-${accept}`);
    setError("");
    setNote("");
    try {
      await intelligenceApi.decide(request.id, accept);
      await refreshRequests();
      if (accept && request.kind === "PROJECT_JOIN") {
        const refresh = await intelligenceApi.projects();
        setProjects(refresh);
      }
      setNote(accept ? "Request accepted." : "Request declined.");
    } catch (decisionError) {
      setError(actionError(decisionError, "The request could not be decided."));
    } finally {
      setRequestsBusy(null);
    }
  }

  async function withdrawRequest(request: ExchangeRequest) {
    setRequestsBusy(`${request.id}-withdraw`);
    setError("");
    try {
      await intelligenceApi.withdraw(request.id);
      await refreshRequests();
      setNote("Request withdrawn.");
    } catch (withdrawError) {
      setError(actionError(withdrawError, "The request could not be withdrawn."));
    } finally {
      setRequestsBusy(null);
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setProfileBusy(true);
    setProfileError("");
    setNote("");
    try {
      const saved = await intelligenceApi.saveExchangeProfile({
        display_name: form.display_name.trim(),
        headline: form.headline.trim() || null,
        teach: splitList(form.teach),
        learn: splitList(form.learn),
        tech: splitList(form.tech),
        interests: splitList(form.interests),
        roles: splitList(form.roles),
        availability: form.availability.trim() || null,
        level: form.level,
        visibility: form.visibility,
        show_evidence: form.show_evidence,
      });
      setProfile(saved.profile);
      setForm(formFromProfile(saved.profile));
      setNote(saved.profile.visibility === "members" ? "Profile saved and visible to members." : "Profile saved. It stays hidden from matching until you choose members-only visibility.");
      await refreshMatches();
    } catch (saveError) {
      setProfileError(actionError(saveError, "Your exchange profile could not be saved."));
    } finally {
      setProfileBusy(false);
    }
  }

  async function unblock(memberId: string) {
    setActionBusy(`unblock-${memberId}`);
    setProfileError("");
    try {
      await intelligenceApi.unblock(memberId);
      setBlocks((items) => items.filter((item) => item.member_id !== memberId));
      await refreshMatches();
    } catch (unblockError) {
      setProfileError(actionError(unblockError, "That member could not be unblocked."));
    } finally {
      setActionBusy(null);
    }
  }

  const pendingIncoming = useMemo(() => requests.incoming.filter((item) => item.status === "PENDING").length, [requests.incoming]);
  const myProjects = projects.mine;
  const canInvite = Boolean(profile?.visibility === "members");

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl space-y-5">
          <div className="skeleton h-24 rounded-3xl" />
          <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="skeleton h-28 rounded-2xl" />)}</div>
          <div className="grid gap-4 lg:grid-cols-2">{[0, 1, 2, 3].map((item) => <div key={item} className="skeleton h-52 rounded-2xl" />)}</div>
          <span className="sr-only">Loading Skill Exchange…</span>
        </div>
      </AppShell>
    );
  }

  if (error && !profile) {
    return (
      <AppShell>
        <div className="mx-auto max-w-3xl py-4">
          <EmptyState
            icon={Users}
            title="Skill Exchange could not load"
            detail={error}
            action={<button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-[#75451F] px-4 py-2 text-xs font-semibold text-white">Try again</button>}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl">
        <LoopStrip active="exchange" />
        <Heading
          eyebrow="Skill Exchange · peer learning"
          title="Trade skills, not contact details."
          detail="Match with peers who can teach what your twin is missing. Collaborate in a shared workspace where completed tasks become evidence."
          action={
            <button
              type="button"
              onClick={() => {
                setTab("profile");
                setNote("");
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-[#EDE6DA] bg-white px-3.5 py-2 text-xs font-semibold text-[#75451F] transition hover:border-[#E3C894]"
            >
              {profile?.visibility === "members" ? <Eye size={13} /> : <EyeOff size={13} />}
              {profile?.visibility === "members" ? "Profile visible to members" : "Profile hidden"}
            </button>
          }
        />

        {error && <div className="mb-4"><InlineNote tone="error">{error}</InlineNote></div>}
        {note && <div className="mb-4"><InlineNote tone="success">{note}</InlineNote></div>}

        <div className="flex flex-wrap gap-1.5 rounded-2xl border border-[#EDE6DA] bg-[#FFFCF6] p-1.5">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.key;
            const count = item.key === "requests" ? pendingIncoming : 0;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setTab(item.key);
                  setError("");
                  setNote("");
                }}
                className={cn(
                  "relative inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-[11px] font-semibold transition",
                  active ? "bg-[#24211D] text-white shadow-sm" : "text-[#6F675C] hover:bg-white hover:text-[#24211D]",
                )}
                aria-pressed={active}
              >
                <Icon size={13} /> <span className="truncate">{item.label}</span>
                {count > 0 && <span className="grid size-4 place-items-center rounded-full bg-[#E99A32] text-[8px] font-bold text-white">{count}</span>}
              </button>
            );
          })}
        </div>

        {tab === "matches" && (
          <div className="mt-5">
            <Card className="mb-4 rounded-2xl p-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-[#6F675C]">
                <span className="inline-flex items-center gap-1.5"><Users size={13} className="text-[#75451F]" /><b className="text-[#24211D]">{matches.length}</b> compatible peers</span>
                {matchMethod && <span className="rounded-full border border-[#EDE6DA] bg-[#FFFCF6] px-2 py-0.5 text-[9px]">Matching: {matchMethod}</span>}
                {learningGoals.length > 0 && <span>Looking for: <b className="text-[#24211D]">{learningGoals.slice(0, 4).join(", ")}</b></span>}
              </div>
              {gapSkills.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[#8A7F71]">Twin gaps:</span>
                  {gapSkills.slice(0, 6).map((skill) => <span key={skill} className="rounded-md border border-[#E99A32]/30 bg-[#FFF5E5] px-1.5 py-0.5 text-[9px] text-[#75451F]">{skill}</span>)}
                </div>
              )}
              {!canInvite && <InlineNote tone="warning">Your profile is hidden. Set visibility to members in Profile & privacy before connecting.</InlineNote>}
            </Card>

            {matchNote && <div className="mb-4"><InlineNote tone="info">{matchNote}</InlineNote></div>}
            {matchActionError && <div className="mb-4"><InlineNote tone="error">{matchActionError}</InlineNote></div>}

            {matches.length === 0 ? (
              <EmptyState
                icon={Handshake}
                title="No matches yet"
                detail={profile?.visibility === "members" ? "As more members publish profiles and add teach/learn skills, compatible peers will appear here. Add interests and learning goals to improve matching." : "Publish a members-only profile with what you can teach and want to learn. Matching runs against your twin's gaps too."}
                action={<button type="button" onClick={() => setTab("profile")} className="inline-flex items-center gap-1.5 rounded-xl bg-[#75451F] px-3.5 py-2 text-xs font-semibold text-white">Edit exchange profile <ArrowRight size={12} /></button>}
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {matches.map((match) => {
                  const member = match.member;
                  const busy = actionBusy?.endsWith(member.member_id);
                  return (
                    <Card key={member.member_id} className="rounded-3xl p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#F4B942] to-[#E99A32] text-sm font-bold text-[#3A2512]">
                            {member.display_name.slice(0, 2).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <h2 className="truncate font-display text-lg font-bold text-[#24211D]">{member.display_name}</h2>
                              {match.mutual && <Badge tone="primary">Two-way swap</Badge>}
                            </div>
                            <p className="truncate text-[11px] text-[#6F675C]">{member.headline || `${LEVEL_LABEL[member.level] ?? member.level} learner`}</p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-display text-xl font-bold text-[#75451F]">{Math.round(match.score)}</p>
                          <p className="text-[8px] font-semibold uppercase tracking-wider text-[#A89D8F]">match</p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="rounded-full border border-[#EDE6DA] bg-[#FFFCF6] px-2 py-0.5 text-[9px] text-[#6F675C]">{LEVEL_LABEL[member.level] ?? member.level}</span>
                        {member.availability && <span className="inline-flex items-center gap-1 rounded-full border border-[#EDE6DA] bg-[#FFFCF6] px-2 py-0.5 text-[9px] text-[#6F675C]"><Clock3 size={9} /> {member.availability}</span>}
                        {member.roles.slice(0, 2).map((role) => <span key={role} className="rounded-full border border-[#EDE6DA] bg-[#FFFCF6] px-2 py-0.5 text-[9px] text-[#6F675C]">{role}</span>)}
                      </div>

                      {match.reasons.length > 0 && (
                        <ul className="mt-3 space-y-1">
                          {match.reasons.slice(0, 3).map((reason) => <li key={reason} className="flex items-start gap-1.5 text-[11px] leading-4 text-[#4A443C]"><Sparkles size={11} className="mt-0.5 shrink-0 text-[#E99A32]" /> {reason}</li>)}
                        </ul>
                      )}

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-wider text-[#8A7F71]">Can teach you</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {match.they_can_teach.length ? match.they_can_teach.map((skill) => (
                              <span key={skill} className="inline-flex items-center gap-1 rounded-lg border border-[#EDE6DA] bg-white px-1.5 py-1 text-[9px] text-[#4A443C]">
                                {skill}
                                {member.teach_evidence[skill] && <TierChip tier={member.teach_evidence[skill]} showDot={false} className="px-1 py-0 text-[7px]" />}
                              </span>
                            )) : <span className="text-[9px] text-[#A89D8F]">No direct overlap</span>}
                          </div>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-wider text-[#8A7F71]">You can teach</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {match.you_can_teach.length ? match.you_can_teach.map((skill) => <span key={skill} className="rounded-lg border border-[#F4B942]/50 bg-[#FFF5E5] px-1.5 py-1 text-[9px] text-[#75451F]">{skill}</span>) : <span className="text-[9px] text-[#A89D8F]">No direct overlap</span>}
                          </div>
                        </div>
                      </div>

                      {member.teach.length > 0 && (
                        <p className="mt-2 truncate text-[9px] text-[#A89D8F]">Teaches: {member.teach.join(" · ")}</p>
                      )}

                      {connectFor === member.member_id ? (
                        <div className="mt-3 rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] p-2.5">
                          <FieldLabel htmlFor={`connect-${member.member_id}`}>Message (optional)</FieldLabel>
                          <textarea
                            id={`connect-${member.member_id}`}
                            value={connectMessage}
                            onChange={(event) => setConnectMessage(event.target.value)}
                            maxLength={400}
                            rows={2}
                            placeholder={`Hi ${member.display_name.split(" ")[0]}, could we swap notes on ${match.they_can_teach[0] ?? "skills"}?`}
                            className={cn(inputClass, "resize-none text-[11px]")}
                          />
                          <div className="mt-2 flex justify-end gap-2">
                            <button type="button" onClick={() => setConnectFor(null)} className="rounded-lg border border-[#EDE6DA] px-2.5 py-1.5 text-[10px] font-semibold text-[#6F675C]">Cancel</button>
                            <button type="button" onClick={() => void connect(member)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-[#75451F] px-2.5 py-1.5 text-[10px] font-semibold text-white disabled:opacity-60">
                              {busy ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />} Send request
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#F0EBE2] pt-3">
                          <button
                            type="button"
                            onClick={() => {
                              setConnectFor(member.member_id);
                              setConnectMessage("");
                              setMatchActionError("");
                            }}
                            disabled={!canInvite}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#75451F] px-3 py-1.5 text-[10px] font-semibold text-white transition hover:bg-[#5D3518] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <UserPlus size={11} /> Connect
                          </button>
                          <button type="button" onClick={() => void blockMember(member)} disabled={busy} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[9px] font-semibold text-[#8A7F71] hover:bg-[#FFF5E5] hover:text-[#75451F] disabled:opacity-50">
                            <Ban size={10} /> Block
                          </button>
                          <button type="button" onClick={() => void reportMember(member)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[9px] font-semibold text-[#8A7F71] hover:bg-[#C62828]/10 hover:text-[#C62828] disabled:opacity-50">
                            <Flag size={10} /> Report
                          </button>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "projects" && (
          <div className="mt-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#A1743A]">Team projects</p>
                <h2 className="mt-0.5 font-display text-xl font-bold text-[#24211D]">Build something with a peer</h2>
                <p className="mt-0.5 text-[11px] text-[#6F675C]">Project roles drive matches. Completed tasks can become evidence in the assignee&apos;s twin.</p>
              </div>
              <button type="button" onClick={() => setCreateOpen((value) => !value)} className="inline-flex items-center gap-1.5 rounded-xl bg-[#75451F] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#5D3518]">
                {createOpen ? <X size={13} /> : <Plus size={13} />} {createOpen ? "Close form" : "Create project"}
              </button>
            </div>

            {createOpen && (
              <Card className="mb-5 rounded-3xl p-5">
                <CardTitle detail="Title, description and at least one role. Skills are comma-separated.">New project brief</CardTitle>
                <form onSubmit={(event) => void createProject(event)} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <FieldLabel htmlFor="project-title">Title</FieldLabel>
                      <input id="project-title" value={createForm.title} onChange={(event) => setCreateForm((value) => ({ ...value, title: event.target.value }))} minLength={4} maxLength={120} placeholder="Open-source study planner" className={inputClass} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="project-skills">Project skills</FieldLabel>
                      <input id="project-skills" value={createForm.skills} onChange={(event) => setCreateForm((value) => ({ ...value, skills: event.target.value }))} placeholder="React, TypeScript, SQL" className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <FieldLabel htmlFor="project-description">Description</FieldLabel>
                    <textarea id="project-description" value={createForm.description} onChange={(event) => setCreateForm((value) => ({ ...value, description: event.target.value }))} minLength={20} maxLength={3000} rows={3} placeholder="What are you building, for whom, and what does a collaborator own?" className={cn(inputClass, "resize-y")} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <FieldLabel>Open roles</FieldLabel>
                      <button type="button" onClick={() => setCreateForm((value) => ({ ...value, roles: [...value.roles, { role: "", skills: "" }] }))} className="mb-1 inline-flex items-center gap-1 text-[10px] font-semibold text-[#75451F]"><Plus size={10} /> Add role</button>
                    </div>
                    <div className="space-y-2">
                      {createForm.roles.map((role, index) => (
                        <div key={index} className="flex flex-col gap-2 sm:flex-row">
                          <input value={role.role} onChange={(event) => setCreateForm((value) => ({ ...value, roles: value.roles.map((item, itemIndex) => itemIndex === index ? { ...item, role: event.target.value } : item) }))} placeholder="Role, e.g. Frontend contributor" maxLength={60} className={inputClass} />
                          <input value={role.skills} onChange={(event) => setCreateForm((value) => ({ ...value, roles: value.roles.map((item, itemIndex) => itemIndex === index ? { ...item, skills: event.target.value } : item) }))} placeholder="Skills, comma-separated" className={inputClass} />
                          {createForm.roles.length > 1 && (
                            <button type="button" onClick={() => setCreateForm((value) => ({ ...value, roles: value.roles.filter((_, itemIndex) => itemIndex !== index) }))} aria-label="Remove role" className="grid size-[34px] shrink-0 place-items-center rounded-xl border border-[#EDE6DA] text-[#8A7F71] hover:text-[#C62828]"><X size={12} /></button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  {createError && <InlineNote tone="error">{createError}</InlineNote>}
                  <div className="flex justify-end">
                    <button type="submit" disabled={createBusy || createForm.title.trim().length < 4 || createForm.description.trim().length < 20} className="inline-flex items-center gap-1.5 rounded-xl bg-[#24211D] px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                      {createBusy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} {createBusy ? "Creating…" : "Create project"}
                    </button>
                  </div>
                </form>
              </Card>
            )}

            <div className="grid items-start gap-5 xl:grid-cols-2">
              <Card className="rounded-3xl p-5">
                <CardTitle detail="Projects you own or have joined." action={<FolderKanban size={18} className="text-[#E99A32]" />}>My projects</CardTitle>
                {myProjects.length ? (
                  <div className="space-y-2.5">
                    {myProjects.map((item) => <ProjectCard key={item.id} project={item} onOpen={() => openProject(item.id)} />)}
                  </div>
                ) : (
                  <EmptyState icon={FolderKanban} title="No projects yet" detail="Create a project or request to join one. Your team workspace includes milestones, tasks and contributions." />
                )}
              </Card>

              <Card className="rounded-3xl p-5">
                <CardTitle detail="Open projects ranked by overlap with skills you can teach." action={<Sparkles size={18} className="text-[#E99A32]" />}>Discover by fit</CardTitle>
                {projects.discover.length ? (
                  <div className="space-y-2.5">
                    {projects.discover.map((item) => <ProjectCard key={item.id} project={item} onOpen={() => openProject(item.id)} />)}
                  </div>
                ) : (
                  <EmptyState icon={Users} title="No open projects to discover" detail="When other members publish projects, the ones matching your skills will appear here." />
                )}
              </Card>
            </div>
          </div>
        )}

        {tab === "workspace" && (
          <div className="mt-5">
            {!selectedProjectId ? (
              <EmptyState
                icon={ListTodo}
                title="Open a project workspace"
                detail="Choose one of your projects or discover an open team from the Projects tab."
                action={<button type="button" onClick={() => setTab("projects")} className="inline-flex items-center gap-1.5 rounded-xl bg-[#75451F] px-3.5 py-2 text-xs font-semibold text-white">Browse projects <ArrowRight size={12} /></button>}
              />
            ) : projectBusy && !project ? (
              <div className="space-y-4"><Skeleton className="h-36 rounded-3xl" /><div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-72 rounded-3xl" /><Skeleton className="h-72 rounded-3xl" /></div></div>
            ) : projectError && !project ? (
              <div>
                <div className="mb-3"><InlineNote tone="error">{projectError}</InlineNote></div>
                <EmptyState icon={FolderKanban} title="Workspace unavailable" detail="The project may be closed, hidden or no longer shared with you." action={<button type="button" onClick={closeWorkspace} className="rounded-xl border border-[#EDE6DA] bg-white px-3.5 py-2 text-xs font-semibold text-[#75451F]">Back to projects</button>} />
              </div>
            ) : project ? (
              <div className="space-y-5">
                <Card className="rounded-3xl p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={closeWorkspace} className="text-[10px] font-semibold text-[#8A7F71] hover:text-[#75451F]">← Projects</button>
                        <StatusChip status={project.status} />
                        {project.is_owner && <Badge tone="primary">Owner</Badge>}
                        {project.is_member && !project.is_owner && <Badge tone="warm">Member</Badge>}
                      </div>
                      <h2 className="mt-1 font-display text-2xl font-bold text-[#24211D]">{project.title}</h2>
                      <p className="mt-1 max-w-2xl text-xs leading-5 text-[#6F675C]">{project.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {project.skills.map((skill) => <span key={skill} className="rounded-md border border-[#EDE6DA] bg-[#FFFCF6] px-1.5 py-0.5 text-[9px] text-[#6F675C]">{skill}</span>)}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {project.is_owner && (
                        <button type="button" onClick={() => void toggleProjectStatus()} disabled={actionBusy === "status"} className="inline-flex items-center gap-1 rounded-lg border border-[#EDE6DA] bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[#75451F] hover:border-[#E3C894] disabled:opacity-60">
                          {actionBusy === "status" ? <Loader2 size={10} className="animate-spin" /> : <Circle size={10} />} {project.status === "OPEN" ? "Close project" : "Reopen project"}
                        </button>
                      )}
                      {project.is_member && (
                        <button type="button" onClick={() => void reportProject()} disabled={actionBusy === "report-project"} className="inline-flex items-center gap-1 rounded-lg border border-[#EDE6DA] bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[#8A7F71] hover:text-[#C62828] disabled:opacity-60">
                          <Flag size={10} /> Report
                        </button>
                      )}
                    </div>
                  </div>
                  {projectError && <div className="mt-3"><InlineNote tone="error">{projectError}</InlineNote></div>}
                  {projectNote && <div className="mt-3"><InlineNote tone="success">{projectNote}</InlineNote></div>}
                  {projectNote && projectNote.startsWith("Task completed") && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-[#75451F]"><ShieldCheck size={11} /> This contribution is evidence, not just activity. The Digital Twin decides the resulting tier.</p>
                  )}
                </Card>

                {!project.is_member ? (
                  <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.55fr)]">
                    <Card className="rounded-3xl p-5">
                      <CardTitle detail="The owner decides who joins. Your request is visible in their Requests tab.">Request to join</CardTitle>
                      <form onSubmit={(event) => void requestJoin(event)} className="space-y-3">
                        <div>
                          <FieldLabel htmlFor="join-role">Role</FieldLabel>
                          <select id="join-role" value={joinRole} onChange={(event) => setJoinRole(event.target.value)} className={selectClass}>
                            {project.roles.map((role) => <option key={role.role} value={role.role}>{role.role}{role.skills.length ? ` — ${role.skills.join(", ")}` : ""}</option>)}
                            {!project.roles.length && <option value="Contributor">Contributor</option>}
                          </select>
                        </div>
                        <div>
                          <FieldLabel htmlFor="join-message">Message (optional)</FieldLabel>
                          <textarea id="join-message" value={joinMessage} onChange={(event) => setJoinMessage(event.target.value)} rows={3} maxLength={400} placeholder="What can you contribute?" className={cn(inputClass, "resize-none")} />
                        </div>
                        {project.pending_request ? (
                          <InlineNote tone="warning">Your join request is pending. You can withdraw it from the Requests tab.</InlineNote>
                        ) : (
                          <button type="submit" disabled={actionBusy === "join"} className="inline-flex items-center gap-1.5 rounded-xl bg-[#75451F] px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-60">
                            {actionBusy === "join" ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Send join request
                          </button>
                        )}
                      </form>
                    </Card>
                    <Card className="rounded-3xl p-5">
                      <CardTitle detail="Roles the owner is looking for.">Open roles</CardTitle>
                      <div className="space-y-2">
                        {project.roles.length ? project.roles.map((role) => (
                          <div key={role.role} className="rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] px-3 py-2">
                            <p className="text-[11px] font-bold text-[#24211D]">{role.role}</p>
                            <p className="mt-0.5 text-[9px] text-[#8A7F71]">{role.skills.join(" · ") || "No specific skills listed"}</p>
                          </div>
                        )) : <p className="text-[10px] text-[#8A7F71]">No roles listed.</p>}
                      </div>
                    </Card>
                  </div>
                ) : (
                  <>
                    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,.55fr)]">
                      <div className="space-y-5">
                        <Card className="rounded-3xl p-5">
                          <CardTitle detail="Per-member ownership makes the team legible." action={<Users size={18} className="text-[#E99A32]" />}>Team & responsibilities</CardTitle>
                          <div className="space-y-2.5">
                            {project.team.map((member) => (
                              <div key={member.member_id} className="rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="grid size-7 place-items-center rounded-lg bg-[#FFF5E5] text-[9px] font-bold text-[#75451F]">{member.display_name.slice(0, 2).toUpperCase()}</span>
                                    <div>
                                      <p className="text-[11px] font-bold text-[#24211D]">{member.display_name}{member.is_you ? " (you)" : ""}</p>
                                      <p className="text-[9px] text-[#8A7F71]">{member.role} · joined {formatDate(member.joined_at)}</p>
                                    </div>
                                  </div>
                                </div>
                                {project.is_owner ? (
                                  <input
                                    value={responsibilities[member.member_id] ?? ""}
                                    onChange={(event) => setResponsibilities((current) => ({ ...current, [member.member_id]: event.target.value }))}
                                    maxLength={140}
                                    aria-label={`Responsibility for ${member.display_name}`}
                                    placeholder="What does this person own?"
                                    className={cn(inputClass, "mt-2 py-1.5 text-[10px]")}
                                  />
                                ) : (
                                  <p className="mt-1.5 text-[10px] text-[#6F675C]">{member.responsibility || "Responsibility not set yet."}</p>
                                )}
                              </div>
                            ))}
                          </div>
                          {project.is_owner && (
                            <div className="mt-3 flex justify-end">
                              <button type="button" onClick={() => void saveResponsibilities()} disabled={actionBusy === "responsibilities"} className="inline-flex items-center gap-1.5 rounded-lg bg-[#75451F] px-3 py-1.5 text-[10px] font-semibold text-white disabled:opacity-60">
                                {actionBusy === "responsibilities" ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Save responsibilities
                              </button>
                            </div>
                          )}
                        </Card>

                        <Card className="rounded-3xl p-5">
                          <CardTitle detail="Milestones track outcomes; tasks track work and evidence." action={<CalendarClock size={18} className="text-[#E99A32]" />}>Milestones</CardTitle>
                          <div className="space-y-2">
                            {(project.milestones ?? []).map((milestone) => (
                              <div key={milestone.id} className="flex items-center gap-2.5 rounded-xl border border-[#EDE6DA] bg-white px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => void toggleMilestone(milestone.id, !milestone.done)}
                                  disabled={actionBusy === `milestone-${milestone.id}`}
                                  aria-label={milestone.done ? `Reopen ${milestone.title}` : `Complete ${milestone.title}`}
                                  className={cn("grid size-5 shrink-0 place-items-center rounded-md border transition", milestone.done ? "border-[#2E7D32] bg-[#2E7D32] text-white" : "border-[#D8C8AE] bg-white text-transparent hover:border-[#E99A32]")}
                                >
                                  {actionBusy === `milestone-${milestone.id}` ? <Loader2 size={10} className="animate-spin text-[#75451F]" /> : <Check size={11} />}
                                </button>
                                <div className="min-w-0 flex-1">
                                  <p className={cn("truncate text-[11px] font-semibold", milestone.done ? "text-[#8A7F71] line-through" : "text-[#24211D]")}>{milestone.title}</p>
                                  <p className="text-[9px] text-[#A89D8F]">{milestone.due_date ? `Due ${formatDate(milestone.due_date)}` : "No due date"}</p>
                                </div>
                                <StatusChip status={milestone.done ? "ACCEPTED" : "PENDING"} />
                              </div>
                            ))}
                            {(project.milestones ?? []).length === 0 && <p className="rounded-lg border border-dashed border-[#E3D8C5] px-3 py-3 text-[10px] text-[#8A7F71]">No milestones yet. Add the first outcome below.</p>}
                          </div>
                          <form onSubmit={(event) => void addMilestone(event)} className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <input value={milestoneTitle} onChange={(event) => setMilestoneTitle(event.target.value)} minLength={3} maxLength={120} required placeholder="Milestone title" aria-label="Milestone title" className={cn(inputClass, "flex-1")} />
                            <input type="date" value={milestoneDue} onChange={(event) => setMilestoneDue(event.target.value)} aria-label="Milestone due date" className={cn(inputClass, "sm:w-[145px]")} />
                            <button type="submit" disabled={actionBusy === "milestone" || milestoneTitle.trim().length < 3} className="inline-flex shrink-0 items-center justify-center gap-1 rounded-xl bg-[#24211D] px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-50"><Plus size={11} /> Add</button>
                          </form>
                        </Card>

                        <Card className="rounded-3xl p-5">
                          <CardTitle detail="Move work across TODO, DOING and DONE. DONE can create twin evidence." action={<ListTodo size={18} className="text-[#E99A32]" />}>Task board</CardTitle>
                          <div className="grid gap-3 md:grid-cols-3">
                            {(["TODO", "DOING", "DONE"] as const).map((status) => {
                              const items = (project.tasks ?? []).filter((task) => task.status === status);
                              const labels = { TODO: "To do", DOING: "Doing", DONE: "Done" };
                              const next = status === "TODO" ? "DOING" : status === "DOING" ? "DONE" : null;
                              return (
                                <div key={status} className="rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] p-2">
                                  <div className="flex items-center justify-between px-1 py-1">
                                    <p className="text-[9px] font-bold uppercase tracking-wider text-[#8A7F71]">{labels[status]}</p>
                                    <span className="text-[9px] font-bold text-[#B9AE9C]">{items.length}</span>
                                  </div>
                                  <div className="space-y-1.5">
                                    {items.map((task) => {
                                      const assignee = project.team.find((member) => member.member_id === task.assignee_id);
                                      return (
                                        <div key={task.id} className="rounded-lg border border-[#EDE6DA] bg-white p-2">
                                          <p className="text-[10px] font-semibold leading-4 text-[#24211D]">{task.title}</p>
                                          {task.skills.length > 0 && <p className="mt-0.5 truncate text-[8px] text-[#A1743A]">{task.skills.join(" · ")}</p>}
                                          <p className="mt-0.5 text-[8px] text-[#A89D8F]">{assignee ? assignee.display_name : "Unassigned"}</p>
                                          {next && (
                                            <button
                                              type="button"
                                              onClick={() => void moveTask(task.id, next)}
                                              disabled={actionBusy === `task-${task.id}`}
                                              className="mt-1.5 inline-flex w-full items-center justify-center gap-1 rounded-md border border-[#EDE6DA] px-1.5 py-1 text-[8px] font-semibold text-[#75451F] hover:border-[#E3C894] disabled:opacity-60"
                                            >
                                              {actionBusy === `task-${task.id}` ? <Loader2 size={8} className="animate-spin" /> : <ArrowRight size={8} />} Move to {labels[next]}
                                            </button>
                                          )}
                                          {status === "DONE" && <p className="mt-1 text-[8px] text-[#2E7D32]">Evidence recorded if eligible.</p>}
                                        </div>
                                      );
                                    })}
                                    {items.length === 0 && <p className="px-1 pb-2 text-[8px] text-[#B9AE9C]">Nothing here.</p>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <form onSubmit={(event) => void addTask(event)} className="mt-3 grid gap-2 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                              <FieldLabel htmlFor="task-title">New task</FieldLabel>
                              <input id="task-title" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} minLength={3} maxLength={160} placeholder="Implement the matching endpoint" className={inputClass} />
                            </div>
                            <div>
                              <FieldLabel htmlFor="task-skills">Skills (taxonomy)</FieldLabel>
                              <input id="task-skills" value={taskSkills} onChange={(event) => setTaskSkills(event.target.value)} placeholder="python, sql" className={inputClass} />
                            </div>
                            <div>
                              <FieldLabel htmlFor="task-assignee">Assignee</FieldLabel>
                              <select id="task-assignee" value={taskAssignee} onChange={(event) => setTaskAssignee(event.target.value)} className={selectClass}>
                                <option value="">Unassigned</option>
                                {project.team.map((member) => <option key={member.member_id} value={member.member_id}>{member.display_name}</option>)}
                              </select>
                            </div>
                            <div className="sm:col-span-2">
                              <FieldLabel htmlFor="task-milestone">Milestone</FieldLabel>
                              <select id="task-milestone" value={taskMilestone} onChange={(event) => setTaskMilestone(event.target.value)} className={selectClass}>
                                <option value="">No milestone</option>
                                {(project.milestones ?? []).map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}
                              </select>
                            </div>
                            <div className="sm:col-span-2 flex items-center justify-between gap-2">
                              <p className="text-[9px] leading-4 text-[#A89D8F]">DONE with an assignee and recognized skills records a contribution and rebuilds their twin.</p>
                              <button type="submit" disabled={actionBusy === "task" || taskTitle.trim().length < 3} className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-[#75451F] px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-50">
                                {actionBusy === "task" ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />} Add task
                              </button>
                            </div>
                          </form>
                        </Card>
                      </div>

                      <div className="space-y-5">
                        <Card className="rounded-3xl p-5">
                          <CardTitle detail="Roles and skills in this brief.">Project roles</CardTitle>
                          <div className="space-y-2">
                            {project.roles.map((role) => (
                              <div key={role.role} className="rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] px-3 py-2">
                                <p className="text-[11px] font-bold text-[#24211D]">{role.role}</p>
                                <p className="mt-0.5 text-[9px] text-[#8A7F71]">{role.skills.join(" · ") || "No skills listed"}</p>
                              </div>
                            ))}
                            {project.roles.length === 0 && <p className="text-[10px] text-[#A89D8F]">No roles listed.</p>}
                          </div>
                        </Card>

                        <Card className="rounded-3xl p-5">
                          <CardTitle detail="From the whole exchange, excluding current members." action={<UserPlus size={18} className="text-[#E99A32]" />}>Candidate peers</CardTitle>
                          {candidates.length ? (
                            <div className="space-y-2">
                              {candidates.slice(0, 5).map((candidate) => (
                                <div key={candidate.member.member_id} className="rounded-xl border border-[#EDE6DA] bg-white p-2.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="truncate text-[11px] font-bold text-[#24211D]">{candidate.member.display_name}</p>
                                      <p className="truncate text-[9px] text-[#8A7F71]">{candidate.member.headline || LEVEL_LABEL[candidate.member.level]}</p>
                                    </div>
                                    <span className="text-[9px] font-bold text-[#75451F]">{candidate.score}%</span>
                                  </div>
                                  <p className="mt-1 text-[9px] text-[#6F675C]">Covers: {candidate.covers.slice(0, 4).join(", ")}</p>
                                  {candidate.suggested_role && <p className="text-[9px] text-[#A1743A]">Suggested role: {candidate.suggested_role}</p>}
                                </div>
                              ))}
                            </div>
                          ) : <p className="rounded-lg border border-dashed border-[#E3D8C5] px-3 py-3 text-[10px] leading-4 text-[#8A7F71]">No compatible members found yet. Candidate suggestions need published member profiles.</p>}
                        </Card>

                        <Card className="rounded-3xl p-5">
                          <CardTitle detail="Contributions come from completed tasks or confirmed work." action={<ShieldCheck size={18} className="text-[#E99A32]" />}>Contributions</CardTitle>
                          {(project.contributions ?? []).length ? (
                            <div className="space-y-2">
                              {project.contributions?.map((contribution) => (
                                <div key={contribution.id} className="rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] p-2.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-[10px] font-semibold text-[#24211D]">{contribution.display_name || "Member"}</p>
                                    <span className={cn("rounded-full border px-1.5 py-0.5 text-[8px] font-semibold", contribution.peer_confirmed ? "border-[#2E7D32]/25 bg-[#2E7D32]/10 text-[#2E7D32]" : "border-[#EDE6DA] bg-white text-[#8A7F71]")}>
                                      {contribution.peer_confirmed ? "Peer confirmed" : "Self logged"}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 text-[10px] leading-4 text-[#4A443C]">{contribution.summary}</p>
                                  <p className="mt-0.5 text-[9px] text-[#A1743A]">{contribution.skills.join(" · ")}</p>
                                  <p className="mt-0.5 text-[8px] text-[#A89D8F]">{relativeTime(contribution.created_at)} · evidence feeds the assignee&apos;s Twin</p>
                                </div>
                              ))}
                            </div>
                          ) : <p className="rounded-lg border border-dashed border-[#E3D8C5] px-3 py-3 text-[10px] leading-4 text-[#8A7F71]">No contributions yet. Move a task to DONE to create one.</p>}
                        </Card>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        )}

        {tab === "requests" && (
          <div className="mt-5 grid items-start gap-5 xl:grid-cols-2">
            <Card className="rounded-3xl p-5">
              <CardTitle detail="Join and peer-connect requests waiting for your decision." action={<Inbox size={18} className="text-[#E99A32]" />}>Incoming</CardTitle>
              {requests.incoming.length ? (
                <div className="space-y-2.5">
                  {requests.incoming.map((request) => (
                    <div key={request.id} className="rounded-xl border border-[#EDE6DA] bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-bold text-[#24211D]">{request.other.display_name}</p>
                        <StatusChip status={request.status} />
                      </div>
                      <p className="mt-0.5 text-[9px] text-[#8A7F71]">{request.kind === "PROJECT_JOIN" ? `Wants to join ${request.project_title ?? "your project"}${request.role ? ` as ${request.role}` : ""}` : "Wants to connect and swap skills"}</p>
                      {request.message && <p className="mt-1.5 rounded-lg bg-[#FFFCF6] px-2 py-1.5 text-[10px] italic leading-4 text-[#6F675C]">“{request.message}”</p>}
                      <p className="mt-1 text-[8px] text-[#A89D8F]">{relativeTime(request.created_at)}</p>
                      {request.status === "PENDING" && (
                        <div className="mt-2 flex gap-2">
                          <button type="button" onClick={() => void decideRequest(request, true)} disabled={requestsBusy === `${request.id}-true`} className="inline-flex items-center gap-1 rounded-lg bg-[#2E7D32] px-2.5 py-1.5 text-[10px] font-semibold text-white disabled:opacity-60">
                            {requestsBusy === `${request.id}-true` ? <Loader2 size={9} className="animate-spin" /> : <Check size={9} />} Accept
                          </button>
                          <button type="button" onClick={() => void decideRequest(request, false)} disabled={requestsBusy === `${request.id}-false`} className="inline-flex items-center gap-1 rounded-lg border border-[#EDE6DA] bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[#6F675C] disabled:opacity-60">
                            <X size={9} /> Decline
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : <EmptyState icon={Inbox} title="No incoming requests" detail="Peer connect and project join requests appear here for your decision." />}
            </Card>

            <Card className="rounded-3xl p-5">
              <CardTitle detail="Requests you sent. Pending ones can be withdrawn." action={<Send size={18} className="text-[#E99A32]" />}>Outgoing</CardTitle>
              {requests.outgoing.length ? (
                <div className="space-y-2.5">
                  {requests.outgoing.map((request) => (
                    <div key={request.id} className="rounded-xl border border-[#EDE6DA] bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-bold text-[#24211D]">{request.other.display_name}</p>
                        <StatusChip status={request.status} />
                      </div>
                      <p className="mt-0.5 text-[9px] text-[#8A7F71]">{request.kind === "PROJECT_JOIN" ? `Join request for ${request.project_title ?? "project"}${request.role ? ` · ${request.role}` : ""}` : "Peer connect request"}</p>
                      {request.message && <p className="mt-1.5 rounded-lg bg-[#FFFCF6] px-2 py-1.5 text-[10px] italic leading-4 text-[#6F675C]">“{request.message}”</p>}
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p className="text-[8px] text-[#A89D8F]">{relativeTime(request.created_at)}</p>
                        {request.status === "PENDING" && (
                          <button type="button" onClick={() => void withdrawRequest(request)} disabled={requestsBusy === `${request.id}-withdraw`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-semibold text-[#8A7F71] hover:bg-[#FFF5E5] hover:text-[#75451F] disabled:opacity-60">
                            {requestsBusy === `${request.id}-withdraw` ? <Loader2 size={9} className="animate-spin" /> : <X size={9} />} Withdraw
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <EmptyState icon={Send} title="No outgoing requests" detail="Connect with a match or request to join a project; sent requests appear here." />}
            </Card>
          </div>
        )}

        {tab === "profile" && form && (
          <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.65fr)]">
            <Card className="rounded-3xl p-5 sm:p-6">
              <CardTitle detail="Only display name, headline and skill lists are shared with members. Never email or phone." action={<ShieldCheck size={19} className="text-[#E99A32]" />}>
                Exchange profile
              </CardTitle>
              {!profile?.exists && <div className="mb-3"><InlineNote tone="info">This is your first exchange profile. It stays hidden until you save and choose members visibility.</InlineNote></div>}
              <form onSubmit={(event) => void saveProfile(event)} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="display-name">Display name</FieldLabel>
                    <input id="display-name" value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} minLength={1} maxLength={40} required className={inputClass} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="headline">Headline</FieldLabel>
                    <input id="headline" value={form.headline} onChange={(event) => setForm({ ...form, headline: event.target.value })} maxLength={140} placeholder="CS student building ML projects" className={inputClass} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="availability">Availability</FieldLabel>
                    <input id="availability" value={form.availability} onChange={(event) => setForm({ ...form, availability: event.target.value })} maxLength={80} placeholder="Weekends, 2 hrs/week" className={inputClass} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="level">Level</FieldLabel>
                    <select id="level" value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value as ProfileForm["level"] })} className={selectClass}>
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="teach">I can teach</FieldLabel>
                    <input id="teach" value={form.teach} onChange={(event) => setForm({ ...form, teach: event.target.value })} placeholder="Python, statistics" className={inputClass} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="learn">I want to learn</FieldLabel>
                    <input id="learn" value={form.learn} onChange={(event) => setForm({ ...form, learn: event.target.value })} placeholder="React, system design" className={inputClass} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="tech">Tech I use</FieldLabel>
                    <input id="tech" value={form.tech} onChange={(event) => setForm({ ...form, tech: event.target.value })} placeholder="Python, pandas, Git" className={inputClass} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="interests">Interests</FieldLabel>
                    <input id="interests" value={form.interests} onChange={(event) => setForm({ ...form, interests: event.target.value })} placeholder="Open source, healthcare AI" className={inputClass} />
                  </div>
                  <div className="sm:col-span-2">
                    <FieldLabel htmlFor="roles">Preferred roles</FieldLabel>
                    <input id="roles" value={form.roles} onChange={(event) => setForm({ ...form, roles: event.target.value })} placeholder="ML intern, data analyst" className={inputClass} />
                  </div>
                </div>

                {suggestions && (suggestions.teach.length > 0 || suggestions.learn.length > 0) && (
                  <div className="rounded-xl border border-[#E99A32]/30 bg-[#FFF5E5] px-3.5 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] font-bold text-[#75451F]">From your Digital Twin</p>
                      <button
                        type="button"
                        onClick={() => setForm((current) => current ? {
                          ...current,
                          teach: suggestions.teach.join(", "),
                          learn: suggestions.learn.join(", "),
                          tech: suggestions.teach.join(", "),
                        } : current)}
                        className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[9px] font-semibold text-[#75451F] hover:bg-[#FFFCF6]"
                      >
                        <Sparkles size={9} /> Use suggestions
                      </button>
                    </div>
                    <p className="mt-1 text-[9px] leading-4 text-[#A1743A]">
                      Teach: {suggestions.teach.slice(0, 6).join(", ") || "none yet"}{suggestions.target_role ? ` · target: ${suggestions.target_role}` : ""}. Learn: {suggestions.learn.slice(0, 6).join(", ") || "none yet"}.
                    </p>
                  </div>
                )}

                <div className="rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] p-3.5">
                  <FieldLabel>Visibility</FieldLabel>
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    <label className={cn("flex cursor-pointer items-start gap-2 rounded-lg border p-2.5", form.visibility === "members" ? "border-[#E99A32] bg-[#FFF5E5]" : "border-[#EDE6DA] bg-white")}>
                      <input type="radio" name="visibility" checked={form.visibility === "members"} onChange={() => setForm({ ...form, visibility: "members" })} className="mt-0.5 accent-[#E99A32]" />
                      <span><span className="flex items-center gap-1 text-[10px] font-bold text-[#24211D]"><Eye size={10} /> Members only</span><span className="block text-[9px] leading-4 text-[#8A7F71]">Publish to matching. No contact details, ever.</span></span>
                    </label>
                    <label className={cn("flex cursor-pointer items-start gap-2 rounded-lg border p-2.5", form.visibility === "hidden" ? "border-[#E99A32] bg-[#FFF5E5]" : "border-[#EDE6DA] bg-white")}>
                      <input type="radio" name="visibility" checked={form.visibility === "hidden"} onChange={() => setForm({ ...form, visibility: "hidden" })} className="mt-0.5 accent-[#E99A32]" />
                      <span><span className="flex items-center gap-1 text-[10px] font-bold text-[#24211D]"><EyeOff size={10} /> Hidden</span><span className="block text-[9px] leading-4 text-[#8A7F71]">Private. Excluded from discovery and matching.</span></span>
                    </label>
                  </div>
                  <label className="mt-3 flex cursor-pointer items-start gap-2">
                    <input type="checkbox" checked={form.show_evidence} onChange={(event) => setForm({ ...form, show_evidence: event.target.checked })} className="mt-0.5 size-3.5 accent-[#E99A32]" />
                    <span>
                      <span className="block text-[10px] font-semibold text-[#24211D]">Show evidence tiers on skills I teach</span>
                      <span className="block text-[9px] leading-4 text-[#8A7F71]">Displays verified/demonstrated labels from your twin. Claimed skills are never shown as proof.</span>
                    </span>
                  </label>
                </div>

                {profileError && <InlineNote tone="error">{profileError}</InlineNote>}
                <div className="flex justify-end">
                  <button type="submit" disabled={profileBusy || !form.display_name.trim()} className="inline-flex items-center gap-1.5 rounded-xl bg-[#24211D] px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                    {profileBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {profileBusy ? "Saving…" : "Save profile"}
                  </button>
                </div>
              </form>
            </Card>

            <div className="space-y-5">
              <Card className="rounded-3xl p-5">
                <CardTitle detail="Members you have blocked. Unblocking restores eligibility for matches and requests." action={<Ban size={18} className="text-[#E99A32]" />}>Blocked members</CardTitle>
                {blocks.length ? (
                  <div className="space-y-2">
                    {blocks.map((item) => (
                      <div key={item.member_id} className="flex items-center justify-between gap-2 rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] px-3 py-2">
                        <span className="truncate text-[11px] font-semibold text-[#24211D]">{item.display_name}</span>
                        <button type="button" onClick={() => void unblock(item.member_id)} disabled={actionBusy === `unblock-${item.member_id}`} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#EDE6DA] bg-white px-2 py-1 text-[9px] font-semibold text-[#75451F] disabled:opacity-60">
                          {actionBusy === `unblock-${item.member_id}` ? <Loader2 size={9} className="animate-spin" /> : <Unlock size={9} />} Unblock
                        </button>
                      </div>
                    ))}
                  </div>
                ) : <p className="rounded-lg border border-dashed border-[#E3D8C5] px-3 py-3 text-[10px] leading-4 text-[#8A7F71]">No blocked members. Blocking someone removes both of you from each other&apos;s matches.</p>}
              </Card>

              <Card className="rounded-3xl p-5">
                <CardTitle detail="A short reminder of the safety model." action={<ShieldCheck size={18} className="text-[#E99A32]" />}>Privacy by design</CardTitle>
                <ul className="space-y-2 text-[10px] leading-4 text-[#6F675C]">
                  <li className="flex gap-1.5"><Check size={11} className="mt-0.5 shrink-0 text-[#2E7D32]" /> Exchange responses never include email or phone.</li>
                  <li className="flex gap-1.5"><Check size={11} className="mt-0.5 shrink-0 text-[#2E7D32]" /> Contact details and abusive text are rejected at save time (422).</li>
                  <li className="flex gap-1.5"><Check size={11} className="mt-0.5 shrink-0 text-[#2E7D32]" /> Peer connect and project join both require the other person&apos;s consent.</li>
                  <li className="flex gap-1.5"><Check size={11} className="mt-0.5 shrink-0 text-[#2E7D32]" /> Reports auto-hide a project after three reports pending review.</li>
                </ul>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ProjectCard({ project, onOpen }: { project: ProjectSummary; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group w-full rounded-xl border border-[#EDE6DA] bg-white p-3.5 text-left transition hover:-translate-y-0.5 hover:border-[#E3C894] hover:shadow-[0_10px_24px_-18px_rgba(117,69,31,0.5)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-[#24211D] group-hover:text-[#75451F]">{project.title}</p>
          <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-[#6F675C]">{project.description}</p>
        </div>
        <span className="shrink-0"><StatusChip status={project.status} /></span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {project.skills.slice(0, 5).map((skill) => <span key={skill} className="rounded-md border border-[#EDE6DA] bg-[#FFFCF6] px-1.5 py-0.5 text-[9px] text-[#6F675C]">{skill}</span>)}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[9px] text-[#8A7F71]">
        <span className="inline-flex items-center gap-1"><Users size={9} /> {project.member_count} member{project.member_count === 1 ? "" : "s"}{project.is_owner ? " · you own this" : project.is_member ? " · joined" : ""}</span>
        <span className="inline-flex items-center gap-1 font-semibold text-[#75451F]">{project.fit.score}% fit <ArrowUpRight size={9} /></span>
      </div>
      {project.fit.overlap.length > 0 && <p className="mt-1 truncate text-[9px] text-[#A1743A]">Your overlap: {project.fit.overlap.slice(0, 4).join(", ")}</p>}
    </button>
  );
}

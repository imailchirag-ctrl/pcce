"use client";

import { useState } from "react";
import { ArrowRight, Check, Loader2, Sparkles, UserRound } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import { Heading } from "@/components/workspace/shared";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace-provider";

export function ProfilePage() {
  const { user, updateProfile, refresh } = useWorkspace();
  const [name, setName] = useState(user?.name ?? "");
  const [headline, setHeadline] = useState(user?.headline ?? "");
  const [location, setLocation] = useState(user?.location ?? "");
  const [targetRole, setTargetRole] = useState(user?.target_role ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [company, setCompany] = useState(user?.company ?? "");
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunning(true);
    setNotice("");
    setErrorMsg("");
    try {
      await updateProfile({
        name: name || undefined,
        headline: headline || undefined,
        location: location || undefined,
        target_role: targetRole || undefined,
        bio: bio || undefined,
        company: company || undefined,
      });
      await refresh();
      setNotice("Profile updated successfully.");
      window.dispatchEvent(
        new CustomEvent("skillbridge-toast", { detail: "Profile changes saved!" }),
      );
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to update profile.");
    } finally {
      setRunning(false);
    }
  };

  if (!user) return null;

  const initials = (user.name || "SB")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <AppShell>
      <Heading
        eyebrow="Account profile"
        title="Edit your profile"
        detail="Manage your public professional information, role preferences, and contact details."
      />

      {notice && (
        <div role="status" className="mb-4 rounded-xl border border-[#2E7D32]/25 bg-[#2E7D32]/10 p-3 text-xs font-semibold text-[#2E7D32]">
          {notice}
        </div>
      )}

      {errorMsg && (
        <div role="alert" className="mb-4 rounded-xl border border-[#C62828]/25 bg-[#C62828]/10 p-3 text-xs font-semibold text-[#C62828]">
          {errorMsg}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Profile Edit Form (2/3 width) */}
        <Card className="p-5 sm:p-6 lg:col-span-2">
          <CardTitle detail="Keep your information current for matched roles and recruiter discovery">
            Profile details
          </CardTitle>

          <form onSubmit={handleSave} className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-[#24211D] mb-1.5">Full name</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#24211D] mb-1.5">Email address</label>
                <input
                  className="input bg-[#FFFCF6] cursor-not-allowed opacity-75"
                  value={user.email}
                  disabled
                  readOnly
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#24211D] mb-1.5">Professional headline</label>
              <input
                className="input"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="e.g. Senior Software Engineer | Distributed Systems"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-[#24211D] mb-1.5">Location</label>
                <input
                  className="input"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. San Francisco, CA or Remote"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#24211D] mb-1.5">Target career role</label>
                <input
                  className="input"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  placeholder="e.g. Full Stack Developer"
                />
              </div>
            </div>

            {user.role === "recruiter" && (
              <div>
                <label className="block text-xs font-semibold text-[#24211D] mb-1.5">Company name</label>
                <input
                  className="input"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Acme Corporation"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#24211D] mb-1.5">Bio / Summary</label>
              <textarea
                className="input h-28"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Brief summary of your career focus and technical background…"
              />
            </div>

            <Button type="submit" disabled={running}>
              {running ? (
                <><Loader2 size={14} className="animate-spin mr-1.5" /> Saving…</>
              ) : (
                <>Save changes <ArrowRight size={14} className="ml-1" /></>
              )}
            </Button>
          </form>
        </Card>

        {/* Account Info Box (1/3 width) */}
        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <CardTitle detail="Session & account details">Account info</CardTitle>

            <div className="flex items-center gap-3.5 mb-5 rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] p-3.5">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#FFF5E5] border border-[#EDE6DA] text-base font-bold text-[#75451F]">
                {user.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatar_url} alt="" className="size-full rounded-xl object-cover" />
                ) : (
                  initials
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate font-bold text-sm text-[#24211D]">{user.name}</p>
                <p className="truncate text-xs text-[#6F675C]">{user.email}</p>
                <div className="mt-1">
                  <Badge tone={user.role === "recruiter" ? "primary" : "warm"}>
                    {user.role === "recruiter" ? "Recruiter" : "Candidate"}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between border-b border-[#EDE6DA]/60 pb-2">
                <span className="text-[#6F675C]">Auth provider</span>
                <span className="font-semibold text-[#24211D] capitalize">{user.provider || "credentials"}</span>
              </div>
              <div className="flex justify-between border-b border-[#EDE6DA]/60 pb-2">
                <span className="text-[#6F675C]">Email status</span>
                <span className="font-semibold text-[#2E7D32]">
                  {user.email_verified ? "Verified" : "Unverified"}
                </span>
              </div>
              <div className="flex justify-between border-b border-[#EDE6DA]/60 pb-2">
                <span className="text-[#6F675C]">Onboarded</span>
                <span className="font-semibold text-[#24211D]">
                  {user.onboarded ? "Completed" : "Pending"}
                </span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-[#6F675C]">Member since</span>
                <span className="font-semibold text-[#24211D]">
                  {new Date(user.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

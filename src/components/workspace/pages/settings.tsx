"use client";

import { useState } from "react";
import { ArrowRight, Cpu, Eye, EyeOff, Loader2, LockKeyhole, LogOut, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import { Heading } from "@/components/workspace/shared";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace-provider";

export function SettingsPage() {
  const { user, changePassword, logout, modelStatus } = useWorkspace();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunning(true);
    setNotice("");
    setErrorMsg("");
    try {
      await changePassword({ current_password: currentPassword, new_password: newPassword });
      setNotice("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to update password. Please verify your current password.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <AppShell>
      <Heading
        eyebrow="Settings"
        title="Account & preferences"
        detail="Manage your password security, session status, and workspace configurations."
      />

      <div className="grid gap-5 lg:grid-cols-2 max-w-4xl">
        {/* Change Password Card */}
        <Card className="p-5 sm:p-6">
          <CardTitle detail="Update your authentication credentials">
            Security & password
          </CardTitle>

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

          <form onSubmit={handlePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#24211D] mb-1.5">Current password</label>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  aria-label={showCurrent ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6F675C] hover:text-[#24211D]"
                >
                  {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#24211D] mb-1.5">New password</label>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  aria-label={showNew ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6F675C] hover:text-[#24211D]"
                >
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={running}>
              {running ? (
                <><Loader2 size={14} className="animate-spin mr-1.5" /> Updating…</>
              ) : (
                <>Change password <ArrowRight size={14} className="ml-1" /></>
              )}
            </Button>
          </form>
        </Card>

        {/* Session and Sign Out Card */}
        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <CardTitle detail="Active login session information">
              Session management
            </CardTitle>

            <div className="space-y-3 text-xs mb-5">
              <div className="flex justify-between border-b border-[#EDE6DA] pb-2">
                <span className="text-[#6F675C]">Signed in as</span>
                <span className="font-semibold text-[#24211D]">{user?.email}</span>
              </div>
              <div className="flex justify-between border-b border-[#EDE6DA] pb-2">
                <span className="text-[#6F675C]">Authentication</span>
                <span className="font-semibold text-[#24211D] capitalize">{user?.provider || "Email/Password"}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-[#6F675C]">Session duration</span>
                <span className="font-semibold text-[#75451F]">30 days (rolling)</span>
              </div>
            </div>

            <div className="rounded-xl border border-[#EDE6DA] bg-[#FFF5E5]/60 p-4">
              <p className="font-bold text-xs text-[#75451F] mb-1">Sign out of all devices</p>
              <p className="text-xs text-[#6F675C] mb-3">
                Signing out will securely clear your session cookies and return you to the public landing page.
              </p>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void logout()}
              >
                <LogOut size={14} className="mr-1.5" /> Sign out
              </Button>
            </div>
          </Card>

          {/* Model Status Card if local AI */}
          {modelStatus && (
            <Card className="p-5 sm:p-6">
              <CardTitle detail="Local AI inference backend diagnostics">
                Local AI status
              </CardTitle>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#6F675C]">Inference device</span>
                  <span className="font-semibold text-[#24211D] uppercase">{modelStatus.hardware?.device || "CPU"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6F675C]">Embedding model</span>
                  <span className="font-semibold text-[#24211D]">{modelStatus.hardware?.embedding_model || "MiniLM"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6F675C]">Ollama LLM status</span>
                  <Badge tone={modelStatus.ollama?.reachable ? "green" : "gray"}>
                    {modelStatus.ollama?.reachable ? "Reachable" : "Offline"}
                  </Badge>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}

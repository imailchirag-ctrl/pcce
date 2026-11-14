"use client";

import { AppShell } from "@/components/layout/app-shell";
import { InterviewerLiveView } from "@/features/interviews/interviewer-live-view";

export default function Page() {
  return (
    <AppShell>
      <InterviewerLiveView />
    </AppShell>
  );
}

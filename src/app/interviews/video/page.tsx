"use client";

import { AppShell } from "@/components/layout/app-shell";
import { VideoInterview } from "@/features/interviews/video-interview";

export default function Page() {
  return (
    <AppShell>
      <VideoInterview jobRole="Frontend Engineer" />
    </AppShell>
  );
}

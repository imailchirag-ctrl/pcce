"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Application error", error);
  }, [error]);

  return (
    <main className="mx-auto grid min-h-screen max-w-xl content-center px-6 py-16">
      <p className="text-sm font-semibold text-primary">SkillBridge AI</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">This page ran into a problem.</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Try loading the page again. If the problem continues, check the application logs.</p>
      <div className="mt-7 flex gap-3">
        <button onClick={reset} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Try again</button>
        <Link href="/" className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold">Home</Link>
      </div>
    </main>
  );
}

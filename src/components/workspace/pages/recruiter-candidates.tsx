"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, MapPin, RotateCw, Search, Sparkles, UserRound, Users } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge, Card, CardTitle, EmptyState, SkillPill } from "@/components/ui/primitives";
import { Heading, Metric } from "@/components/workspace/shared";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace-provider";

export function RecruiterCandidatesPage() {
  const { candidates, searchCandidates, refresh } = useWorkspace();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const candidateList = candidates ?? [];

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearching(true);
    try {
      await searchCandidates(query);
    } finally {
      setSearching(false);
    }
  };

  return (
    <AppShell>
      <Heading
        eyebrow="Talent sourcing"
        title="Candidate discovery"
        detail="Search verified talent by target roles, technical skills, and career readiness scores."
        action={
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RotateCw size={13} className="mr-1.5" /> Refresh
          </Button>
        }
      />

      {/* 3 Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="Total candidates"
          value={String(candidateList.length)}
          caption="Verified talent profiles"
          icon={Users}
          tint="primary"
        />
        <Metric
          label="High readiness"
          value={String(candidateList.filter((c) => (c.readiness || 0) >= 70).length)}
          caption="Scored 70%+ role readiness"
          icon={CheckCircle2}
          tint="orange"
        />
        <Metric
          label="Open to work"
          value={String(candidateList.filter((c) => c.open_to_work).length)}
          caption="Actively exploring new roles"
          icon={Sparkles}
          tint="brown"
        />
      </div>

      {/* Search Input Bar */}
      <Card className="mt-5 p-4 sm:p-5">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6F675C]" />
            <input
              className="input pl-10"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by skill (e.g. Python, React), role title, or candidate name…"
            />
          </div>
          <Button type="submit" disabled={searching}>
            {searching ? <Loader2 size={14} className="animate-spin" /> : "Search"}
          </Button>
        </form>
      </Card>

      {/* Candidate Profile Cards */}
      <div className="mt-5 space-y-4">
        {candidateList.map((c) => (
          <div
            key={c.id}
            className="rounded-2xl border border-[#EDE6DA] bg-white p-5 shadow-sm transition hover:shadow-md"
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-3.5 min-w-0">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#FFF5E5] border border-[#EDE6DA] text-sm font-bold text-[#75451F]">
                  {c.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.avatar_url} alt="" className="size-full rounded-xl object-cover" />
                  ) : (
                    c.name?.slice(0, 2).toUpperCase() || "CA"
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-base text-[#24211D]">{c.name}</h3>
                    {c.target_role && (
                      <Badge tone="warm">{c.target_role}</Badge>
                    )}
                    {c.open_to_work && (
                      <Badge tone="green">Open to work</Badge>
                    )}
                  </div>

                  {c.headline && (
                    <p className="mt-1 text-xs text-[#75451F] font-medium">{c.headline}</p>
                  )}

                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#6F675C]">
                    {c.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={12} /> {c.location}
                      </span>
                    )}
                    {c.years_experience != null && (
                      <span>{c.years_experience} yrs experience</span>
                    )}
                    {c.readiness != null && (
                      <span className="font-bold text-[#2E7D32]">
                        {c.readiness}% readiness
                      </span>
                    )}
                  </div>

                  {c.summary && (
                    <p className="mt-2.5 text-xs text-[#6F675C] line-clamp-2 leading-relaxed">
                      {c.summary}
                    </p>
                  )}

                  {c.skills && c.skills.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5 pt-2 border-t border-[#EDE6DA]/60">
                      {c.skills.slice(0, 10).map((skill) => (
                        <SkillPill key={skill} tone="default">
                          {skill}
                        </SkillPill>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="shrink-0 flex sm:flex-col gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => alert(`Contacting ${c.name} at ${c.email}`)}>
                  Contact candidate
                </Button>
              </div>
            </div>
          </div>
        ))}

        {candidateList.length === 0 && (
          <EmptyState
            title="No candidates found"
            detail={query ? `No candidates match the query "${query}".` : "No public candidates available yet."}
            action={
              query ? (
                <Button size="sm" variant="outline" onClick={() => { setQuery(""); void searchCandidates(""); }}>
                  Clear search
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    </AppShell>
  );
}

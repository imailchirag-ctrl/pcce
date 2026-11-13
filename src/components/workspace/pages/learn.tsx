"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  GraduationCap,
  Loader2,
  Sparkles,
  Target,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge, Card, CardTitle, EmptyState, Progress, SkillPill } from "@/components/ui/primitives";
import { Heading, Metric } from "@/components/workspace/shared";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace-provider";

export function LearnPage() {
  const { roadmap, dashboard, generateRoadmap, toggleRoadmapItem, refresh } = useWorkspace();
  const [targetRole, setTargetRole] = useState(roadmap?.target_role || dashboard?.analysis?.target_role || "Software Engineer");
  const [generating, setGenerating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const items = roadmap?.items ?? [];
  const completedCount = items.filter((i) => i.completed).length;
  const totalCount = items.length;
  const progressPercent = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;
  const totalHours = roadmap?.total_hours || items.reduce((acc, i) => acc + (i.estimated_hours || 0), 0);
  const courses = roadmap?.courses ?? [];

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setGenerating(true);
    setErrorMsg("");
    try {
      await generateRoadmap(targetRole);
      await refresh();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to generate learning roadmap.");
    } finally {
      setGenerating(false);
    }
  };

  const handleToggle = async (itemId: string, currentStatus: boolean) => {
    setTogglingId(itemId);
    try {
      await toggleRoadmapItem(itemId, !currentStatus);
    } catch (err: any) {
      console.error("Failed to update milestone status", err);
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <AppShell>
      <Heading
        eyebrow="Learning hub"
        title={roadmap?.target_role ? `Roadmap: ${roadmap.target_role}` : "Your learning roadmap"}
        detail="A structured, milestone-based curriculum generated to close your specific skill gaps."
        action={
          items.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleGenerate()}
              disabled={generating}
            >
              {generating ? <Loader2 size={13} className="animate-spin mr-1" /> : <Sparkles size={13} className="mr-1" />}
              Regenerate
            </Button>
          ) : undefined
        }
      />

      {errorMsg && (
        <div role="alert" className="mb-4 rounded-xl border border-[#C62828]/25 bg-[#C62828]/10 p-3.5 text-xs font-medium text-[#C62828]">
          {errorMsg}
        </div>
      )}

      {items.length > 0 ? (
        <div className="space-y-6">
          {/* Progress Overview Metrics */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric
              label="Overall progress"
              value={`${progressPercent}%`}
              caption={`${completedCount} of ${totalCount} modules completed`}
              icon={CheckCircle2}
              tint="primary"
            />
            <Metric
              label="Estimated study"
              value={`${totalHours} hrs`}
              caption="Self-paced focused learning"
              icon={Clock}
              tint="orange"
            />
            <Metric
              label="Target career role"
              value={roadmap?.target_role || "Engineer"}
              caption="Curriculum alignment"
              icon={Target}
              tint="brown"
            />
          </div>

          {/* Weekly Focus if available */}
          {roadmap?.weekly_focus && roadmap.weekly_focus.length > 0 && (
            <Card className="p-4 sm:p-5">
              <p className="text-xs font-bold text-[#75451F] uppercase tracking-wider mb-2">
                Suggested weekly milestones
              </p>
              <div className="flex flex-wrap gap-2">
                {roadmap.weekly_focus.map((focus, i) => (
                  <Badge key={i} tone="warm">
                    Week {i + 1}: {focus}
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          {/* Roadmap Milestones Checklist */}
          <Card className="p-5 sm:p-6">
            <CardTitle detail="Click any item to mark it completed as you progress">
              Learning modules & practice tasks
            </CardTitle>

            <div className="mt-4 space-y-3">
              {items.map((item, index) => {
                const isToggling = togglingId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`rounded-xl border p-4 transition-all ${
                      item.completed
                        ? "border-[#EDE6DA] bg-[#FFF5E5]/40 opacity-80"
                        : "border-[#EDE6DA] bg-white shadow-sm hover:border-[#F4B942]"
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <button
                        type="button"
                        onClick={() => void handleToggle(item.id, item.completed)}
                        disabled={isToggling}
                        aria-label={item.completed ? "Mark incomplete" : "Mark complete"}
                        className="mt-0.5 text-[#75451F] hover:text-[#E99A32] transition-colors focus:outline-none"
                      >
                        {isToggling ? (
                          <Loader2 size={18} className="animate-spin text-[#E99A32]" />
                        ) : item.completed ? (
                          <CheckCircle2 size={20} className="text-[#2E7D32]" />
                        ) : (
                          <Circle size={20} className="text-[#EDE6DA] hover:text-[#F4B942]" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-[#75451F]">Module {index + 1}</span>
                          <span className="font-bold text-sm text-[#24211D]">{item.title}</span>
                          <Badge tone="warm">{item.skill}</Badge>
                          {item.difficulty && (
                            <Badge tone="gray">{item.difficulty}</Badge>
                          )}
                          {item.estimated_hours && (
                            <span className="text-xs text-[#6F675C]">{item.estimated_hours} hrs</span>
                          )}
                        </div>

                        {item.objective && (
                          <p className="text-xs text-[#24211D] mt-1">{item.objective}</p>
                        )}
                        {item.why_it_matters && (
                          <p className="text-[11px] text-[#6F675C] mt-1">
                            <span className="font-semibold text-[#75451F]">Why it matters: </span>
                            {item.why_it_matters}
                          </p>
                        )}
                        {item.practice_task && (
                          <div className="mt-2 rounded-lg bg-[#FFFCF6] border border-[#EDE6DA] p-2.5 text-xs">
                            <span className="font-bold text-[#75451F]">Hands-on practice: </span>
                            <span className="text-[#24211D]">{item.practice_task}</span>
                          </div>
                        )}

                        {item.resource && (
                          <div className="mt-2 flex items-center gap-2 text-xs">
                            <BookOpen size={13} className="text-[#75451F]" />
                            <span className="text-[#6F675C]">{item.resource} ({item.provider || "Resource"})</span>
                            {item.resource_url && (
                              <a
                                href={item.resource_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-semibold text-[#75451F] hover:text-[#E99A32]"
                              >
                                Open resource <ExternalLink size={11} />
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Recommended Courses */}
          {courses.length > 0 && (
            <Card className="p-5 sm:p-6">
              <CardTitle detail="Curated courses matching your missing capabilities">
                Recommended online courses
              </CardTitle>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {courses.map((course) => (
                  <div key={course.id} className="rounded-xl border border-[#EDE6DA] bg-[#FFFCF6] p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <Badge tone="warm">{course.provider}</Badge>
                        <span className="text-xs font-semibold text-[#75451F]">{course.price || "Free"}</span>
                      </div>
                      <h3 className="mt-2 text-sm font-bold text-[#24211D]">{course.title}</h3>
                      <p className="mt-1 text-xs text-[#6F675C]">{course.reason}</p>
                    </div>
                    <div className="mt-3 flex items-center justify-between pt-2 border-t border-[#EDE6DA]">
                      <span className="text-xs text-[#6F675C]">{course.duration_hours ? `${course.duration_hours} hrs` : "Self-paced"}</span>
                      {course.url ? (
                        <a
                          href={course.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-bold text-[#75451F] hover:text-[#E99A32]"
                        >
                          View course <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span className="text-xs font-semibold text-[#75451F]">Explore</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      ) : (
        /* Empty State & Generation Form */
        <Card className="p-5 sm:p-6 max-w-xl">
          <CardTitle detail="Create a targeted path to bridge your verified skill gaps">
            Generate learning roadmap
          </CardTitle>
          <form onSubmit={handleGenerate} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#24211D] mb-1.5">Target career role</label>
              <input
                className="input"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="e.g. Senior Backend Engineer"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={generating}>
              {generating ? (
                <><Loader2 size={16} className="animate-spin mr-2" /> Generating personalized curriculum…</>
              ) : (
                <><Sparkles size={16} className="mr-2" /> Generate roadmap</>
              )}
            </Button>
          </form>
          <p className="mt-3 text-xs leading-relaxed text-[#6F675C]">
            We analyze missing skills from your latest resume analysis to construct a progressive sequence of study topics, hands-on tasks, and course recommendations.
          </p>
        </Card>
      )}
    </AppShell>
  );
}

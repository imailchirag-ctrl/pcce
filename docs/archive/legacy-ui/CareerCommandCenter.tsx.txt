import React, { useState, useEffect, useCallback } from "react";
import { ApiError, commandCenterApi } from "@/lib/api";
import { TIER_STYLE } from "@/features/intelligence/api";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableCell, TableBody } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";

interface SkillRow {
  skill: string;
  display: string;
  status: keyof typeof TIER_STYLE;
  proficiency: number;
  evidence: Array<{ excerpt: string }>;
}

interface MarketSkill {
  skill: string;
  display: string;
  postings: number;
  share: number;
  user_has: boolean;
  essential: boolean;
}

interface GapInfo {
  skill: string;
  display: string;
  state: "missing" | "adjacent";
  proficiency: number;
  essential: boolean;
  closest_skill?: string;
}

interface SprintTask {
  id: string;
  title: string;
  explanation: string;
  skill: string;
  why: string;
  duration: string;
  priority: string;
  module: string;
  action_url: string | null;
}

interface SprintPlan {
  role: string;
  generated_at: string;
  tasks: SprintTask[];
  total_duration: string;
}

interface NextAction {
  action: string;
  title: string;
  explanation: string;
  skill: string;
  module: string;
  link: string | null;
  priority: string;
}

export function CareerCommandCenter() {
  const [user, setUser] = useState<any>(null);
  const [targetRole, setTargetRole] = useState<string>("");
  const [showStrategy, setShowStrategy] = useState<boolean>(false);
  const [strategy, setStrategy] = useState<any>(null);
  const [gaps, setGaps] = useState<GapInfo[]>([]);
  const [sprint, setSprint] = useState<SprintPlan | null>(null);
  const [nextAction, setNextAction] = useState<NextAction | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const { toast } = useToast();
  const router = useRouter();

  // Fetch user data on mount
  useEffect(() => {
    async function fetchUser() {
      try {
        const storedUser = localStorage.getItem("skillbridge_user");
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        }
      } catch (error) {
        console.error("Failed to fetch user:", error);
      }
    }
    fetchUser();
  }, []);

  const handleGenerateStrategy = async () => {
    if (!targetRole) {
      toast({
        title: "Error",
        description: "Please select a target career role.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await commandCenterApi.strategy({
        target_role: targetRole,
        include_market: true,
      });
      setStrategy(response);
      setShowStrategy(true);
      
      if (response.critical_gaps?.length) {
        setGaps(response.critical_gaps);
      } else if (response.gaps?.length) {
        setGaps(response.gaps);
      }
    } catch (error: any) {
      console.error("Strategy error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate strategy",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateSprint = async () => {
    if (!targetRole) {
      return;
    }

    setLoading(true);
    try {
      const response = await commandCenterApi.sprint();
      setSprint(response);
    } catch (error: any) {
      console.error("Sprint error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate sprint",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleNextAction = async () => {
    setLoading(true);
    try {
      const response = await commandCenterApi.nextAction();
      setNextAction(response);
    } catch (error: any) {
      console.error("Next action error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to get next action",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    setLoading(true);
    try {
      const tasks = sprint?.tasks?.map((t) =>
        t.id === taskId ? { ...t, status: "DONE" } : t
      ) || [];
      
      setSprint((prev) => prev ? { ...prev, tasks } : null);
      
      toast({
        title: "Task Complete",
        description: "Great job! Your progress has been recorded.",
      });
    } catch (error: any) {
      console.error("Complete task error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to complete task",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen p-6 bg-background">
        <div className="max-w-md mx-auto">
          <h2 className="text-xl font-bold mb-4">SkillBridge AI</h2>
          <p className="text-muted-foreground">
            Sign in to access your Career Command Center
          </p>
        </div>
      </div>
    );
  }

  // Set target role from user data if available
  useEffect(() => {
    if (user.target_role && !targetRole) {
      setTargetRole(user.target_role);
    }
  }, [user.target_role]);

  return (
    <div className="min-h-screen bg-background p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          AI Career Command Center
        </h1>
        <p className="text-muted-foreground">
          Your Personal AI Career Strategist
        </p>
      </header>

      <section className="mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Target Career Selection</CardTitle>
          </CardHeader>
          <CardContent>
            <Select placeholder="Select target role" onValueChange={setTargetRole}>
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key="software_engineer" value="software_engineer">
                  Software Engineer
                </SelectItem>
                <SelectItem key="machine_learning_engineer" value="machine_learning_engineer">
                  Machine Learning Engineer
                </SelectItem>
                <SelectItem key="data_scientist" value="data_scientist">
                  Data Scientist
                </SelectItem>
                <SelectItem key="frontend_engineer" value="frontend_engineer">
                  Frontend Engineer
                </SelectItem>
                <SelectItem key="full_stack_developer" value="full_stack_developer">
                  Full Stack Developer
                </SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </section>

      {showStrategy && strategy && (
        <section className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle>My Career Strategy</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="font-medium">Role:</p>
                  <p className="mt-1">{strategy.role_title || strategy.role}</p>
                  <p className="mt-1">Alignment: <span className="font-semibold">{strategy.alignment}%</span></p>
                </div>
                <div>
                  <p className="font-medium">Demonstrated Skills:</p>
                  <p className="mt-1">{strategy.demonstrated_skills?.length || 0}</p>
                </div>
              </div>
              
              <div className="mt-4">
                <p className="font-medium">Critical Skill Gaps:</p>
                {strategy.critical_gaps?.length > 0 ? (
                  strategy.critical_gaps.map((gap: any) => (
                    <div key={gap.skill} className="mt-2 p-2 bg-red-50 rounded">
                      <p>{gap.display}: {gap.state}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">No critical gaps found</p>
                )}
              </div>
              
              <div className="mt-4">
                <p className="font-medium">Market Demand:</p>
                {strategy.market_demand?.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-sm">
                    {strategy.market_demand?.map((ms: MarketSkill) => (
                      <li key={ms.skill}>
                        <span className="font-medium">{ms.display}</span>{" "}
                        ({ms.postings} postings{" "}
                        {ms.user_has ? "— you have this skill" : ""})
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">No market data available</p>
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {showStrategy && !strategy === null ? (
        <section className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle>7-Day Career Sprint</CardTitle>
            </CardHeader>
            {sprint ? (
              <CardContent>
                <div className="space-y-4">
                  <p className="font-medium">Total Duration: {sprint.total_duration}</p>
                  
                  {sprint.tasks.map((task: SprintTask) => (
                    <div key={task.id} className="p-3 bg-card border rounded">
                      <h3 className="font-semibold">{task.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {task.explanation}
                      </p>
                      <p className="text-xs mt-1">
                        Skill: {task.skill} | Module: {task.module}
                      </p>
                      {task.action_url && (
                        <a
                          href={task.action_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-block text-primary hover:underline"
                        >
                          Start Task
                        </a>
                      )}
                      <p className="text-xs mt-1">
                        Priority: {"high".priority === task.priority ? "🔴 High" : "orange".priority === task.priority ? "🟡 Medium" : "🟢 Low"}
                      </p>
                    </div>
                  ))}
                  
                  {!sprint.tasks.length && (
                    <p className="text-muted-foreground">No tasks generated yet</p>
                  )}
                </div>
              </CardContent>
            ) : (
              <CardContent>
                <p>Generating your personalized 7-day sprint...</p>
              </CardContent>
            )}
          </Card>
        </section>
      )}

      <section className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>WHAT SHOULD I DO NEXT?</CardTitle>
          </CardHeader>
          <CardContent>
            {nextAction ? (
              <div className="space-y-4">
                <p className="font-semibold text-lg">{nextAction.title}</p>
                <p className="text-muted-foreground">{nextAction.explanation}</p>
                <p className="text-sm mt-2">
                  Skill: <strong>{nextAction.skill || "None specified"}</strong>
                </p>
                <p className="text-xs mt-1">
                  Priority: {"high".priority === nextAction.priority ? "🔴 High" : "orange".priority === nextAction.priority ? "🟡 Medium" : "🟢 Low"}
                </p>
                {nextAction.link && (
                  <a
                    href={nextAction.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block bg-primary text-white px-3 py-1 rounded hover:opacity-90"
                  >
                    {nextAction.action.replace("_", " ")}
                  </a>
                )}
                {!nextAction.link && (
                  <p className="text-muted-foreground mt-2">
                    No direct link available - check the {nextAction.module} module
                  </p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">Loading next action...</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="mt-8 pt-8 border-t">
        <div className="flex gap-3">
          <Button
            onClick={handleGenerateStrategy}
            disabled={loading || !targetRole}
            variant="primary"
          >
            {loading ? "Generating..." : "Generate My Career Strategy"}
          </Button>
          {targetRole && (
            <Button onClick={handleGenerateSprint} variant="secondary">
              Generate 7-Day Sprint
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

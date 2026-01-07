import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PromptDistReport, FPFSubscores } from "@/types";
import { MetricsPanel } from "./MetricsPanel";
import { DistributionChart } from "./DistributionChart";
import { FPFRadar } from "./FPFRadar";
import { RunsTable } from "./RunsTable";
import { IconPlayerPlay, IconDatabase, IconLoader2, IconRefresh, IconAlertTriangle, IconX } from "@tabler/icons-react";

// Demo data for visualization without backend
const DEMO_REPORT: PromptDistReport = {
  promptId: "champion-v3",
  perEpic: [
    {
      epicId: "E-101",
      runs: [
        { seed: 42, score: 0.82, pass: true, storyPack: { epicId: "E-101", epicTitle: "SSO + MFA", userStories: [{} as any, {} as any, {} as any, {} as any, {} as any], assumptions: [], risks: [], followUps: [] }, rawText: "" },
        { seed: 43, score: 0.78, pass: true, storyPack: { epicId: "E-101", epicTitle: "SSO + MFA", userStories: [{} as any, {} as any, {} as any, {} as any], assumptions: [], risks: [], followUps: [] }, rawText: "" },
        { seed: 44, score: 0.65, pass: true, storyPack: { epicId: "E-101", epicTitle: "SSO + MFA", userStories: [{} as any, {} as any, {} as any, {} as any, {} as any, {} as any], assumptions: [], risks: [], followUps: [] }, rawText: "" },
        { seed: 45, score: 0.71, pass: true, storyPack: { epicId: "E-101", epicTitle: "SSO + MFA", userStories: [{} as any, {} as any, {} as any, {} as any, {} as any], assumptions: [], risks: [], followUps: [] }, rawText: "" },
        { seed: 46, score: 0.45, pass: false, storyPack: null, rawText: "", error: "Schema validation failed" },
      ],
      meanScore: 0.682,
      p10Score: 0.45,
      stdScore: 0.138,
      passRate: 0.8,
      discoverabilityK: 0.97,
    },
    {
      epicId: "E-202",
      runs: [
        { seed: 42, score: 0.88, pass: true, storyPack: { epicId: "E-202", epicTitle: "Search", userStories: [{} as any, {} as any, {} as any, {} as any, {} as any, {} as any], assumptions: [], risks: [], followUps: [] }, rawText: "" },
        { seed: 43, score: 0.85, pass: true, storyPack: { epicId: "E-202", epicTitle: "Search", userStories: [{} as any, {} as any, {} as any, {} as any, {} as any], assumptions: [], risks: [], followUps: [] }, rawText: "" },
        { seed: 44, score: 0.79, pass: true, storyPack: { epicId: "E-202", epicTitle: "Search", userStories: [{} as any, {} as any, {} as any, {} as any], assumptions: [], risks: [], followUps: [] }, rawText: "" },
        { seed: 45, score: 0.82, pass: true, storyPack: { epicId: "E-202", epicTitle: "Search", userStories: [{} as any, {} as any, {} as any, {} as any, {} as any], assumptions: [], risks: [], followUps: [] }, rawText: "" },
        { seed: 46, score: 0.76, pass: true, storyPack: { epicId: "E-202", epicTitle: "Search", userStories: [{} as any, {} as any, {} as any, {} as any, {} as any, {} as any], assumptions: [], risks: [], followUps: [] }, rawText: "" },
      ],
      meanScore: 0.82,
      p10Score: 0.76,
      stdScore: 0.045,
      passRate: 1.0,
      discoverabilityK: 1.0,
    },
    {
      epicId: "E-303",
      runs: [
        { seed: 42, score: 0.72, pass: true, storyPack: { epicId: "E-303", epicTitle: "Invoice Export", userStories: [{} as any, {} as any, {} as any, {} as any], assumptions: [], risks: [], followUps: [] }, rawText: "" },
        { seed: 43, score: 0.68, pass: true, storyPack: { epicId: "E-303", epicTitle: "Invoice Export", userStories: [{} as any, {} as any, {} as any, {} as any, {} as any], assumptions: [], risks: [], followUps: [] }, rawText: "" },
        { seed: 44, score: 0.55, pass: true, storyPack: { epicId: "E-303", epicTitle: "Invoice Export", userStories: [{} as any, {} as any, {} as any], assumptions: [], risks: [], followUps: [] }, rawText: "" },
        { seed: 45, score: 0.62, pass: true, storyPack: { epicId: "E-303", epicTitle: "Invoice Export", userStories: [{} as any, {} as any, {} as any, {} as any], assumptions: [], risks: [], followUps: [] }, rawText: "" },
        { seed: 46, score: 0.38, pass: false, storyPack: null, rawText: "", error: "Incomplete response" },
      ],
      meanScore: 0.59,
      p10Score: 0.38,
      stdScore: 0.125,
      passRate: 0.8,
      discoverabilityK: 0.97,
    },
  ],
  agg: {
    meanOfMeans: 0.697,
    meanPassRate: 0.867,
    meanP10: 0.53,
    meanStd: 0.103,
    objective: 0.72,
  },
};

const DEMO_FPF_SUBSCORES: FPFSubscores = {
  correctness: 0.78,
  completeness: 0.72,
  processQuality: 0.65,
  safety: 0.95,
};

type DataMode = "empty" | "demo" | "live";
type EvalStatus = "idle" | "starting" | "running" | "completed" | "failed";

// Parse error messages to categorize them
function categorizeEvalError(error: string): { title: string; suggestion: string; icon: "warning" | "error" } {
  const lowerError = error.toLowerCase();

  if (lowerError.includes("timeout") || lowerError.includes("timed out")) {
    return {
      title: "Evaluation Timeout",
      suggestion: "The LLM took too long. Try reducing replicates or checking your LLM server.",
      icon: "warning",
    };
  }

  if (lowerError.includes("econnrefused") || lowerError.includes("connection refused") || lowerError.includes("fetch failed")) {
    return {
      title: "Connection Failed",
      suggestion: "Cannot reach the LLM server. Make sure LM Studio or your LLM provider is running on the configured port.",
      icon: "error",
    };
  }

  if (lowerError.includes("rate limit") || lowerError.includes("429")) {
    return {
      title: "Rate Limited",
      suggestion: "Too many requests. Wait a moment before retrying the evaluation.",
      icon: "warning",
    };
  }

  if (lowerError.includes("no epics")) {
    return {
      title: "No Evaluation Data",
      suggestion: "No epics found in data/epics.eval.json. Add evaluation epics first.",
      icon: "error",
    };
  }

  return {
    title: "Evaluation Failed",
    suggestion: "An unexpected error occurred. Check the server logs for details.",
    icon: "error",
  };
}

export function EvalDashboard() {
  const [dataMode, setDataMode] = useState<DataMode>("empty");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<PromptDistReport | null>(null);
  const [fpfSubscores, setFpfSubscores] = useState<FPFSubscores | null>(null);
  const [gateDecision, setGateDecision] = useState<"pass" | "degrade" | "block" | "abstain" | undefined>();

  // Live evaluation state
  const [evalStatus, setEvalStatus] = useState<EvalStatus>("idle");
  const [evalProgress, setEvalProgress] = useState({ completed: 0, total: 0 });
  const [evalError, setEvalError] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const handleLoadDemo = () => {
    setLoading(true);
    // Simulate loading delay
    setTimeout(() => {
      setReport(DEMO_REPORT);
      setFpfSubscores(DEMO_FPF_SUBSCORES);
      setGateDecision("pass");
      setDataMode("demo");
      setLoading(false);
    }, 800);
  };

  const handleClear = () => {
    setReport(null);
    setFpfSubscores(null);
    setGateDecision(undefined);
    setEvalStatus("idle");
    setEvalProgress({ completed: 0, total: 0 });
    setEvalError(null);
    setDataMode("empty");
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const pollTaskStatus = async (taskId: string) => {
    try {
      const res = await fetch(`/evaluate/${taskId}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();

      if (data.error) {
        setEvalStatus("failed");
        setEvalError(data.error);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        return;
      }

      setEvalProgress(data.progress || { completed: 0, total: 0 });

      if (data.status === "completed") {
        setEvalStatus("completed");
        setReport(data.report);
        setDataMode("live");
        setLoading(false);
        // Save report to localStorage for Evolution tab to use
        if (data.report) {
          localStorage.setItem("lastEvalReport", JSON.stringify(data.report));
        }
        // Calculate FPF subscores from report (average across all runs)
        // This is a simplified version - in production you'd compute from actual FPF scores
        if (data.report?.agg) {
          setFpfSubscores({
            correctness: data.report.agg.meanOfMeans,
            completeness: data.report.agg.meanPassRate,
            processQuality: Math.max(0, 1 - data.report.agg.meanStd), // Clamp to [0,1]
            safety: 0.95, // Placeholder
          });
          setGateDecision(data.report.agg.meanPassRate >= 0.8 ? "pass" : "degrade");
        }
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      } else if (data.status === "failed") {
        setEvalStatus("failed");
        setEvalError(data.error || "Evaluation failed");
        setLoading(false);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      } else {
        setEvalStatus("running");
      }
    } catch (err) {
      setEvalStatus("failed");
      setEvalError(err instanceof Error ? err.message : "Polling failed");
      setLoading(false);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
  };

  const handleRunEval = async () => {
    setLoading(true);
    setEvalStatus("starting");
    setEvalError(null);
    setEvalProgress({ completed: 0, total: 0 });

    try {
      const res = await fetch("/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replicates: 3 }), // 3 replicates for faster demo
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();

      if (data.error) {
        setEvalStatus("failed");
        setEvalError(data.error);
        setLoading(false);
        return;
      }

      const taskId = data.taskId;
      if (!taskId || typeof taskId !== "string") {
        setEvalStatus("failed");
        setEvalError("Server returned invalid task ID");
        setLoading(false);
        return;
      }

      setEvalStatus("running");

      // Start polling
      pollIntervalRef.current = setInterval(() => {
        pollTaskStatus(taskId);
      }, 2000); // Poll every 2 seconds

      // Initial poll
      pollTaskStatus(taskId);

    } catch (err) {
      setEvalStatus("failed");
      setEvalError(err instanceof Error ? err.message : "Failed to start evaluation");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Educational Header */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Flow B: Distributional Evaluation</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Instead of evaluating a prompt by a single run, we run each epic{" "}
              <span className="font-medium text-foreground">R times</span> with
              different seeds. This reveals reliability metrics: pass rate, mean
              score, p10 (worst-case), and standard deviation. A prompt that's
              "lucky once" will show high variance.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Select value={dataMode} onValueChange={(v) => {
              if (v === "demo") handleLoadDemo();
              else if (v === "empty") handleClear();
            }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="empty">No Data</SelectItem>
                <SelectItem value="demo">Demo Data</SelectItem>
                <SelectItem value="live" disabled>Live Data</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Demo Mode Banner */}
      {dataMode === "demo" && (
        <div className="flex items-center gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 p-3">
          <IconDatabase className="h-4 w-4 text-blue-600" />
          <p className="text-sm text-blue-600">
            <span className="font-medium">Demo Mode:</span> Showing sample evaluation data.
            This simulates 5 replicates across 3 epics.
          </p>
        </div>
      )}

      {/* Live Mode Banner */}
      {dataMode === "live" && (
        <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 p-3">
          <IconPlayerPlay className="h-4 w-4 text-green-600" />
          <p className="text-sm text-green-600">
            <span className="font-medium">Live Data:</span> Results from actual LLM evaluation.
          </p>
        </div>
      )}

      {/* Evaluation Progress */}
      {(evalStatus === "starting" || evalStatus === "running") && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <IconLoader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm font-medium">
              {evalStatus === "starting" ? "Starting evaluation..." : "Running evaluation..."}
            </span>
          </div>
          {evalProgress.total > 0 && (
            <div className="space-y-2">
              <Progress value={(evalProgress.completed / evalProgress.total) * 100} />
              <p className="text-xs text-muted-foreground">
                {evalProgress.completed} / {evalProgress.total} runs completed
              </p>
            </div>
          )}
        </div>
      )}

      {/* Error Banner */}
      {evalError && (() => {
        const errorInfo = categorizeEvalError(evalError);
        return (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4">
            <div className="flex items-start gap-3">
              <div className="text-destructive">
                {errorInfo.icon === "warning" ? (
                  <IconAlertTriangle className="h-5 w-5" />
                ) : (
                  <IconX className="h-5 w-5" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <p className="font-medium text-destructive">{errorInfo.title}</p>
                <p className="text-sm text-muted-foreground">{errorInfo.suggestion}</p>
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Show details
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded bg-muted/50 p-2 font-mono text-destructive/80">
                    {evalError}
                  </pre>
                </details>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRunEval}
                  className="mt-2"
                >
                  <IconRefresh className="mr-2 h-3 w-3" />
                  Retry Evaluation
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Metrics Panel */}
      <MetricsPanel report={report} loading={loading} />

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <DistributionChart report={report} loading={loading} />
        <FPFRadar
          subscores={fpfSubscores}
          gateDecision={gateDecision}
          loading={loading}
        />
      </div>

      {/* Runs Table */}
      <RunsTable report={report} loading={loading} />

      {/* Action Buttons */}
      <div className="flex items-center justify-center gap-4">
        {dataMode === "empty" && evalStatus === "idle" && (
          <Button onClick={handleLoadDemo} size="lg">
            <IconDatabase className="mr-2 h-4 w-4" />
            Load Demo Data
          </Button>
        )}
        <Button
          onClick={handleRunEval}
          size="lg"
          variant={dataMode === "empty" ? "outline" : "default"}
          disabled={evalStatus === "starting" || evalStatus === "running"}
        >
          {evalStatus === "starting" || evalStatus === "running" ? (
            <>
              <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <IconPlayerPlay className="mr-2 h-4 w-4" />
              Run Live Evaluation
            </>
          )}
        </Button>
        {(dataMode !== "empty" || evalError) && (
          <Button onClick={handleClear} size="lg" variant="outline">
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

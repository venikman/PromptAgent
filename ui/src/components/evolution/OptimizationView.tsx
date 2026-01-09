import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  IconRocket,
  IconPlayerPlay,
  IconLoader2,
  IconCheck,
  IconX,
  IconArrowUp,
  IconArrowDown,
  IconClock,
  IconChartLine,
  IconFlame,
  IconTarget,
  IconCircleDot,
  IconInfoCircle,
} from "@tabler/icons-react";

// ─────────────────────────────────────────────────
// Types (mirrors backend types)
// ─────────────────────────────────────────────────

type OptimizationStep =
  | "initializing"
  | "evaluating_champion"
  | "mining_pairs"
  | "generating_patches"
  | "tournament"
  | "promotion"
  | "meta_evolution"
  | "checkpointing"
  | "completed"
  | "failed";

const STEP_LABELS: Record<OptimizationStep, string> = {
  initializing: "Initializing",
  evaluating_champion: "Evaluating Champion",
  mining_pairs: "Mining Contrastive Pairs",
  generating_patches: "Generating Patches",
  tournament: "Running Tournament",
  promotion: "Promotion Decision",
  meta_evolution: "Meta-Evolution",
  checkpointing: "Saving Checkpoint",
  completed: "Completed",
  failed: "Failed",
};

type IterationSummary = {
  iteration: number;
  championObjective: number;
  bestCandidateObjective: number;
  promoted: boolean;
  pairsFound: number;
  candidatesGenerated: number;
  duration: number;
  error?: string;
};

type OptimizationProgress = {
  iteration: number;
  maxIterations: number;
  step: OptimizationStep;
  stepLabel: string;
  evalProgress?: { completed: number; total: number };
  tournamentProgress?: {
    candidateIdx: number;
    totalCandidates: number;
    runsCompleted: number;
    totalRuns: number;
  };
  championObjective: number;
  bestCandidateObjective?: number;
  promoted?: boolean;
  pairsFound?: number;
  candidatesGenerated?: number;
  illumination?: { coverage: number; qd_score: number };
  paretoFrontSize?: number;
  bestMutationType?: string;
  hypermutationApplied?: boolean;
  iterationElapsed?: number;
  totalElapsed: number;
  history: IterationSummary[];
};

type OptimizationResult = {
  finalObjective: number;
  totalIterations: number;
  improvementVsBaseline: number;
  championPatch: string;
  history: IterationSummary[];
};

type OptimizationTaskResponse = {
  taskId: string;
  status: "pending" | "running" | "completed" | "failed";
  config: {
    maxIterations: number;
    replicates: number;
    patchCandidates: number;
    metaEvolutionEnabled: boolean;
  };
  progress: OptimizationProgress;
  result?: OptimizationResult;
  error?: string;
  startedAt: string;
  completedAt?: string;
};

type OptimizationViewProps = {
  onOptimizationComplete?: (result: OptimizationResult) => void;
};

// ─────────────────────────────────────────────────
// Step Icon Component
// ─────────────────────────────────────────────────

function StepIcon({
  step,
  isActive,
}: {
  step: OptimizationStep;
  isActive: boolean;
}) {
  const baseClass = isActive
    ? "h-4 w-4 text-primary animate-pulse"
    : "h-4 w-4 text-muted-foreground";

  switch (step) {
    case "evaluating_champion":
      return <IconTarget className={baseClass} />;
    case "mining_pairs":
      return <IconChartLine className={baseClass} />;
    case "generating_patches":
      return <IconFlame className={baseClass} />;
    case "tournament":
      return <IconRocket className={baseClass} />;
    case "meta_evolution":
      return <IconFlame className={baseClass} />;
    case "completed":
      return <IconCheck className="h-4 w-4 text-green-600" />;
    case "failed":
      return <IconX className="h-4 w-4 text-destructive" />;
    default:
      return <IconCircleDot className={baseClass} />;
  }
}

// ─────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

// ─────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────

export function OptimizationView({
  onOptimizationComplete,
}: OptimizationViewProps) {
  const mountedRef = useRef(true);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [task, setTask] = useState<OptimizationTaskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // Config state
  const [maxIterations, setMaxIterations] = useState(3);
  const [replicates, setReplicates] = useState(3);
  const [patchCandidates, setPatchCandidates] = useState(3);
  const [metaEvolutionEnabled, setMetaEvolutionEnabled] = useState(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Poll for task updates
  useEffect(() => {
    if (!taskId) return;

    let timeoutId: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!mountedRef.current) return;

      try {
        const res = await fetch(`/v3/optimize/${taskId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data: OptimizationTaskResponse = await res.json();
        if (!mountedRef.current) return;

        setTask(data);

        if (data.status === "completed") {
          if (data.result) {
            onOptimizationComplete?.(data.result);
          }
        } else if (data.status === "failed") {
          setError(data.error || "Optimization failed");
        } else {
          // Continue polling
          timeoutId = setTimeout(poll, 1500);
        }
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to poll status");
      }
    };

    poll();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [taskId, onOptimizationComplete]);

  // Start optimization
  const handleStart = async () => {
    setIsStarting(true);
    setError(null);
    setTask(null);

    try {
      const res = await fetch("/v3/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxIterations,
          replicates,
          patchCandidates,
          metaEvolutionEnabled,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setTaskId(data.taskId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
    } finally {
      setIsStarting(false);
    }
  };

  // Reset to configure new run
  const handleReset = () => {
    setTaskId(null);
    setTask(null);
    setError(null);
  };

  const isRunning = task?.status === "running";
  const isCompleted = task?.status === "completed";
  const isFailed = task?.status === "failed";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <IconRocket className="h-5 w-5" />
          Full Optimization Loop
        </h3>
        <p className="text-sm text-muted-foreground">
          Run the complete LoopAgent pipeline with real-time progress streaming
        </p>
      </div>

      {/* Educational note */}
      <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3">
        <IconInfoCircle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">5-Step Loop:</span> Each iteration
          evaluates the champion, mines contrastive pairs, generates patches,
          runs a tournament, and promotes the best candidate if it beats the
          threshold. Meta-evolution optionally evolves the mutation prompts
          themselves.
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3">
          <IconX className="h-4 w-4 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Configuration (when not running) */}
      {!taskId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuration</CardTitle>
            <CardDescription>
              Configure optimization parameters before starting
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Max Iterations</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={maxIterations}
                  onChange={(e) => setMaxIterations(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Replicates</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={replicates}
                  onChange={(e) => setReplicates(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Patch Candidates</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={patchCandidates}
                  onChange={(e) => setPatchCandidates(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="metaEvolution"
                  checked={metaEvolutionEnabled}
                  onChange={(e) => setMetaEvolutionEnabled(e.target.checked)}
                  className="rounded border"
                />
                <label htmlFor="metaEvolution" className="text-sm font-medium">
                  Enable Meta-Evolution
                </label>
              </div>
            </div>
            <Button
              onClick={handleStart}
              disabled={isStarting}
              className="w-full"
              size="lg"
            >
              {isStarting ? (
                <>
                  <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <IconPlayerPlay className="mr-2 h-4 w-4" />
                  Start Optimization
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Live Progress */}
      {task && (
        <>
          {/* Status Header */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <StepIcon step={task.progress.step} isActive={isRunning} />
                  {task.progress.stepLabel}
                </CardTitle>
                <Badge
                  variant={
                    isCompleted
                      ? "default"
                      : isFailed
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {task.status}
                </Badge>
              </div>
              <CardDescription>
                Iteration {task.progress.iteration} of{" "}
                {task.progress.maxIterations}
                {task.progress.totalElapsed > 0 && (
                  <span className="ml-2">
                    <IconClock className="inline h-3 w-3 mr-1" />
                    {formatDuration(task.progress.totalElapsed)}
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Overall Progress */}
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span>Overall Progress</span>
                  <span>
                    {task.progress.iteration}/{task.progress.maxIterations}{" "}
                    iterations
                  </span>
                </div>
                <Progress
                  value={
                    (task.progress.iteration / task.progress.maxIterations) *
                    100
                  }
                  className="h-2"
                />
              </div>

              {/* Step-specific Progress */}
              {isRunning && task.progress.evalProgress && (
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Evaluation Progress</span>
                    <span>
                      {task.progress.evalProgress.completed}/
                      {task.progress.evalProgress.total} runs
                    </span>
                  </div>
                  <Progress
                    value={
                      (task.progress.evalProgress.completed /
                        task.progress.evalProgress.total) *
                      100
                    }
                    className="h-1.5"
                  />
                </div>
              )}

              {isRunning && task.progress.tournamentProgress && (
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Tournament Progress</span>
                    <span>
                      Candidate {task.progress.tournamentProgress.candidateIdx +
                        1}/{task.progress.tournamentProgress.totalCandidates}
                    </span>
                  </div>
                  <Progress
                    value={
                      (task.progress.tournamentProgress.runsCompleted /
                        task.progress.tournamentProgress.totalRuns) *
                      100
                    }
                    className="h-1.5"
                  />
                </div>
              )}

              {/* Current Stats */}
              <div className="grid grid-cols-3 gap-4 pt-2 border-t">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Champion Objective
                  </p>
                  <p className="text-lg font-bold">
                    {formatPercent(task.progress.championObjective)}
                  </p>
                </div>
                {task.progress.pairsFound !== undefined && (
                  <div>
                    <p className="text-xs text-muted-foreground">Pairs Found</p>
                    <p className="text-lg font-bold">
                      {task.progress.pairsFound}
                    </p>
                  </div>
                )}
                {task.progress.candidatesGenerated !== undefined && (
                  <div>
                    <p className="text-xs text-muted-foreground">Candidates</p>
                    <p className="text-lg font-bold">
                      {task.progress.candidatesGenerated}
                    </p>
                  </div>
                )}
              </div>

              {/* Meta-Evolution Info */}
              {task.config.metaEvolutionEnabled &&
                task.progress.bestMutationType && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-muted-foreground mb-1">
                      Meta-Evolution
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {task.progress.bestMutationType}
                      </Badge>
                      {task.progress.hypermutationApplied && (
                        <Badge variant="secondary" className="gap-1">
                          <IconFlame className="h-3 w-3" />
                          Hypermutation
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
            </CardContent>
          </Card>

          {/* Iteration History */}
          {task.progress.history.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Iteration History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">#</TableHead>
                      <TableHead className="text-right">Champion</TableHead>
                      <TableHead className="text-right">Best</TableHead>
                      <TableHead className="text-right">Delta</TableHead>
                      <TableHead className="text-center">Promoted</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {task.progress.history.map((iter) => {
                      const delta =
                        iter.bestCandidateObjective - iter.championObjective;
                      return (
                        <TableRow key={iter.iteration}>
                          <TableCell className="font-mono">
                            {iter.iteration}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatPercent(iter.championObjective)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatPercent(iter.bestCandidateObjective)}
                          </TableCell>
                          <TableCell className="text-right">
                            {delta > 0 ? (
                              <span className="text-green-600 flex items-center justify-end gap-1">
                                <IconArrowUp className="h-3 w-3" />+
                                {formatPercent(delta)}
                              </span>
                            ) : delta < 0 ? (
                              <span className="text-red-600 flex items-center justify-end gap-1">
                                <IconArrowDown className="h-3 w-3" />
                                {formatPercent(delta)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">0%</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {iter.promoted ? (
                              <IconCheck className="h-4 w-4 text-green-600 mx-auto" />
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatDuration(iter.duration)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Final Results */}
          {isCompleted && task.result && (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <IconCheck className="h-5 w-5 text-green-600" />
                  Optimization Complete
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Final Objective
                    </p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatPercent(task.result.finalObjective)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Improvement</p>
                    <p className="text-2xl font-bold">
                      {task.result.improvementVsBaseline > 0 ? "+" : ""}
                      {formatPercent(task.result.improvementVsBaseline)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Iterations</p>
                    <p className="text-2xl font-bold">
                      {task.result.totalIterations}
                    </p>
                  </div>
                </div>
                {task.result.championPatch && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Champion Patch
                    </p>
                    <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-48">
                      {task.result.championPatch}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-center">
            {(isCompleted || isFailed) && (
              <Button onClick={handleReset} variant="outline">
                Configure New Run
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

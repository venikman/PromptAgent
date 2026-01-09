/**
 * Optimization Progress Types
 *
 * Types for real-time streaming of optimization loop progress.
 * Enables UI to display step-level detail during long-running optimization.
 *
 * @see FPF-Spec A.0 (NQD) for illumination metrics
 * @see FPF-Spec C.17 (Creativity-CHR) for meta-evolution
 */

import type { IterationResult } from "./types.ts";
import type { IlluminationTelemetry } from "../fpf/nqd-selector.ts";

// ─────────────────────────────────────────────────
// Pipeline Step Enumeration
// ─────────────────────────────────────────────────

/**
 * Current step in the optimization pipeline.
 * Maps to the 5-step LoopAgent pattern.
 */
export type OptimizationStep =
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

/**
 * Human-readable labels for each step.
 */
export const STEP_LABELS: Record<OptimizationStep, string> = {
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

// ─────────────────────────────────────────────────
// Progress Detail Types
// ─────────────────────────────────────────────────

/**
 * Progress details for evaluation step.
 */
export interface EvalProgress {
  completed: number;
  total: number;
  currentEpicId?: string;
  currentReplicate?: number;
}

/**
 * Progress details for tournament step.
 */
export interface TournamentProgress {
  candidateIdx: number;
  totalCandidates: number;
  runsCompleted: number;
  totalRuns: number;
  /** Scores collected so far */
  partialScores?: Array<{
    candidateId: string;
    objective: number;
    passRate: number;
  }>;
}

/**
 * Progress details for patch generation step.
 */
export interface PatchGenProgress {
  generated: number;
  target: number;
}

// ─────────────────────────────────────────────────
// Streaming Progress Type
// ─────────────────────────────────────────────────

/**
 * Real-time optimization progress.
 * Sent to clients during polling.
 */
export interface OptimizationProgress {
  /** Current iteration (1-indexed) */
  iteration: number;
  /** Total iterations configured */
  maxIterations: number;
  /** Current pipeline step */
  step: OptimizationStep;
  /** Human-readable step label */
  stepLabel: string;

  // ─── Step-specific progress ───
  /** Evaluation progress (when step = evaluating_champion or tournament) */
  evalProgress?: EvalProgress;
  /** Tournament progress (when step = tournament) */
  tournamentProgress?: TournamentProgress;
  /** Patch generation progress (when step = generating_patches) */
  patchProgress?: PatchGenProgress;

  // ─── Current iteration stats ───
  /** Pairs found this iteration */
  pairsFound?: number;
  /** Candidates generated this iteration */
  candidatesGenerated?: number;

  // ─── Champion info ───
  /** Current champion objective score */
  championObjective: number;
  /** Best candidate objective (during tournament) */
  bestCandidateObjective?: number;
  /** Whether promotion occurred */
  promoted?: boolean;

  // ─── NQD Telemetry (when NQD enabled) ───
  /** Illumination metrics from NQD selection */
  illumination?: IlluminationTelemetry;
  /** Pareto front size */
  paretoFrontSize?: number;

  // ─── Meta-Evolution (when enabled) ───
  /** Mutation type used for best candidate */
  bestMutationType?: string;
  /** Whether hypermutation was applied */
  hypermutationApplied?: boolean;

  // ─── Timing ───
  /** Time elapsed in current iteration (ms) */
  iterationElapsed?: number;
  /** Total time elapsed (ms) */
  totalElapsed: number;

  // ─── Completed iterations ───
  /** Summary of completed iterations */
  history: IterationSummary[];
}

/**
 * Compact summary of a completed iteration.
 * Used in history array to avoid sending full IterationResult.
 */
export interface IterationSummary {
  iteration: number;
  championObjective: number;
  bestCandidateObjective: number;
  promoted: boolean;
  pairsFound: number;
  candidatesGenerated: number;
  duration: number;
  error?: string;
}

/**
 * Convert IterationResult to compact summary.
 */
export function toIterationSummary(result: IterationResult): IterationSummary {
  return {
    iteration: result.iteration,
    championObjective: result.championObjective,
    bestCandidateObjective: result.bestCandidateObjective,
    promoted: result.promoted,
    pairsFound: result.pairsFound,
    candidatesGenerated: result.candidatesGenerated,
    duration: result.duration,
    error: result.error,
  };
}

// ─────────────────────────────────────────────────
// Optimization Task Store Type
// ─────────────────────────────────────────────────

/**
 * Full optimization task with streaming progress.
 * Stored in-memory (or Deno KV) for polling.
 */
export interface OptimizationTask {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  /** Real-time progress (updated during execution) */
  progress: OptimizationProgress;
  /** Final result (set when completed) */
  result?: {
    finalObjective: number;
    totalIterations: number;
    improvementVsBaseline: number;
    championPatch: string;
    history: IterationSummary[];
  };
  /** Error message (set when failed) */
  error?: string;
  /** Configuration used */
  config: {
    maxIterations: number;
    replicates: number;
    patchCandidates: number;
    metaEvolutionEnabled: boolean;
  };
  startedAt: string;
  completedAt?: string;
}

/**
 * Create initial optimization task.
 */
export function createOptimizationTask(
  id: string,
  config: OptimizationTask["config"],
): OptimizationTask {
  return {
    id,
    status: "pending",
    progress: {
      iteration: 0,
      maxIterations: config.maxIterations,
      step: "initializing",
      stepLabel: STEP_LABELS.initializing,
      championObjective: 0,
      totalElapsed: 0,
      history: [],
    },
    config,
    startedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────
// Progress Update Helpers
// ─────────────────────────────────────────────────

/**
 * Update task with new step.
 */
export function updateTaskStep(
  task: OptimizationTask,
  step: OptimizationStep,
  updates?: Partial<OptimizationProgress>,
): void {
  task.progress.step = step;
  task.progress.stepLabel = STEP_LABELS[step];
  if (updates) {
    Object.assign(task.progress, updates);
  }
}

/**
 * Update task with evaluation progress.
 */
export function updateTaskEvalProgress(
  task: OptimizationTask,
  evalProgress: EvalProgress,
): void {
  task.progress.evalProgress = evalProgress;
}

/**
 * Update task with tournament progress.
 */
export function updateTaskTournamentProgress(
  task: OptimizationTask,
  tournamentProgress: TournamentProgress,
): void {
  task.progress.tournamentProgress = tournamentProgress;
}

/**
 * Complete an iteration and add to history.
 */
export function completeTaskIteration(
  task: OptimizationTask,
  result: IterationResult,
): void {
  task.progress.history.push(toIterationSummary(result));
  task.progress.championObjective = result.promoted
    ? result.bestCandidateObjective
    : result.championObjective;
  task.progress.promoted = result.promoted;
  task.progress.bestCandidateObjective = result.bestCandidateObjective;
  task.progress.pairsFound = result.pairsFound;
  task.progress.candidatesGenerated = result.candidatesGenerated;

  // NQD telemetry
  if (result.illumination) {
    task.progress.illumination = result.illumination;
  }
  if (result.paretoFrontSize !== undefined) {
    task.progress.paretoFrontSize = result.paretoFrontSize;
  }

  // Meta-evolution telemetry
  if (result.bestMutationType) {
    task.progress.bestMutationType = result.bestMutationType;
  }
  if (result.hypermutationApplied) {
    task.progress.hypermutationApplied = result.hypermutationApplied;
  }
}

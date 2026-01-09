/**
 * Orchestrator Types
 *
 * Shared types for the agentic orchestration layer.
 * Follows Google's Agent-as-Tool pattern for state isolation.
 */

import type { Epic, StoryPack } from "../schema.ts";
import type { PromptDistReport, FlatRun } from "../eval.ts";
import type { ContrastPair } from "../pairMining.ts";
import type {
  IlluminationTelemetry,
  ParetoFront,
} from "../fpf/nqd-selector.ts";
import type { MutationPrompt } from "../meta-evolution/types.ts";

// Re-export composePrompt from patchEngineer
export { composePrompt } from "../patchEngineer.ts";

// ─────────────────────────────────────────────────
// Tool Execution Context
// ─────────────────────────────────────────────────

/**
 * Fresh context created for each tool call.
 * Ensures state isolation between iterations (prevents context rot).
 */
export interface ToolContext {
  /** Unique identifier for this execution */
  runId: string;
  /** When this execution started */
  startedAt: Date;
  /** Parent context ID (for nested calls) */
  parentRunId?: string;
}

/**
 * Creates a new isolated tool context.
 */
export function createToolContext(parentRunId?: string): ToolContext {
  return {
    runId: crypto.randomUUID(),
    startedAt: new Date(),
    parentRunId,
  };
}

// ─────────────────────────────────────────────────
// Tool Result Wrapper
// ─────────────────────────────────────────────────

/**
 * Unified result type for all tool executions.
 * Enables consistent error handling and timing.
 */
export interface ToolResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  /** Execution duration in milliseconds */
  duration: number;
  /** Context used for this execution */
  context: ToolContext;
}

/**
 * Helper to create success result.
 */
export function successResult<T>(
  data: T,
  ctx: ToolContext,
  startTime: number,
): ToolResult<T> {
  return {
    success: true,
    data,
    duration: Date.now() - startTime,
    context: ctx,
  };
}

/**
 * Helper to create failure result.
 */
export function failureResult<T>(
  error: unknown,
  ctx: ToolContext,
  startTime: number,
): ToolResult<T> {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
    duration: Date.now() - startTime,
    context: ctx,
  };
}

// ─────────────────────────────────────────────────
// Optimization State
// ─────────────────────────────────────────────────

/**
 * Champion prompt structure (base + patch composition).
 */
export interface ChampionPrompt {
  /** Immutable base prompt */
  base: string;
  /** Evolved patch section */
  patch: string;
}

/**
 * Per-iteration result summary.
 */
export interface IterationResult {
  iteration: number;
  /** Number of contrastive pairs found */
  pairsFound: number;
  /** Number of patch candidates generated */
  candidatesGenerated: number;
  /** Best candidate's objective score */
  bestCandidateObjective: number;
  /** Champion's objective score at start of iteration */
  championObjective: number;
  /** Whether champion was promoted this iteration */
  promoted: boolean;
  /** Iteration duration in milliseconds */
  duration: number;
  /** Error message if iteration failed */
  error?: string;

  // ─── NQD Telemetry (FPF C.18) ───
  /** NQD illumination metrics (if NQD enabled) */
  illumination?: IlluminationTelemetry;
  /** Pareto front size */
  paretoFrontSize?: number;
  /** Whether NQD changed winner vs simple objective sort */
  nqdChangedWinner?: boolean;
  /** Number of ineligible candidates (failed creativity gate) */
  ineligibleCount?: number;

  // ─── Meta-Evolution Telemetry ───
  /** Mutation prompts used this iteration (if meta-evolution enabled) */
  mutationsUsed?: Array<{ id: string; type: string }>;
  /** Whether hypermutation was applied this iteration */
  hypermutationApplied?: boolean;
  /** Best performing mutation type this iteration */
  bestMutationType?: string;
}

/**
 * Full optimization loop state.
 * Can be checkpointed and recovered.
 */
export interface OptimizationState {
  /** Session ID for checkpoint/recovery */
  sessionId: string;
  /** Current iteration number (0 = not started) */
  iteration: number;
  /** Current champion prompt */
  championPrompt: ChampionPrompt;
  /** Champion's objective score */
  championObjective: number;
  /** Whether to continue iterating */
  shouldContinue: boolean;
  /** History of all iterations */
  history: IterationResult[];
  /** When optimization started */
  startedAt: string;
  /** When optimization completed (if done) */
  completedAt?: string;

  // ─── Meta-Evolution State ───
  /** Evolved mutation prompts (if meta-evolution enabled) */
  mutationPrompts?: MutationPrompt[];
}

/**
 * Creates initial optimization state.
 */
export function createInitialState(
  champion: ChampionPrompt,
  sessionId?: string,
): OptimizationState {
  return {
    sessionId: sessionId ?? crypto.randomUUID(),
    iteration: 0,
    championPrompt: champion,
    championObjective: 0,
    shouldContinue: true,
    history: [],
    startedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────
// Tool Input/Output Types
// ─────────────────────────────────────────────────

/**
 * Evaluator tool input.
 */
export interface EvaluatorInput {
  promptText: string;
  epics: Epic[];
  replicates: number;
  seedBase: number;
  concurrency?: number;
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Evaluator tool output.
 */
export interface EvaluatorOutput {
  report: PromptDistReport;
  flatRuns: FlatRun[];
}

/**
 * Pair miner tool input.
 */
export interface PairMinerInput {
  runs: FlatRun[];
  minSim?: number;
  minDelta?: number;
  maxPairs?: number;
  /** Enable tiered (CRPO-style) pair mining with quality tiers */
  tieredMining?: boolean;
}

/**
 * Patcher tool input.
 */
export interface PatcherInput {
  basePrompt: string;
  currentPatch: string;
  pairs: ContrastPair[];
  candidateCount: number;
  temperature: number;
}

// ─────────────────────────────────────────────────
// Workflow Types
// ─────────────────────────────────────────────────

/**
 * Available workflow types.
 */
export type WorkflowType = "playground" | "evaluate" | "optimize";

/**
 * Playground result (single generation + score).
 */
export interface PlaygroundResult {
  generation: {
    storyPack: StoryPack | null;
    rawText: string;
    error?: string;
  };
  score: {
    score: number;
    reason?: string;
  } | null;
}

// ─────────────────────────────────────────────────
// Optimization Config
// ─────────────────────────────────────────────────

/**
 * Configuration for optimization loop.
 */
export interface OptimizationConfig {
  /** Maximum iterations to run */
  maxIterations: number;
  /** Minimum improvement required for promotion */
  promotionThreshold: number;
  /** Replicates per epic for evaluation */
  replicates: number;
  /** Number of patch candidates to generate */
  patchCandidates: number;
  /** Concurrency for parallel evaluation */
  concurrency?: number;
  /** Callback when iteration starts */
  onIterationStart?: (iteration: number) => void;
  /** Callback when iteration ends */
  onIterationEnd?: (result: IterationResult) => void;
  /** Progress callback for evaluation */
  onProgress?: (completed: number, total: number) => void;

  // ─── Meta-Evolution (PromptBreeder-style) ───
  /** Enable meta-evolution for mutation prompt optimization */
  metaEvolutionEnabled?: boolean;
  /** Probability of hypermutation per iteration (default: 0.1) */
  hypermutationRate?: number;

  // ─── Tiered Pair Mining (CRPO-style) ───
  /** Enable tiered contrastive pair mining with quality tiers */
  tieredPairMining?: boolean;
}

/**
 * Tournament candidate result.
 */
export interface TournamentCandidate {
  id: string;
  patch: string;
  objective: number;
  isChampion: boolean;
  deltaVsChampion: number;
}

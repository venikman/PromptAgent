/**
 * Orchestrator Module
 *
 * Exports for the agentic orchestration layer.
 * Implements Google's 4-step framework for multi-agent systems.
 */

// ─────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────

export {
  // Optimization State
  type ChampionPrompt,
  // Re-exports
  composePrompt,
  createInitialState,
  createToolContext,
  // Tool I/O Types
  type EvaluatorInput,
  type EvaluatorOutput,
  failureResult,
  type IterationResult,
  type OptimizationConfig,
  type OptimizationState,
  type PairMinerInput,
  type PatcherInput,
  type PlaygroundResult,
  successResult,
  // Context & Results
  type ToolContext,
  type ToolResult,
  type TournamentCandidate,
  // Workflow Types
  type WorkflowType,
} from "./types.ts";

// ─────────────────────────────────────────────────
// State Management
// ─────────────────────────────────────────────────

export {
  cleanupOldCheckpoints,
  // Cleanup
  cleanupOldTasks,
  completeTask,
  createTask,
  failTask,
  getCheckpoint,
  getLatestCheckpoint,
  getTask,
  // KV Store
  kvStore,
  listCheckpoints,
  listTasksByStatus,
  // Checkpoints
  saveCheckpoint,
  saveTask,
  type SessionCheckpoint,
  type TaskRecord,
  type TaskStatus,
  // Types
  type TaskType,
  updateTaskProgress,
  updateTaskStatus,
} from "./state/index.ts";

// ─────────────────────────────────────────────────
// Tools
// ─────────────────────────────────────────────────

export {
  evaluateSingleEpic,
  executeEvaluator,
} from "./tools/evaluator-tool.ts";

export { executePairMiner, hasPairs } from "./tools/pair-miner-tool.ts";

export {
  executePatcher,
  generateSinglePatch,
  hasCandidates,
} from "./tools/patcher-tool.ts";

// ─────────────────────────────────────────────────
// Agents
// ─────────────────────────────────────────────────

export {
  OptimizationLoopAgent,
  resumeOptimizationLoop,
  runOptimizationLoop,
} from "./optimization-loop.ts";

// ─────────────────────────────────────────────────
// Optimization Progress (Streaming)
// ─────────────────────────────────────────────────

export {
  completeTaskIteration,
  // Factory & Helpers
  createOptimizationTask,
  type EvalProgress,
  type IterationSummary,
  type OptimizationProgress,
  // Types
  type OptimizationStep,
  type OptimizationTask,
  type PatchGenProgress,
  // Constants
  STEP_LABELS,
  toIterationSummary,
  type TournamentProgress,
  updateTaskEvalProgress,
  updateTaskStep,
  updateTaskTournamentProgress,
} from "./optimization-progress.ts";

// ─────────────────────────────────────────────────
// Root Orchestrator
// ─────────────────────────────────────────────────

export {
  createOrchestrator,
  Orchestrator,
  type OrchestratorConfig,
} from "./root.ts";

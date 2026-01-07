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
  // Context & Results
  type ToolContext,
  type ToolResult,
  createToolContext,
  successResult,
  failureResult,

  // Optimization State
  type ChampionPrompt,
  type IterationResult,
  type OptimizationState,
  createInitialState,

  // Tool I/O Types
  type EvaluatorInput,
  type EvaluatorOutput,
  type PairMinerInput,
  type PatcherInput,

  // Workflow Types
  type WorkflowType,
  type PlaygroundResult,
  type OptimizationConfig,
  type TournamentCandidate,

  // Re-exports
  composePrompt,
} from "./types.ts";

// ─────────────────────────────────────────────────
// State Management
// ─────────────────────────────────────────────────

export {
  // KV Store
  kvStore,
  saveTask,
  getTask,
  updateTaskProgress,
  updateTaskStatus,
  completeTask,
  failTask,
  listTasksByStatus,
  createTask,

  // Checkpoints
  saveCheckpoint,
  getCheckpoint,
  getLatestCheckpoint,
  listCheckpoints,

  // Cleanup
  cleanupOldTasks,
  cleanupOldCheckpoints,

  // Types
  type TaskType,
  type TaskStatus,
  type TaskRecord,
  type SessionCheckpoint,
} from "./state/index.ts";

// ─────────────────────────────────────────────────
// Tools
// ─────────────────────────────────────────────────

export {
  executeEvaluator,
  evaluateSingleEpic,
} from "./tools/evaluator-tool.ts";

export {
  executePairMiner,
  hasPairs,
} from "./tools/pair-miner-tool.ts";

export {
  executePatcher,
  hasCandidates,
  generateSinglePatch,
} from "./tools/patcher-tool.ts";

// ─────────────────────────────────────────────────
// Agents
// ─────────────────────────────────────────────────

export {
  OptimizationLoopAgent,
  runOptimizationLoop,
  resumeOptimizationLoop,
} from "./optimization-loop.ts";

// ─────────────────────────────────────────────────
// Root Orchestrator
// ─────────────────────────────────────────────────

export {
  Orchestrator,
  createOrchestrator,
  type OrchestratorConfig,
} from "./root.ts";

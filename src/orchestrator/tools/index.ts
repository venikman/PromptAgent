/**
 * Tool Exports
 *
 * All tools follow the Agent-as-Tool pattern:
 * - Each call gets fresh context (state isolation)
 * - Returns ToolResult<T> for consistent error handling
 * - Tracks execution timing
 */

export {
  executeEvaluator,
  evaluateSingleEpic,
} from "./evaluator-tool.ts";

export {
  executePairMiner,
  hasPairs,
} from "./pair-miner-tool.ts";

export {
  executePatcher,
  hasCandidates,
  generateSinglePatch,
} from "./patcher-tool.ts";

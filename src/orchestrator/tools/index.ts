/**
 * Tool Exports
 *
 * All tools follow the Agent-as-Tool pattern:
 * - Each call gets fresh context (state isolation)
 * - Returns ToolResult<T> for consistent error handling
 * - Tracks execution timing
 */

export { evaluateSingleEpic, executeEvaluator } from "./evaluator-tool.ts";

export { executePairMiner, hasPairs } from "./pair-miner-tool.ts";

export {
  executePatcher,
  generateSinglePatch,
  hasCandidates,
} from "./patcher-tool.ts";

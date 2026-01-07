/**
 * Pair Miner Tool
 *
 * Finds contrastive pairs from scored outputs.
 * Pure function - naturally isolated, no shared state.
 */

import { mineContrastivePairs, type ContrastPair } from "../../pairMining.ts";
import type { FlatRun } from "../../eval.ts";
import type { ToolContext, ToolResult, PairMinerInput } from "../types.ts";
import { successResult, failureResult } from "../types.ts";

/**
 * Execute contrastive pair mining.
 *
 * This is a pure function wrapper - the underlying mineContrastivePairs
 * has no side effects, so isolation is automatic.
 */
export async function executePairMiner(
  input: PairMinerInput,
  ctx: ToolContext
): Promise<ToolResult<ContrastPair[]>> {
  const startTime = Date.now();

  try {
    // Convert FlatRun to ScoredOutput format expected by mineContrastivePairs
    const scoredOutputs = input.runs.map((r) => ({
      epicId: r.epicId,
      seed: r.seed,
      score: r.score,
      pass: r.pass,
      storyPack: r.storyPack,
      rawText: r.rawText,
    }));

    const pairs = mineContrastivePairs({
      runs: scoredOutputs,
      minSim: input.minSim,
      minDelta: input.minDelta,
      maxPairs: input.maxPairs,
    });

    return successResult(pairs, ctx, startTime);
  } catch (error) {
    return failureResult<ContrastPair[]>(error, ctx, startTime);
  }
}

/**
 * Check if pairs were found (helper for control flow).
 */
export function hasPairs(result: ToolResult<ContrastPair[]>): boolean {
  return result.success && (result.data?.length ?? 0) > 0;
}

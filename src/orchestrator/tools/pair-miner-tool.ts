/**
 * Pair Miner Tool
 *
 * Finds contrastive pairs from scored outputs.
 * Pure function - naturally isolated, no shared state.
 *
 * Supports both standard and tiered (CRPO-style) pair mining.
 */

import {
  type ContrastPair,
  formatTieredPairsForPrompt,
  mineContrastivePairs,
  mineTieredContrastivePairs,
} from "../../pairMining.ts";
import type { PairMinerInput, ToolContext, ToolResult } from "../types.ts";
import { failureResult, successResult } from "../types.ts";

/**
 * Pair miner output with optional tiered context.
 */
export interface PairMinerOutput {
  pairs: ContrastPair[];
  /** Formatted pairs context for prompt (includes tier summaries if tiered) */
  formattedContext: string;
  /** Whether tiered mining was used */
  tiered: boolean;
}

/**
 * Execute contrastive pair mining.
 *
 * This is a pure function wrapper - the underlying mineContrastivePairs
 * has no side effects, so isolation is automatic.
 *
 * When tieredMining is enabled, uses CRPO-style quality tiers (HIGH/MEDIUM/LOW)
 * with multi-metric pairing and error analysis.
 */
export function executePairMiner(
  input: PairMinerInput,
  ctx: ToolContext,
): Promise<ToolResult<PairMinerOutput>> {
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

    let pairs: ContrastPair[];
    let formattedContext: string;

    if (input.tieredMining) {
      // Tiered (CRPO-style) pair mining with quality tiers
      pairs = mineTieredContrastivePairs({
        runs: scoredOutputs,
        minSim: input.minSim,
        minDelta: input.minDelta,
        maxPairs: input.maxPairs,
      });
      formattedContext = formatTieredPairsForPrompt(pairs);
    } else {
      // Standard pair mining
      pairs = mineContrastivePairs({
        runs: scoredOutputs,
        minSim: input.minSim,
        minDelta: input.minDelta,
        maxPairs: input.maxPairs,
      });
      formattedContext = formatStandardPairs(pairs);
    }

    return Promise.resolve(
      successResult(
        { pairs, formattedContext, tiered: !!input.tieredMining },
        ctx,
        startTime,
      ),
    );
  } catch (error) {
    return Promise.resolve(
      failureResult<PairMinerOutput>(error, ctx, startTime),
    );
  }
}

/**
 * Format standard pairs for prompt context.
 * Uses nested good/bad ScoredOutput properties from ContrastPair.
 */
function formatStandardPairs(pairs: ContrastPair[]): string {
  if (pairs.length === 0) return "No contrastive pairs found.";

  return pairs
    .map(
      (p, i) =>
        `### Pair ${i + 1} (Δ=${p.delta.toFixed(3)}, sim=${
          p.sim.toFixed(3)
        })\n` +
        `**GOOD** (score=${p.good.score.toFixed(3)}):\n${
          p.good.rawText.slice(0, 500)
        }...\n\n` +
        `**BAD** (score=${p.bad.score.toFixed(3)}):\n${
          p.bad.rawText.slice(0, 500)
        }...`,
    )
    .join("\n\n---\n\n");
}

/**
 * Check if pairs were found (helper for control flow).
 */
export function hasPairs(result: ToolResult<PairMinerOutput>): boolean {
  return result.success && (result.data?.pairs.length ?? 0) > 0;
}

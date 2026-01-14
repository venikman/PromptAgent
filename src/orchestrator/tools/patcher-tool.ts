/**
 * Patcher Tool
 *
 * Generates prompt patch candidates from contrastive pairs.
 * Uses the patch engineer agent with isolated context per call.
 */

import { generatePatchCandidates } from "../../patchEngineer.ts";
import { formatPairsForPrompt } from "../../pairMining.ts";
import type { ContrastPair } from "../../pairMining.ts";
import type { PatcherInput, ToolContext, ToolResult } from "../types.ts";
import { failureResult, successResult } from "../types.ts";

/**
 * Execute patch generation with isolated context.
 *
 * Each call generates fresh patch candidates based on
 * the contrastive pairs provided.
 */
export async function executePatcher(
  input: PatcherInput,
  ctx: ToolContext,
): Promise<ToolResult<string[]>> {
  const startTime = Date.now();

  try {
    // Format pairs for the patch engineer prompt
    const pairsContext = formatPairsForPrompt(input.pairs);

    // Generate patch candidates (count is second arg)
    const candidates = await generatePatchCandidates(
      {
        basePrompt: input.basePrompt,
        currentPatch: input.currentPatch,
        pairsContext,
      },
      input.candidateCount,
    );

    return successResult(candidates, ctx, startTime);
  } catch (error) {
    return failureResult<string[]>(error, ctx, startTime);
  }
}

/**
 * Check if candidates were generated (helper for control flow).
 */
export function hasCandidates(result: ToolResult<string[]>): boolean {
  return result.success && (result.data?.length ?? 0) > 0;
}

/**
 * Generate a single patch candidate (for testing/debugging).
 */
export async function generateSinglePatch(
  basePrompt: string,
  currentPatch: string,
  pairs: ContrastPair[],
  ctx: ToolContext,
): Promise<ToolResult<string>> {
  const result = await executePatcher(
    {
      basePrompt,
      currentPatch,
      pairs,
      candidateCount: 1,
      temperature: 0.6,
    },
    ctx,
  );

  if (!result.success) {
    return failureResult<string>(result.error, ctx, Date.now());
  }

  const patch = result.data?.[0];
  if (!patch) {
    return failureResult<string>("No patch generated", ctx, Date.now());
  }

  return successResult(patch, ctx, Date.now());
}

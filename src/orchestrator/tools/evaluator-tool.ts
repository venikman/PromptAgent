/**
 * Evaluator Tool
 *
 * Runs distributional evaluation with state isolation.
 * Each call creates a fresh scorer instance to prevent context rot.
 */

import { evalPromptDistribution, flattenDistReport } from "../../eval.ts";
import { createStoryDecompositionScorer } from "../../scorer.ts";
import type { Epic } from "../../schema.ts";
import type {
  ToolContext,
  ToolResult,
  EvaluatorInput,
  EvaluatorOutput,
} from "../types.ts";
import { successResult, failureResult } from "../types.ts";

/**
 * Execute distributional evaluation with isolated context.
 *
 * Key isolation guarantees:
 * - Fresh scorer instance per call
 * - No shared mutable state
 * - Context tracked via runId
 */
export async function executeEvaluator(
  input: EvaluatorInput,
  ctx: ToolContext
): Promise<ToolResult<EvaluatorOutput>> {
  const startTime = Date.now();

  try {
    // Fresh scorer instance for this execution (isolation)
    const _scorer = createStoryDecompositionScorer();

    const report = await evalPromptDistribution({
      promptId: ctx.runId,
      promptText: input.promptText,
      epics: input.epics,
      replicates: input.replicates,
      seedBase: input.seedBase,
      concurrency: input.concurrency,
      onProgress: input.onProgress,
    });

    const flatRuns = flattenDistReport(report);

    return successResult({ report, flatRuns }, ctx, startTime);
  } catch (error) {
    return failureResult<EvaluatorOutput>(error, ctx, startTime);
  }
}

/**
 * Quick evaluation for a single epic (used in playground).
 */
export async function evaluateSingleEpic(
  epic: Epic,
  promptText: string,
  ctx: ToolContext,
  options?: { seed?: number }
): Promise<ToolResult<EvaluatorOutput>> {
  return executeEvaluator(
    {
      promptText,
      epics: [epic],
      replicates: 1,
      seedBase: options?.seed ?? Date.now(),
    },
    ctx
  );
}

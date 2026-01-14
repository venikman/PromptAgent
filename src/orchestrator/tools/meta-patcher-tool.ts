/**
 * Meta-Evolution Patcher Tool
 *
 * Extends the standard patcher with PromptBreeder-style mutation selection.
 * Instead of using a static patch engineer prompt, it uses evolved mutation
 * prompts from the meta-evolution population.
 *
 * Key features:
 * - Fitness-proportional mutation prompt selection
 * - Tracks which mutation generated each patch (for fitness feedback)
 * - Supports hypermutation (evolving the mutation prompts themselves)
 */

import { Agent } from "@mastra/core/agent";
import { makeJudgeModel } from "../../models.ts";
import { formatPairsForPrompt } from "../../pairMining.ts";
import type { PatcherInput, ToolContext, ToolResult } from "../types.ts";
import { failureResult, successResult } from "../types.ts";
import { env } from "../../config.ts";
import { withAiTelemetry } from "../../telemetry.ts";
import {
  createSeedMutationPrompts,
  getMutationsByType,
  type MutationPrompt,
  selectMutationByFitness,
} from "../../meta-evolution/index.ts";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface MetaPatcherInput extends PatcherInput {
  /** Mutation prompts population (if not provided, uses seed prompts) */
  mutationPrompts?: MutationPrompt[];
  /** Working example for Lamarckian mutations (high-scoring output) */
  workingExample?: string;
}

export interface MetaPatchResult {
  /** Generated patch text */
  patch: string;
  /** Mutation prompt that generated this patch */
  mutationId: string;
  /** Mutation type used */
  mutationType: string;
}

export interface MetaPatcherOutput {
  /** Generated patches with mutation tracking */
  patches: MetaPatchResult[];
  /** Updated mutation prompts (with usage counts) */
  mutationPrompts: MutationPrompt[];
}

// ═══════════════════════════════════════════════════════════════
// META-EVOLUTION AGENT
// ═══════════════════════════════════════════════════════════════

const metaPatchAgent = new Agent({
  id: "meta-patch-agent",
  name: "Meta Patch Agent",
  instructions:
    `You are a prompt optimization expert. Follow the mutation instructions exactly.
Output ONLY the patch text, no explanations or markdown fences.
Keep patches short (10-15 lines of rules) and focused on the specific improvement suggested.`,
  model: makeJudgeModel(),
});

// ═══════════════════════════════════════════════════════════════
// MUTATION APPLICATION
// ═══════════════════════════════════════════════════════════════

/**
 * Apply a mutation prompt to generate a patch.
 */
async function applyMutationForPatch(
  mutation: MutationPrompt,
  basePrompt: string,
  currentPatch: string,
  pairsContext: string,
  workingExample?: string,
): Promise<string | null> {
  // Build context based on mutation type
  let mutationContext = mutation.text;

  // For Lamarckian mutations, include working example
  if (mutation.type === "LAMARCKIAN" && workingExample) {
    mutationContext =
      `${mutationContext}\n\n## WORKING EXAMPLE (high-scoring output)\n${
        workingExample.slice(0, 1500)
      }`;
  }

  // For EDA mutations, emphasize the patterns in pairs
  if (mutation.type === "EDA_MUTATION") {
    mutationContext =
      `${mutationContext}\n\nAnalyze the statistical patterns in the pairs below.`;
  }

  const fullPrompt = `
## BASE PROMPT (context only, do not rewrite)
${basePrompt.slice(0, 1000)}...

## CURRENT PATCH
${currentPatch || "(none)"}

## CONTRASTIVE PAIRS
${pairsContext.slice(0, 3000)}

## MUTATION TASK
${mutationContext}

Output ONLY the new patch text (10-15 lines of rules).
`.trim();

  try {
    const abortSignal = AbortSignal.timeout(env.LLM_TIMEOUT_MS);
    const response = await withAiTelemetry(
      {
        name: "meta-patcher",
        model: env.LMSTUDIO_JUDGE_MODEL ?? env.LMSTUDIO_MODEL,
      },
      () =>
        metaPatchAgent.generate(fullPrompt, {
          modelSettings: {
            temperature: 0.7,
            maxOutputTokens: 512,
          },
          abortSignal,
        }),
    );

    let patch = response.text?.trim() ?? "";

    // Clean up markdown fences if present
    patch = patch
      .replace(/^```[\w]*\n?/gm, "")
      .replace(/\n?```$/gm, "")
      .trim();

    // Validate patch has minimum content
    if (patch.length < 20) {
      return null;
    }

    return patch;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// META PATCHER EXECUTION
// ═══════════════════════════════════════════════════════════════

/**
 * Execute meta-evolution-aware patch generation.
 *
 * Uses fitness-proportional selection to choose mutation prompts,
 * tracks which mutation generated each patch for later fitness feedback.
 */
export async function executeMetaPatcher(
  input: MetaPatcherInput,
  ctx: ToolContext,
): Promise<ToolResult<MetaPatcherOutput>> {
  const startTime = Date.now();

  try {
    // Initialize mutation prompts if not provided
    const mutations = input.mutationPrompts ?? createSeedMutationPrompts();

    // Format pairs for context
    const pairsContext = formatPairsForPrompt(input.pairs);

    // Get non-meta mutation types for patch generation
    const patchMutations = mutations.filter(
      (m) => m.type !== "HYPERMUTATION" && m.type !== "ZERO_ORDER_HYPER",
    );

    const patches: MetaPatchResult[] = [];
    const usedMutationIds: string[] = [];

    // Generate requested number of candidates
    for (let i = 0; i < input.candidateCount; i++) {
      // Select mutation using fitness-proportional selection
      // Exclude recently used to encourage diversity
      const mutation = selectMutationByFitness(
        patchMutations,
        usedMutationIds.slice(-2), // Exclude last 2 used
      );

      const patch = await applyMutationForPatch(
        mutation,
        input.basePrompt,
        input.currentPatch,
        pairsContext,
        input.workingExample,
      );

      if (patch) {
        patches.push({
          patch,
          mutationId: mutation.id,
          mutationType: mutation.type,
        });

        // Track usage
        mutation.usageCount++;
        usedMutationIds.push(mutation.id);
      }
    }

    return successResult(
      {
        patches,
        mutationPrompts: mutations,
      },
      ctx,
      startTime,
    );
  } catch (error) {
    return failureResult<MetaPatcherOutput>(error, ctx, startTime);
  }
}

/**
 * Update mutation fitness based on patch performance.
 *
 * Call this after tournament evaluation to feed back fitness signals.
 */
export function updateMutationFitness(
  mutations: MutationPrompt[],
  patchResults: Array<{
    mutationId: string;
    objective: number;
    championObjective: number;
  }>,
): MutationPrompt[] {
  const mutationMap = new Map(mutations.map((m) => [m.id, m]));

  for (const result of patchResults) {
    const mutation = mutationMap.get(result.mutationId);
    if (!mutation) continue;

    const improved = result.objective > result.championObjective;

    // Exponential moving average for success rate
    const alpha = 0.3;
    mutation.successRate = alpha * (improved ? 1 : 0) +
      (1 - alpha) * mutation.successRate;
    mutation.fitness = mutation.successRate;
  }

  return mutations;
}

/**
 * Run hypermutation on low-performing mutations.
 *
 * Evolves the mutation prompts themselves using hypermutation operators.
 */
export async function runHypermutation(
  mutations: MutationPrompt[],
  generation: number,
): Promise<MutationPrompt[]> {
  const hyperMutations = getMutationsByType(mutations, "HYPERMUTATION");
  if (hyperMutations.length === 0) return mutations;

  // Find lowest-performing regular mutations
  const regularMutations = mutations.filter(
    (m) => m.type !== "HYPERMUTATION" && m.type !== "ZERO_ORDER_HYPER",
  );
  const sorted = [...regularMutations].sort((a, b) => a.fitness - b.fitness);
  const weakest = sorted[0];

  if (!weakest) return mutations;

  // Select a hypermutation operator
  const hyperMutation =
    hyperMutations[Math.floor(Math.random() * hyperMutations.length)]!;

  // Apply hypermutation
  const prompt = hyperMutation.text
    .replace("{MUTATION_PROMPT}", weakest.text)
    .replace("{SUCCESS_RATE}", (weakest.successRate * 100).toFixed(0))
    .replace("{USAGE_COUNT}", String(weakest.usageCount));

  try {
    const abortSignal = AbortSignal.timeout(env.LLM_TIMEOUT_MS);
    const response = await withAiTelemetry(
      {
        name: "meta-hypermutation",
        model: env.LMSTUDIO_JUDGE_MODEL ?? env.LMSTUDIO_MODEL,
      },
      () =>
        metaPatchAgent.generate(prompt, {
          modelSettings: {
            temperature: 0.8,
            maxOutputTokens: 512,
          },
          abortSignal,
        }),
    );

    const newMutationText = response.text?.trim();
    if (newMutationText && newMutationText.length > 30) {
      // Create evolved mutation
      const evolvedMutation: MutationPrompt = {
        id: `mutation-evolved-${Date.now()}`,
        text: newMutationText,
        type: weakest.type,
        fitness: 0.5, // Neutral starting fitness
        usageCount: 0,
        successRate: 0.5,
        generation,
        parentId: weakest.id,
      };

      // Replace the weakest mutation
      const idx = mutations.findIndex((m) => m.id === weakest.id);
      if (idx >= 0) {
        mutations[idx] = evolvedMutation;
      }
    }
  } catch {
    // Hypermutation failed, keep original
  }

  return mutations;
}

/**
 * Check if meta-patcher produced results.
 */
export function hasMetaPatches(
  result: ToolResult<MetaPatcherOutput>,
): boolean {
  return result.success && (result.data?.patches.length ?? 0) > 0;
}

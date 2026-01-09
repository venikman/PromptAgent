/**
 * Meta-Evolution Module (PromptBreeder-style)
 *
 * Self-referential prompt improvement system that evolves both:
 * - Task-prompts (what we're optimizing)
 * - Mutation-prompts (how we generate variations)
 *
 * Key insight from PromptBreeder: mutation operators can be evolved
 * alongside the solutions they produce, enabling open-ended improvement.
 *
 * @see https://arxiv.org/abs/2309.16797 - PromptBreeder paper
 */

// Types
export type {
  MutationType,
  MutationPrompt,
  TaskPrompt,
  Population,
  MutationResult,
  HypermutationResult,
  MetaEvolutionConfig,
  GenerationStats,
  EvolutionTelemetry,
} from "./types.ts";

export { DEFAULT_META_CONFIG } from "./types.ts";

// Mutation prompts
export {
  createSeedMutationPrompts,
  getMutationsByType,
  selectMutationByFitness,
  selectEliteMutations,
} from "./mutation-prompts.ts";

// Evolution engine
export type { EvolutionContext } from "./evolution-engine.ts";
export { MetaEvolutionEngine, runMetaEvolution } from "./evolution-engine.ts";

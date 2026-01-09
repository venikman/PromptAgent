/**
 * Meta-Evolution Types
 *
 * Based on PromptBreeder (ICML 2024): "Self-Referential Self-Improvement"
 * https://openreview.net/forum?id=HKkiX32Zw1
 *
 * Key insight: Evolve not just task-prompts, but also the mutation-prompts
 * that generate improvements to task-prompts.
 */

// ═══════════════════════════════════════════════════════════════
// MUTATION OPERATORS
// ═══════════════════════════════════════════════════════════════

/**
 * Types of mutation operators (from PromptBreeder paper).
 */
export type MutationType =
  | "DIRECT_MUTATION"      // LLM directly mutates the task-prompt
  | "EDA_MUTATION"         // Estimation of Distribution Algorithm style
  | "HYPERMUTATION"        // Mutate the mutation-prompt itself
  | "LAMARCKIAN"           // Working solution feeds back into mutation
  | "CROSSOVER"            // Combine elements from two prompts
  | "ZERO_ORDER_HYPER";    // Create new mutation-prompts from scratch

/**
 * A mutation prompt that can generate task-prompt improvements.
 */
export interface MutationPrompt {
  /** Unique identifier */
  id: string;
  /** The mutation prompt text */
  text: string;
  /** Type of mutation this prompt performs */
  type: MutationType;
  /** Fitness score (average improvement achieved) */
  fitness: number;
  /** Number of times this mutation has been applied */
  usageCount: number;
  /** Success rate (improvements / applications) */
  successRate: number;
  /** Generation when this mutation was created */
  generation: number;
  /** Parent mutation ID (if derived) */
  parentId?: string;
}

/**
 * A task prompt being evolved.
 */
export interface TaskPrompt {
  /** Unique identifier */
  id: string;
  /** Base prompt (immutable) */
  base: string;
  /** Evolved patch section */
  patch: string;
  /** Fitness score from evaluation */
  fitness: number;
  /** Generation when this was created */
  generation: number;
  /** Which mutation prompt generated this */
  mutationId?: string;
  /** Parent task prompt ID */
  parentId?: string;
}

// ═══════════════════════════════════════════════════════════════
// POPULATION
// ═══════════════════════════════════════════════════════════════

/**
 * Population of evolving prompts.
 */
export interface Population {
  /** Task prompts being evolved */
  taskPrompts: TaskPrompt[];
  /** Mutation prompts (meta-level evolution) */
  mutationPrompts: MutationPrompt[];
  /** Current generation number */
  generation: number;
  /** Best fitness achieved so far */
  bestFitness: number;
  /** ID of the best task prompt */
  bestTaskPromptId: string;
}

/**
 * Result of a mutation operation.
 */
export interface MutationResult {
  /** The new task prompt (or null if mutation failed) */
  newPrompt: TaskPrompt | null;
  /** The mutation prompt that was used */
  mutationUsed: MutationPrompt;
  /** Whether the mutation improved fitness */
  improved: boolean;
  /** Fitness delta (new - parent) */
  fitnessDelta: number;
}

/**
 * Result of a hypermutation (mutation of mutation-prompts).
 */
export interface HypermutationResult {
  /** The new mutation prompt */
  newMutation: MutationPrompt;
  /** The parent mutation that was evolved */
  parentMutation: MutationPrompt;
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

/**
 * Meta-evolution configuration.
 */
export interface MetaEvolutionConfig {
  /** Population size for task prompts */
  taskPopulationSize: number;
  /** Population size for mutation prompts */
  mutationPopulationSize: number;
  /** Probability of hypermutation (evolving mutation-prompts) */
  hypermutationRate: number;
  /** Probability of crossover between task prompts */
  crossoverRate: number;
  /** Tournament size for selection */
  tournamentSize: number;
  /** Elite count (top prompts preserved each generation) */
  eliteCount: number;
  /** Generations before declaring convergence */
  maxGenerations: number;
  /** Fitness improvement threshold for success */
  improvementThreshold: number;
}

/**
 * Default configuration values.
 */
export const DEFAULT_META_CONFIG: MetaEvolutionConfig = {
  taskPopulationSize: 8,
  mutationPopulationSize: 4,
  hypermutationRate: 0.1,   // 10% chance to evolve mutation-prompts
  crossoverRate: 0.2,       // 20% chance of crossover
  tournamentSize: 3,
  eliteCount: 2,
  maxGenerations: 20,
  improvementThreshold: 0.01,
};

// ═══════════════════════════════════════════════════════════════
// TELEMETRY
// ═══════════════════════════════════════════════════════════════

/**
 * Per-generation statistics.
 */
export interface GenerationStats {
  generation: number;
  bestFitness: number;
  meanFitness: number;
  fitnessStd: number;
  mutationsApplied: number;
  successfulMutations: number;
  hypermutations: number;
  crossovers: number;
  elitePreserved: number;
  bestMutationId: string;
  duration: number;
}

/**
 * Full evolution telemetry.
 */
export interface EvolutionTelemetry {
  config: MetaEvolutionConfig;
  generations: GenerationStats[];
  finalBestFitness: number;
  finalBestPrompt: TaskPrompt;
  totalDuration: number;
  converged: boolean;
  convergenceGeneration?: number;
}

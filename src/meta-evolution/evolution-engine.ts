/**
 * Meta-Evolution Engine
 *
 * Implements PromptBreeder-style self-referential evolution:
 * 1. Evolve task-prompts using mutation-prompts
 * 2. Evolve mutation-prompts based on their success (hypermutation)
 * 3. Use fitness-proportional selection and elitism
 *
 * Key innovation: The system improves not just the prompts,
 * but also the prompts that generate improvements.
 */

import { Agent } from "npm:@mastra/core@0.24.9/agent";
import { makeJudgeModel } from "../models.ts";
import { composePrompt } from "../patchEngineer.ts";
import {
  type MutationPrompt,
  type TaskPrompt,
  type Population,
  type MutationResult,
  type HypermutationResult,
  type MetaEvolutionConfig,
  type GenerationStats,
  type EvolutionTelemetry,
  DEFAULT_META_CONFIG,
} from "./types.ts";
import {
  createSeedMutationPrompts,
  selectMutationByFitness,
  selectEliteMutations,
  getMutationsByType,
} from "./mutation-prompts.ts";

// ═══════════════════════════════════════════════════════════════
// META-EVOLUTION AGENT
// ═══════════════════════════════════════════════════════════════

const metaAgent = new Agent({
  id: "meta-evolution-agent",
  name: "Meta Evolution Agent",
  instructions: `You are a meta-optimization agent that improves prompts and the prompts that improve prompts.
Follow the mutation prompt instructions exactly. Output ONLY what is requested, no explanations.`,
  model: makeJudgeModel(),
});

// ═══════════════════════════════════════════════════════════════
// MUTATION EXECUTION
// ═══════════════════════════════════════════════════════════════

/**
 * Apply a mutation prompt to generate a new task-prompt patch.
 */
async function applyMutation(
  mutation: MutationPrompt,
  taskPrompt: TaskPrompt,
  context: {
    pairsContext?: string;
    workingExample?: string;
  }
): Promise<string | null> {
  let prompt = mutation.text;

  // Substitute placeholders based on mutation type
  if (mutation.type === "LAMARCKIAN" && context.workingExample) {
    prompt = `${prompt}\n\nWorking example:\n${context.workingExample}`;
  }

  // Add task context
  const fullPrompt = `
## CURRENT PROMPT
Base: ${taskPrompt.base.slice(0, 500)}...
Patch: ${taskPrompt.patch || "(none)"}

${context.pairsContext ? `## CONTRASTIVE PAIRS\n${context.pairsContext.slice(0, 2000)}` : ""}

## MUTATION TASK
${prompt}
`.trim();

  try {
    const response = await metaAgent.generate(fullPrompt, {
      modelSettings: {
        temperature: 0.7,
        maxOutputTokens: 512,
      },
    });

    const result = response.text?.trim();
    if (!result || result.length < 10) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Apply hypermutation to evolve a mutation prompt.
 */
async function applyHypermutation(
  hyperMutation: MutationPrompt,
  targetMutation: MutationPrompt
): Promise<string | null> {
  let prompt = hyperMutation.text;

  // Substitute placeholders
  prompt = prompt
    .replace("{MUTATION_PROMPT}", targetMutation.text)
    .replace("{SUCCESS_RATE}", (targetMutation.successRate * 100).toFixed(0))
    .replace("{USAGE_COUNT}", String(targetMutation.usageCount));

  try {
    const response = await metaAgent.generate(prompt, {
      modelSettings: {
        temperature: 0.8, // Higher temp for meta-creativity
        maxOutputTokens: 512,
      },
    });

    const result = response.text?.trim();
    if (!result || result.length < 20) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Apply crossover between two task prompts.
 */
async function applyCrossover(
  crossoverMutation: MutationPrompt,
  parentA: TaskPrompt,
  parentB: TaskPrompt
): Promise<string | null> {
  let prompt = crossoverMutation.text;

  prompt = prompt
    .replace("{PATCH_A}", parentA.patch || "(none)")
    .replace("{PATCH_B}", parentB.patch || "(none)")
    .replace("{FITNESS_A}", parentA.fitness.toFixed(3))
    .replace("{FITNESS_B}", parentB.fitness.toFixed(3));

  try {
    const response = await metaAgent.generate(prompt, {
      modelSettings: {
        temperature: 0.6,
        maxOutputTokens: 512,
      },
    });

    const result = response.text?.trim();
    if (!result || result.length < 10) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// EVOLUTION ENGINE
// ═══════════════════════════════════════════════════════════════

export interface EvolutionContext {
  /** Function to evaluate a task prompt's fitness */
  evaluateFitness: (prompt: TaskPrompt) => Promise<number>;
  /** Contrastive pairs context for mutations */
  pairsContext?: string;
  /** Working example (high-scoring output) for Lamarckian mutations */
  workingExample?: string;
  /** Progress callback */
  onProgress?: (generation: number, bestFitness: number) => void;
}

/**
 * Meta-Evolution Engine class.
 */
export class MetaEvolutionEngine {
  private config: MetaEvolutionConfig;
  private population: Population;

  constructor(
    basePrompt: string,
    initialPatch: string = "",
    config: Partial<MetaEvolutionConfig> = {}
  ) {
    this.config = { ...DEFAULT_META_CONFIG, ...config };

    // Initialize population
    const seedTask: TaskPrompt = {
      id: "task-0",
      base: basePrompt,
      patch: initialPatch,
      fitness: 0,
      generation: 0,
    };

    this.population = {
      taskPrompts: [seedTask],
      mutationPrompts: createSeedMutationPrompts(),
      generation: 0,
      bestFitness: 0,
      bestTaskPromptId: seedTask.id,
    };
  }

  /**
   * Run the meta-evolution loop.
   */
  async evolve(context: EvolutionContext): Promise<EvolutionTelemetry> {
    const startTime = Date.now();
    const generationStats: GenerationStats[] = [];
    let converged = false;
    let convergenceGeneration: number | undefined;
    let stagnationCount = 0;

    // Evaluate initial population
    for (const task of this.population.taskPrompts) {
      task.fitness = await context.evaluateFitness(task);
    }
    this.updateBest();

    // Evolution loop
    for (let gen = 1; gen <= this.config.maxGenerations; gen++) {
      const genStart = Date.now();
      this.population.generation = gen;

      const stats = await this.runGeneration(context);
      stats.generation = gen;
      stats.duration = Date.now() - genStart;
      generationStats.push(stats);

      context.onProgress?.(gen, this.population.bestFitness);

      // Check for convergence (no improvement for 3 generations)
      if (stats.successfulMutations === 0) {
        stagnationCount++;
        if (stagnationCount >= 3) {
          converged = true;
          convergenceGeneration = gen;
          break;
        }
      } else {
        stagnationCount = 0;
      }
    }

    const bestPrompt = this.population.taskPrompts.find(
      (t) => t.id === this.population.bestTaskPromptId
    )!;

    return {
      config: this.config,
      generations: generationStats,
      finalBestFitness: this.population.bestFitness,
      finalBestPrompt: bestPrompt,
      totalDuration: Date.now() - startTime,
      converged,
      convergenceGeneration,
    };
  }

  /**
   * Run a single generation of evolution.
   */
  private async runGeneration(context: EvolutionContext): Promise<GenerationStats> {
    let mutationsApplied = 0;
    let successfulMutations = 0;
    let hypermutations = 0;
    let crossovers = 0;

    const newTaskPrompts: TaskPrompt[] = [];

    // Elitism: preserve top performers
    const elite = this.selectEliteTaskPrompts();
    newTaskPrompts.push(...elite);

    // Generate new task prompts through mutation
    while (newTaskPrompts.length < this.config.taskPopulationSize) {
      // Select parent task prompt (tournament selection)
      const parent = this.tournamentSelect();

      // Decide operation: crossover or mutation
      if (
        Math.random() < this.config.crossoverRate &&
        this.population.taskPrompts.length > 1
      ) {
        // Crossover
        const otherParent = this.tournamentSelect([parent.id]);
        const crossoverMutation = getMutationsByType(
          this.population.mutationPrompts,
          "CROSSOVER"
        )[0];

        if (crossoverMutation) {
          const newPatch = await applyCrossover(
            crossoverMutation,
            parent,
            otherParent
          );

          if (newPatch) {
            const newTask = this.createTaskPrompt(parent, newPatch, crossoverMutation.id);
            newTask.fitness = await context.evaluateFitness(newTask);
            newTaskPrompts.push(newTask);
            crossovers++;

            // Update crossover mutation fitness
            this.updateMutationFitness(
              crossoverMutation,
              newTask.fitness > Math.max(parent.fitness, otherParent.fitness)
            );
          }
        }
      } else {
        // Standard mutation
        const mutation = selectMutationByFitness(this.population.mutationPrompts);
        const newPatch = await applyMutation(mutation, parent, context);

        if (newPatch) {
          const newTask = this.createTaskPrompt(parent, newPatch, mutation.id);
          newTask.fitness = await context.evaluateFitness(newTask);
          newTaskPrompts.push(newTask);
          mutationsApplied++;

          const improved = newTask.fitness > parent.fitness + this.config.improvementThreshold;
          if (improved) {
            successfulMutations++;
          }

          // Update mutation fitness
          this.updateMutationFitness(mutation, improved);
        }
      }
    }

    // Hypermutation: evolve mutation prompts
    if (Math.random() < this.config.hypermutationRate) {
      await this.runHypermutation();
      hypermutations++;
    }

    // Replace population
    this.population.taskPrompts = newTaskPrompts.slice(0, this.config.taskPopulationSize);
    this.updateBest();

    // Calculate stats
    const fitnesses = this.population.taskPrompts.map((t) => t.fitness);
    const meanFitness = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;
    const fitnessStd = Math.sqrt(
      fitnesses.reduce((sum, f) => sum + (f - meanFitness) ** 2, 0) / fitnesses.length
    );

    const bestMutation = selectEliteMutations(this.population.mutationPrompts, 1)[0];

    return {
      generation: this.population.generation,
      bestFitness: this.population.bestFitness,
      meanFitness,
      fitnessStd,
      mutationsApplied,
      successfulMutations,
      hypermutations,
      crossovers,
      elitePreserved: elite.length,
      bestMutationId: bestMutation?.id ?? "",
      duration: 0, // Set by caller
    };
  }

  /**
   * Run hypermutation to evolve mutation prompts.
   */
  private async runHypermutation(): Promise<void> {
    const hyperMutations = getMutationsByType(
      this.population.mutationPrompts,
      "HYPERMUTATION"
    );

    if (hyperMutations.length === 0) return;

    // Select a low-performing mutation to improve
    const sortedMutations = [...this.population.mutationPrompts]
      .filter((m) => m.type !== "HYPERMUTATION" && m.type !== "ZERO_ORDER_HYPER")
      .sort((a, b) => a.fitness - b.fitness);

    const targetMutation = sortedMutations[0];
    if (!targetMutation) return;

    const hyperMutation = hyperMutations[Math.floor(Math.random() * hyperMutations.length)]!;
    const newMutationText = await applyHypermutation(hyperMutation, targetMutation);

    if (newMutationText) {
      // Create evolved mutation
      const evolvedMutation: MutationPrompt = {
        id: `mutation-evolved-${Date.now()}`,
        text: newMutationText,
        type: targetMutation.type,
        fitness: 0.5, // Start neutral
        usageCount: 0,
        successRate: 0.5,
        generation: this.population.generation,
        parentId: targetMutation.id,
      };

      // Replace the worst mutation
      const worstIdx = this.population.mutationPrompts.findIndex(
        (m) => m.id === sortedMutations[0]?.id
      );
      if (worstIdx >= 0) {
        this.population.mutationPrompts[worstIdx] = evolvedMutation;
      }
    }
  }

  /**
   * Tournament selection for task prompts.
   */
  private tournamentSelect(excludeIds: string[] = []): TaskPrompt {
    const eligible = this.population.taskPrompts.filter(
      (t) => !excludeIds.includes(t.id)
    );

    if (eligible.length === 0) {
      return this.population.taskPrompts[0]!;
    }

    // Random tournament
    const tournamentSize = Math.min(this.config.tournamentSize, eligible.length);
    const tournament: TaskPrompt[] = [];

    for (let i = 0; i < tournamentSize; i++) {
      const idx = Math.floor(Math.random() * eligible.length);
      tournament.push(eligible[idx]!);
    }

    return tournament.sort((a, b) => b.fitness - a.fitness)[0]!;
  }

  /**
   * Select elite task prompts.
   */
  private selectEliteTaskPrompts(): TaskPrompt[] {
    return [...this.population.taskPrompts]
      .sort((a, b) => b.fitness - a.fitness)
      .slice(0, this.config.eliteCount);
  }

  /**
   * Create a new task prompt from parent with new patch.
   */
  private createTaskPrompt(
    parent: TaskPrompt,
    patch: string,
    mutationId: string
  ): TaskPrompt {
    return {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      base: parent.base,
      patch,
      fitness: 0,
      generation: this.population.generation,
      mutationId,
      parentId: parent.id,
    };
  }

  /**
   * Update mutation fitness based on success.
   */
  private updateMutationFitness(mutation: MutationPrompt, success: boolean): void {
    mutation.usageCount++;
    // Exponential moving average for success rate
    const alpha = 0.3;
    mutation.successRate = alpha * (success ? 1 : 0) + (1 - alpha) * mutation.successRate;
    mutation.fitness = mutation.successRate;
  }

  /**
   * Update best task prompt tracking.
   */
  private updateBest(): void {
    for (const task of this.population.taskPrompts) {
      if (task.fitness > this.population.bestFitness) {
        this.population.bestFitness = task.fitness;
        this.population.bestTaskPromptId = task.id;
      }
    }
  }

  /**
   * Get current best task prompt.
   */
  getBestPrompt(): TaskPrompt | undefined {
    return this.population.taskPrompts.find(
      (t) => t.id === this.population.bestTaskPromptId
    );
  }

  /**
   * Get population snapshot.
   */
  getPopulation(): Population {
    return { ...this.population };
  }
}

// ═══════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Run meta-evolution on a prompt.
 */
export async function runMetaEvolution(
  basePrompt: string,
  initialPatch: string,
  evaluateFitness: (prompt: TaskPrompt) => Promise<number>,
  config?: Partial<MetaEvolutionConfig>,
  options?: {
    pairsContext?: string;
    workingExample?: string;
    onProgress?: (generation: number, bestFitness: number) => void;
  }
): Promise<EvolutionTelemetry> {
  const engine = new MetaEvolutionEngine(basePrompt, initialPatch, config);
  return engine.evolve({
    evaluateFitness,
    pairsContext: options?.pairsContext,
    workingExample: options?.workingExample,
    onProgress: options?.onProgress,
  });
}

/**
 * Root Orchestrator
 *
 * Main entry point for all PromptAgent workflows.
 * Implements Google's hybrid pattern: deterministic routing
 * with LLM-ready hooks for future conversational interface.
 *
 * Workflows:
 * - Playground: Single epic generation + scoring
 * - Evaluate: Distributional evaluation of a prompt
 * - Optimize: Full champion/challenger evolution loop
 */

import { env } from "../config.ts";
import type { Epic, StoryPack } from "../schema.ts";
import { generateStoryPack } from "../generator.ts";
import { createStoryDecompositionScorer } from "../scorer.ts";
import {
  type OptimizationConfig,
  type OptimizationState,
  type PlaygroundResult,
  type EvaluatorInput,
  type EvaluatorOutput,
  type ChampionPrompt,
  type IterationResult,
  createToolContext,
  createInitialState,
  composePrompt,
} from "./types.ts";
import { executeEvaluator } from "./tools/evaluator-tool.ts";
import { OptimizationLoopAgent } from "./optimization-loop.ts";

// ─────────────────────────────────────────────────
// Orchestrator Configuration
// ─────────────────────────────────────────────────

export interface OrchestratorConfig {
  /** Available epics for evaluation */
  epics: Epic[];
  /** Current champion prompt */
  champion: ChampionPrompt;
}

// ─────────────────────────────────────────────────
// Root Orchestrator
// ─────────────────────────────────────────────────

export class Orchestrator {
  private config: OrchestratorConfig;

  constructor(config: OrchestratorConfig) {
    this.config = config;
  }

  // ─────────────────────────────────────────────────
  // Playground Flow (Single Generation)
  // ─────────────────────────────────────────────────

  /**
   * Generate stories for a single epic with optional prompt override.
   * Includes scoring and gate decision.
   */
  async runPlayground(
    epicId: string,
    options?: {
      promptOverride?: string;
      seed?: number;
      temperature?: number;
    }
  ): Promise<PlaygroundResult> {
    const epic = this.config.epics.find((e) => e.id === epicId);
    if (!epic) {
      throw new Error(`Epic not found: ${epicId}`);
    }

    const prompt =
      options?.promptOverride ??
      composePrompt(this.config.champion.base, this.config.champion.patch);

    const result = await generateStoryPack(epic, prompt, {
      seed: options?.seed,
      temperature: options?.temperature ?? env.GEN_TEMPERATURE,
      maxTokens: env.GEN_MAX_TOKENS,
    });

    // Score the result if generation succeeded
    let scoreResult: { score: number; reason?: string } | null = null;
    if (result.storyPack && !result.error) {
      try {
        const scorer = createStoryDecompositionScorer();
        const scored = await scorer.run({
          input: epic,
          output: {
            storyPack: result.storyPack,
            rawText: result.rawText,
            trace: result.trace ?? undefined,
            gammaTime: result.gammaTime,
            instructions: result.instructions,
          },
        });
        scoreResult = { score: scored.score, reason: scored.reason };
      } catch {
        // Scoring failed - return without score
      }
    }

    return {
      generation: {
        storyPack: result.storyPack,
        rawText: result.rawText,
        error: result.error,
      },
      score: scoreResult,
    };
  }

  // ─────────────────────────────────────────────────
  // Evaluation Flow (Distributional)
  // ─────────────────────────────────────────────────

  /**
   * Run distributional evaluation on a prompt.
   * Returns detailed per-epic and aggregate metrics.
   */
  async runEvaluation(
    params: Partial<EvaluatorInput> & { promptText?: string }
  ): Promise<EvaluatorOutput> {
    const ctx = createToolContext();

    const promptText =
      params.promptText ??
      composePrompt(this.config.champion.base, this.config.champion.patch);

    const result = await executeEvaluator(
      {
        promptText,
        epics: params.epics ?? this.config.epics,
        replicates: params.replicates ?? env.EVAL_REPLICATES,
        seedBase: params.seedBase ?? env.EVAL_SEED_BASE,
        concurrency: params.concurrency ?? env.OPT_CONCURRENCY,
        onProgress: params.onProgress,
      },
      ctx
    );

    if (!result.success) {
      throw new Error(result.error ?? "Evaluation failed");
    }

    return result.data!;
  }

  // ─────────────────────────────────────────────────
  // Optimization Flow (Full Loop)
  // ─────────────────────────────────────────────────

  /**
   * Run full optimization loop with tournament selection.
   */
  async runOptimization(
    config?: Partial<OptimizationConfig>,
    callbacks?: {
      onIterationStart?: (iteration: number) => void;
      onIterationEnd?: (result: IterationResult) => void;
      onProgress?: (completed: number, total: number) => void;
    }
  ): Promise<OptimizationState> {
    const loopAgent = new OptimizationLoopAgent(
      {
        maxIterations: config?.maxIterations ?? env.OPT_ITERATIONS,
        promotionThreshold: config?.promotionThreshold ?? env.OPT_PROMOTION_THRESHOLD,
        replicates: config?.replicates ?? env.EVAL_REPLICATES,
        patchCandidates: config?.patchCandidates ?? env.OPT_PATCH_CANDIDATES,
        concurrency: config?.concurrency ?? env.OPT_CONCURRENCY,
        onIterationStart: callbacks?.onIterationStart,
        onIterationEnd: callbacks?.onIterationEnd,
        onProgress: callbacks?.onProgress,
      },
      this.config.epics
    );

    const initialState = createInitialState(this.config.champion);

    return loopAgent.execute(initialState);
  }

  /**
   * Resume optimization from a saved state.
   */
  async resumeOptimization(
    state: OptimizationState,
    config?: Partial<OptimizationConfig>,
    callbacks?: {
      onIterationStart?: (iteration: number) => void;
      onIterationEnd?: (result: IterationResult) => void;
      onProgress?: (completed: number, total: number) => void;
    }
  ): Promise<OptimizationState> {
    // Reset continuation flags
    state.shouldContinue = true;
    state.completedAt = undefined;

    const loopAgent = new OptimizationLoopAgent(
      {
        maxIterations: config?.maxIterations ?? env.OPT_ITERATIONS,
        promotionThreshold: config?.promotionThreshold ?? env.OPT_PROMOTION_THRESHOLD,
        replicates: config?.replicates ?? env.EVAL_REPLICATES,
        patchCandidates: config?.patchCandidates ?? env.OPT_PATCH_CANDIDATES,
        concurrency: config?.concurrency ?? env.OPT_CONCURRENCY,
        onIterationStart: callbacks?.onIterationStart,
        onIterationEnd: callbacks?.onIterationEnd,
        onProgress: callbacks?.onProgress,
      },
      this.config.epics
    );

    return loopAgent.execute(state);
  }

  // ─────────────────────────────────────────────────
  // Getters / State
  // ─────────────────────────────────────────────────

  /**
   * Get the current champion prompt.
   */
  getChampion(): ChampionPrompt {
    return { ...this.config.champion };
  }

  /**
   * Update the champion prompt.
   */
  updateChampion(champion: ChampionPrompt): void {
    this.config.champion = { ...champion };
  }

  /**
   * Get the list of available epics.
   */
  getEpics(): Epic[] {
    return [...this.config.epics];
  }

  /**
   * Get composed champion prompt.
   */
  getComposedPrompt(): string {
    return composePrompt(this.config.champion.base, this.config.champion.patch);
  }
}

// ─────────────────────────────────────────────────
// Factory Function
// ─────────────────────────────────────────────────

/**
 * Create an orchestrator with the given configuration.
 */
export function createOrchestrator(config: OrchestratorConfig): Orchestrator {
  return new Orchestrator(config);
}

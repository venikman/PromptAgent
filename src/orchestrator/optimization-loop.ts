/**
 * Optimization Loop Agent
 *
 * Implements Google's LoopAgent pattern for prompt optimization.
 * Each iteration uses Agent-as-Tool pattern for state isolation.
 *
 * The loop:
 * 1. Evaluate current champion
 * 2. Mine contrastive pairs
 * 3. Generate patch candidates
 * 4. Tournament: evaluate candidates
 * 5. Promote best if improvement exceeds threshold
 */

import { env } from "../config.ts";
import type { Epic } from "../schema.ts";
import {
  type OptimizationConfig,
  type OptimizationState,
  type IterationResult,
  type TournamentCandidate,
  createToolContext,
  createInitialState,
  composePrompt,
} from "./types.ts";
import { executeEvaluator } from "./tools/evaluator-tool.ts";
import { executePairMiner, hasPairs } from "./tools/pair-miner-tool.ts";
import { executePatcher, hasCandidates } from "./tools/patcher-tool.ts";
import { saveCheckpoint } from "./state/kv-store.ts";
import {
  runNQDTournament,
  type NQDTournamentCandidate,
  type NQDTournamentResult,
} from "./nqd-tournament.ts";

// ─────────────────────────────────────────────────
// Default Configuration
// ─────────────────────────────────────────────────

function defaultConfig(
  overrides: Partial<OptimizationConfig> = {},
): OptimizationConfig {
  return {
    maxIterations: overrides.maxIterations ?? env.OPT_ITERATIONS,
    promotionThreshold:
      overrides.promotionThreshold ?? env.OPT_PROMOTION_THRESHOLD,
    replicates: overrides.replicates ?? env.EVAL_REPLICATES,
    patchCandidates: overrides.patchCandidates ?? env.OPT_PATCH_CANDIDATES,
    concurrency: overrides.concurrency ?? env.OPT_CONCURRENCY,
    onIterationStart: overrides.onIterationStart,
    onIterationEnd: overrides.onIterationEnd,
    onProgress: overrides.onProgress,
  };
}

// ─────────────────────────────────────────────────
// Optimization Loop Agent
// ─────────────────────────────────────────────────

export class OptimizationLoopAgent {
  private config: OptimizationConfig;
  private epics: Epic[];
  private enableCheckpoints: boolean;

  constructor(
    config: Partial<OptimizationConfig>,
    epics: Epic[],
    options?: { enableCheckpoints?: boolean },
  ) {
    this.config = defaultConfig(config);
    this.epics = epics;
    this.enableCheckpoints = options?.enableCheckpoints ?? true;
  }

  /**
   * Execute the optimization loop.
   *
   * Can resume from a previous state if provided.
   */
  async execute(initialState?: OptimizationState): Promise<OptimizationState> {
    let state = initialState ?? createInitialState({ base: "", patch: "" });

    // If no champion objective yet, do initial evaluation
    if (state.championObjective === 0 && state.iteration === 0) {
      const initialEval = await this.evaluateChampion(state);
      if (initialEval) {
        state.championObjective = initialEval;
      }
    }

    while (
      state.iteration < this.config.maxIterations &&
      state.shouldContinue
    ) {
      state.iteration++;
      this.config.onIterationStart?.(state.iteration);

      const iterationResult = await this.runIteration(state);
      state.history.push(iterationResult);

      // Apply promotion if successful
      if (
        iterationResult.promoted &&
        iterationResult.bestCandidateObjective > 0
      ) {
        state.championObjective = iterationResult.bestCandidateObjective;
      }

      // Checkpoint after each iteration
      if (this.enableCheckpoints) {
        await saveCheckpoint(state.sessionId, state);
      }

      this.config.onIterationEnd?.(iterationResult);

      // Check for convergence (no pairs found)
      if (iterationResult.pairsFound === 0) {
        state.shouldContinue = false;
      }
    }

    state.completedAt = new Date().toISOString();
    return state;
  }

  /**
   * Run a single optimization iteration.
   */
  private async runIteration(
    state: OptimizationState,
  ): Promise<IterationResult> {
    const iterationStart = Date.now();
    const ctx = createToolContext();

    const result: IterationResult = {
      iteration: state.iteration,
      pairsFound: 0,
      candidatesGenerated: 0,
      bestCandidateObjective: state.championObjective,
      championObjective: state.championObjective,
      promoted: false,
      duration: 0,
    };

    try {
      // Step 1: Evaluate current champion
      const composedPrompt = composePrompt(
        state.championPrompt.base,
        state.championPrompt.patch,
      );

      const evalResult = await executeEvaluator(
        {
          promptText: composedPrompt,
          epics: this.epics,
          replicates: this.config.replicates,
          seedBase: env.EVAL_SEED_BASE + state.iteration * 1000,
          concurrency: this.config.concurrency,
          onProgress: this.config.onProgress,
        },
        ctx,
      );

      if (!evalResult.success) {
        result.error = evalResult.error;
        result.duration = Date.now() - iterationStart;
        return result;
      }

      // Update champion objective from evaluation
      state.championObjective = evalResult.data!.report.agg.objective;
      result.championObjective = state.championObjective;

      // Step 2: Mine contrastive pairs
      const pairsCtx = createToolContext(ctx.runId);
      const pairsResult = await executePairMiner(
        {
          runs: evalResult.data!.flatRuns,
          minSim: env.PAIR_MIN_SIM,
          minDelta: env.PAIR_MIN_DELTA,
          maxPairs: env.PAIR_MAX_PAIRS,
        },
        pairsCtx,
      );

      if (!hasPairs(pairsResult)) {
        // No pairs = converged, no improvement signal
        result.pairsFound = 0;
        result.duration = Date.now() - iterationStart;
        return result;
      }

      result.pairsFound = pairsResult.data!.length;

      // Step 3: Generate patch candidates
      const patchCtx = createToolContext(ctx.runId);
      const patchResult = await executePatcher(
        {
          basePrompt: state.championPrompt.base,
          currentPatch: state.championPrompt.patch,
          pairs: pairsResult.data!,
          candidateCount: this.config.patchCandidates,
          temperature: env.OPT_PATCH_TEMPERATURE,
        },
        patchCtx,
      );

      if (!hasCandidates(patchResult)) {
        result.duration = Date.now() - iterationStart;
        return result;
      }

      result.candidatesGenerated = patchResult.data!.length;

      // Step 4: Tournament - evaluate all candidates
      const championPromptText = composePrompt(
        state.championPrompt.base,
        state.championPrompt.patch,
      );
      const tournamentResult = await this.runTournament(
        state.championPrompt.base,
        patchResult.data!,
        state.championObjective,
        championPromptText,
      );

      if (tournamentResult.candidates.length === 0) {
        result.duration = Date.now() - iterationStart;
        return result;
      }

      // Extract NQD telemetry if available
      if (tournamentResult.nqdResult) {
        result.illumination = tournamentResult.nqdResult.archive.illumination;
        result.paretoFrontSize =
          tournamentResult.nqdResult.archive.paretoFront.stats.frontSize;
        result.nqdChangedWinner = tournamentResult.nqdResult.nqdChangedWinner;
        result.ineligibleCount =
          tournamentResult.nqdResult.archive.paretoFront.stats.ineligibleCount;
      }

      // Find best candidate (from NQD winner or simple sort)
      const best = tournamentResult.winner ?? tournamentResult.candidates[0]!;
      result.bestCandidateObjective = best.objective;

      // Step 5: Promotion decision
      const improvement = best.objective - state.championObjective;
      if (improvement > this.config.promotionThreshold) {
        state.championPrompt.patch = best.patch;
        result.promoted = true;
      }

      result.duration = Date.now() - iterationStart;
      return result;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      result.duration = Date.now() - iterationStart;
      return result;
    }
  }

  /**
   * Evaluate the current champion prompt.
   */
  private async evaluateChampion(
    state: OptimizationState,
  ): Promise<number | null> {
    const ctx = createToolContext();
    const composedPrompt = composePrompt(
      state.championPrompt.base,
      state.championPrompt.patch,
    );

    const result = await executeEvaluator(
      {
        promptText: composedPrompt,
        epics: this.epics,
        replicates: this.config.replicates,
        seedBase: env.EVAL_SEED_BASE,
        concurrency: this.config.concurrency,
        onProgress: this.config.onProgress,
      },
      ctx,
    );

    if (!result.success) {
      return null;
    }

    return result.data!.report.agg.objective;
  }

  /**
   * Run tournament: evaluate all candidates and rank them.
   *
   * When NQD_ENABLED, uses multi-objective Pareto selection (FPF C.18).
   * Otherwise, uses simple objective sorting.
   */
  private async runTournament(
    basePrompt: string,
    patches: string[],
    championObjective: number,
    championPromptText: string,
  ): Promise<TournamentResult> {
    const candidates: NQDTournamentCandidate[] = [];

    // Evaluate each candidate
    for (let i = 0; i < patches.length; i++) {
      const patch = patches[i]!;
      const ctx = createToolContext();

      const composedPrompt = composePrompt(basePrompt, patch);
      const result = await executeEvaluator(
        {
          promptText: composedPrompt,
          epics: this.epics,
          replicates: this.config.replicates,
          seedBase: env.EVAL_SEED_BASE,
          concurrency: this.config.concurrency,
        },
        ctx,
      );

      const objective = result.success ? result.data!.report.agg.objective : 0;
      const passRate = result.success
        ? result.data!.report.agg.meanPassRate
        : 0;

      candidates.push({
        id: `candidate-${i}`,
        patch,
        objective,
        isChampion: false,
        deltaVsChampion: objective - championObjective,
        // NQD-required fields
        promptText: composedPrompt,
        passRate,
        schemaValid: passRate > 0,
      });
    }

    // Apply NQD selection if enabled, otherwise simple sort
    if (env.NQD_ENABLED) {
      const nqdResult = runNQDTournament(candidates, {
        championObjective,
        championPrompt: championPromptText,
        constraintFitThreshold: env.NQD_CONSTRAINT_FIT_THRESHOLD,
      });

      return {
        candidates: nqdResult.candidates,
        winner: nqdResult.winner,
        nqdResult,
      };
    }

    // Fallback: simple objective sort
    candidates.sort((a, b) => b.objective - a.objective);

    return {
      candidates,
      winner: candidates[0] ?? null,
      nqdResult: null,
    };
  }
}

/**
 * Internal tournament result type.
 */
interface TournamentResult {
  candidates: NQDTournamentCandidate[];
  winner: NQDTournamentCandidate | null;
  nqdResult: NQDTournamentResult | null;
}

// ─────────────────────────────────────────────────
// Factory Function
// ─────────────────────────────────────────────────

/**
 * Create and execute an optimization loop.
 */
export async function runOptimizationLoop(
  epics: Epic[],
  champion: { base: string; patch: string },
  config?: Partial<OptimizationConfig>,
  options?: { enableCheckpoints?: boolean },
): Promise<OptimizationState> {
  const agent = new OptimizationLoopAgent(config ?? {}, epics, options);
  const initialState = createInitialState(champion);
  return agent.execute(initialState);
}

/**
 * Resume an optimization loop from a checkpoint.
 */
export async function resumeOptimizationLoop(
  epics: Epic[],
  state: OptimizationState,
  config?: Partial<OptimizationConfig>,
): Promise<OptimizationState> {
  // Reset shouldContinue to allow continuation
  state.shouldContinue = true;
  state.completedAt = undefined;

  const agent = new OptimizationLoopAgent(config ?? {}, epics);
  return agent.execute(state);
}

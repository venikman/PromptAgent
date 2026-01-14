/**
 * Distributional Evaluation for Prompt Optimization
 *
 * Instead of evaluating a prompt by a single run per epic, we run each epic
 * R times with different seeds and compute:
 *   - passRate: fraction of runs that pass QA checks
 *   - meanScore: average quality score
 *   - p10Score: 10th percentile (worst-case quality)
 *   - stdScore: standard deviation (consistency)
 *   - discoverability: P(pass within K tries)
 *
 * This mirrors the paper's insight that "distribution captures discoverability"
 * and helps identify prompts that are reliably good vs "lucky once".
 */

import pLimit from "p-limit";
import { env } from "./config.ts";
import type { Epic, StoryPack } from "./schema.ts";
import { type GenerateResult, generateStoryPack } from "./generator.ts";
import { createStoryDecompositionScorer } from "./scorer.ts";

// ─────────────────────────────────────────────────
// Statistical Helpers
// ─────────────────────────────────────────────────

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  const variance = mean(xs.map((x) => (x - m) ** 2));
  return Math.sqrt(variance);
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(p * (sorted.length - 1))),
  );
  return sorted[idx]!;
}

/**
 * Approximate P(pass within K independent tries).
 * Under independence assumption: P(at least one pass) = 1 - (1-p)^k
 */
function approxDiscoverability(passRate: number, k: number): number {
  return 1 - Math.pow(1 - passRate, k);
}

// ─────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────

/** A single replicate run for one epic */
export type DistRun = {
  seed: number;
  score: number;
  pass: boolean;
  storyPack: StoryPack | null;
  rawText: string;
  error?: string;
};

/** Distribution stats for one epic across all replicates */
export type EpicDistResult = {
  epicId: string;
  runs: DistRun[];
  meanScore: number;
  p10Score: number;
  stdScore: number;
  passRate: number;
  discoverabilityK: number;
};

/** Aggregated report across all epics */
export type PromptDistReport = {
  promptId: string;
  perEpic: EpicDistResult[];
  agg: {
    meanOfMeans: number;
    meanPassRate: number;
    meanP10: number;
    meanStd: number;
    /** Composite objective for ranking prompts */
    objective: number;
  };
};

// ─────────────────────────────────────────────────
// Pass/Fail Logic
// ─────────────────────────────────────────────────

/**
 * Determines if a run "passes" based on schema validity.
 * A run passes if it produced a valid StoryPack (schema validation succeeded).
 *
 * Note: More sophisticated pass logic (e.g., checking QA coverage/hallucination)
 * can be added here if needed, but schema validity is the hard gate.
 */
function isPass(run: GenerateResult): boolean {
  return run.storyPack !== null && !run.error;
}

// ─────────────────────────────────────────────────
// Main Evaluation Function
// ─────────────────────────────────────────────────

export type EvalPromptDistributionParams = {
  promptId: string;
  promptText: string;
  epics: Epic[];
  /** Override number of replicates (default: env.EVAL_REPLICATES) */
  replicates?: number;
  /** Override base seed (default: env.EVAL_SEED_BASE) */
  seedBase?: number;
  /** Override max tokens per generation (default: env.GEN_MAX_TOKENS) */
  maxTokens?: number;
  /** Concurrency for parallel evaluation (default: env.OPT_CONCURRENCY) */
  concurrency?: number;
  /** Progress callback */
  onProgress?: (completed: number, total: number) => void;
};

export async function evalPromptDistribution(
  params: EvalPromptDistributionParams,
): Promise<PromptDistReport> {
  const replicates = params.replicates ?? env.EVAL_REPLICATES;
  const seedBase = params.seedBase ?? env.EVAL_SEED_BASE;
  const concurrency = params.concurrency ?? env.OPT_CONCURRENCY;

  const scorer = createStoryDecompositionScorer();
  const limit = pLimit(concurrency);

  const totalRuns = params.epics.length * replicates;
  let completedRuns = 0;

  const perEpic: EpicDistResult[] = [];

  for (const epic of params.epics) {
    const epicId = epic.id;

    // Run all replicates for this epic in parallel (respecting concurrency)
    const runPromises = Array.from({ length: replicates }, (_, i) => {
      const seed = seedBase + i;

      return limit(async (): Promise<DistRun> => {
        // Generate story pack with specific seed
        const gen = await generateStoryPack(epic, params.promptText, {
          seed,
          maxTokens: params.maxTokens,
        });

        let score = 0;
        if (gen.storyPack && !gen.error) {
          try {
            const scoreResult = await scorer.run({
              input: epic,
              output: {
                storyPack: gen.storyPack,
                rawText: gen.rawText,
                trace: gen.trace ?? undefined,
                gammaTime: gen.gammaTime,
                instructions: gen.instructions,
              },
            });
            score = scoreResult.score;
          } catch {
            // Scoring failed—treat as score=0 but pass=true if schema valid
            score = 0;
          }
        }

        completedRuns++;
        params.onProgress?.(completedRuns, totalRuns);

        return {
          seed,
          score,
          pass: isPass(gen),
          storyPack: gen.storyPack,
          rawText: gen.rawText,
          error: gen.error,
        };
      });
    });

    const runs = await Promise.all(runPromises);

    // Compute distribution statistics
    const scores = runs.map((r) => r.score);
    const passCount = runs.filter((r) => r.pass).length;
    const passRate = passCount / Math.max(1, runs.length);

    perEpic.push({
      epicId,
      runs,
      meanScore: mean(scores),
      p10Score: percentile(scores, 0.1),
      stdScore: std(scores),
      passRate,
      discoverabilityK: approxDiscoverability(
        passRate,
        env.DISCOVERABILITY_TRIES,
      ),
    });
  }

  // Aggregate across epics
  const meanOfMeans = mean(perEpic.map((e) => e.meanScore));
  const meanPassRate = mean(perEpic.map((e) => e.passRate));
  const meanP10 = mean(perEpic.map((e) => e.p10Score));
  const meanStd = mean(perEpic.map((e) => e.stdScore));

  // Composite objective: favor reliability + tail quality, penalize variance
  // Weights tuned for balance between "works reliably" and "works well"
  const objective = 0.45 * meanPassRate + // 45% weight on first-pass success
    0.35 * meanOfMeans + // 35% weight on average quality
    0.20 * meanP10 - // 20% weight on worst-case quality
    env.EVAL_STD_LAMBDA * meanStd - // Penalty for inconsistency
    env.EVAL_FAIL_PENALTY * (1 - meanPassRate); // Extra penalty for failures

  return {
    promptId: params.promptId,
    perEpic,
    agg: {
      meanOfMeans,
      meanPassRate,
      meanP10,
      meanStd,
      objective,
    },
  };
}

// ─────────────────────────────────────────────────
// Flatten helper for pair mining
// ─────────────────────────────────────────────────

export type FlatRun = {
  epicId: string;
  seed: number;
  score: number;
  pass: boolean;
  storyPack: StoryPack | null;
  rawText: string;
};

export function flattenDistReport(report: PromptDistReport): FlatRun[] {
  return report.perEpic.flatMap((e) =>
    e.runs.map((r) => ({
      epicId: e.epicId,
      seed: r.seed,
      score: r.score,
      pass: r.pass,
      storyPack: r.storyPack,
      rawText: r.rawText,
    }))
  );
}

/**
 * Creativity Characteristics (FPF C.17)
 *
 * Measures generative quality for prompt optimization:
 * - Novelty@context: Difference from reference corpus
 * - Use-Value: Improvement vs baseline
 * - Surprise: Unexpectedness (bits)
 * - Constraint-Fit: Schema compliance gate
 * - Diversity_P: Portfolio contribution
 *
 * Key Rule (CC-C17-M.2): Novelty MUST NOT approve without
 * Use-Value OR Constraint-Fit gate.
 */

import { z } from "npm:zod@4.3.5";
import { textSimilarity } from "../similarity.ts";

// ═══════════════════════════════════════════════════════════════
// CREATIVITY PROFILE SCHEMA
// ═══════════════════════════════════════════════════════════════

export const CreativityProfileSchema = z.object({
  /**
   * How different from the reference prompt corpus [0,1].
   * Higher = more novel/unique prompt.
   * Computed as: 1 - max(similarity to any reference)
   */
  noveltyAtContext: z.number().min(0).max(1),

  /**
   * Measured improvement against baseline objective.
   * Interval scale (can be negative if worse than baseline).
   * Computed as: candidate.objective - baseline.objective
   */
  useValue: z.number(),

  /**
   * Unexpectedness under generative prior (bits).
   * Higher = more surprising/unexpected prompt structure.
   * Approximated via perplexity or n-gram analysis.
   */
  surprise: z.number().min(0),

  /**
   * Schema/safety constraint satisfaction [0,1].
   * GATE: Must = 1.0 for eligibility.
   * Computed from pass rate and schema compliance.
   */
  constraintFit: z.number().min(0).max(1),

  /**
   * Portfolio diversity contribution [0,1].
   * Marginal coverage gain when adding this prompt.
   * Higher = adds more unique coverage to portfolio.
   */
  diversityP: z.number().min(0).max(1),
});

export type CreativityProfile = z.infer<typeof CreativityProfileSchema>;

// ═══════════════════════════════════════════════════════════════
// CREATIVITY GATE RESULT
// ═══════════════════════════════════════════════════════════════

export const CreativityGateResultSchema = z.object({
  profile: CreativityProfileSchema,

  /**
   * Whether the prompt passes the creativity gate.
   * Per CC-C17-M.2: Novelty alone is insufficient.
   * Must have: (Constraint-Fit = 1.0) OR (Use-Value > 0)
   */
  eligible: z.boolean(),

  /**
   * Reason for gate decision.
   */
  reason: z.string(),

  /**
   * Warnings (e.g., high novelty but low use-value).
   */
  warnings: z.array(z.string()),
});

export type CreativityGateResult = z.infer<typeof CreativityGateResultSchema>;

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

export interface CreativityConfig {
  /**
   * Minimum constraint-fit for the hard gate (default: 1.0).
   * Set lower for development/testing only.
   */
  constraintFitThreshold?: number;

  /**
   * Minimum use-value delta for soft gate (default: 0).
   */
  useValueThreshold?: number;

  /**
   * Reference prompts for novelty computation.
   */
  referencePrompts?: string[];

  /**
   * Baseline objective for use-value computation.
   */
  baselineObjective?: number;
}

const DEFAULT_CONFIG: Required<CreativityConfig> = {
  constraintFitThreshold: 1.0,
  useValueThreshold: 0,
  referencePrompts: [],
  baselineObjective: 0,
};

// ═══════════════════════════════════════════════════════════════
// NOVELTY COMPUTATION
// ═══════════════════════════════════════════════════════════════

/**
 * Compute novelty@context for a prompt.
 *
 * Novelty = 1 - max(similarity to any reference prompt)
 *
 * If no references, novelty = 1.0 (maximally novel).
 */
export function computeNovelty(
  candidatePrompt: string,
  referencePrompts: string[]
): number {
  if (referencePrompts.length === 0) {
    return 1.0; // No references = maximally novel
  }

  let maxSimilarity = 0;

  for (const ref of referencePrompts) {
    const sim = textSimilarity(candidatePrompt, ref);
    maxSimilarity = Math.max(maxSimilarity, sim);
  }

  return 1 - maxSimilarity;
}

// ═══════════════════════════════════════════════════════════════
// USE-VALUE COMPUTATION
// ═══════════════════════════════════════════════════════════════

/**
 * Compute use-value (improvement vs baseline).
 *
 * Use-Value = candidate_objective - baseline_objective
 *
 * Positive = better than baseline.
 * Negative = worse than baseline.
 */
export function computeUseValue(
  candidateObjective: number,
  baselineObjective: number
): number {
  return candidateObjective - baselineObjective;
}

// ═══════════════════════════════════════════════════════════════
// SURPRISE COMPUTATION
// ═══════════════════════════════════════════════════════════════

/**
 * Approximate surprise via simple n-gram entropy.
 *
 * For now, uses a heuristic based on:
 * - Unique word ratio
 * - Sentence structure variance
 *
 * Future: Use actual LLM log-probabilities for perplexity.
 */
export function computeSurprise(promptText: string): number {
  if (!promptText || promptText.length === 0) {
    return 0;
  }

  // Tokenize
  const words = promptText
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (words.length === 0) {
    return 0;
  }

  // Unique word ratio as proxy for lexical diversity
  const uniqueWords = new Set(words);
  const uniqueRatio = uniqueWords.size / words.length;

  // Sentence length variance as proxy for structural diversity
  const sentences = promptText.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const sentenceLengths = sentences.map(
    (s) => s.trim().split(/\s+/).length
  );

  let lengthVariance = 0;
  if (sentenceLengths.length > 1) {
    const mean =
      sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length;
    const variance =
      sentenceLengths.reduce((sum, len) => sum + (len - mean) ** 2, 0) /
      sentenceLengths.length;
    lengthVariance = Math.sqrt(variance) / mean; // Coefficient of variation
  }

  // Combine into surprise score (0-5 bits range typically)
  // Higher unique ratio and variance = more surprising
  const surprise = uniqueRatio * 2 + lengthVariance * 1.5;

  return Math.min(5, surprise); // Cap at 5 bits
}

// ═══════════════════════════════════════════════════════════════
// CONSTRAINT-FIT COMPUTATION
// ═══════════════════════════════════════════════════════════════

/**
 * Compute constraint-fit from evaluation results.
 *
 * Constraint-Fit = passRate (schema compliance rate)
 *
 * For the gate to pass, this must = 1.0 (all runs pass schema).
 */
export function computeConstraintFit(
  passRate: number,
  schemaValid: boolean
): number {
  if (!schemaValid) {
    return 0;
  }
  return passRate;
}

// ═══════════════════════════════════════════════════════════════
// DIVERSITY_P COMPUTATION
// ═══════════════════════════════════════════════════════════════

/**
 * Compute marginal diversity contribution.
 *
 * Diversity_P = how much new coverage does this prompt add?
 *
 * Computed as: 1 - max(similarity to portfolio members)
 */
export function computeDiversityP(
  candidatePrompt: string,
  portfolioPrompts: string[]
): number {
  if (portfolioPrompts.length === 0) {
    return 1.0; // First member adds full diversity
  }

  let maxSimilarity = 0;

  for (const member of portfolioPrompts) {
    const sim = textSimilarity(candidatePrompt, member);
    maxSimilarity = Math.max(maxSimilarity, sim);
  }

  return 1 - maxSimilarity;
}

// ═══════════════════════════════════════════════════════════════
// FULL CREATIVITY PROFILE COMPUTATION
// ═══════════════════════════════════════════════════════════════

export interface CreativityInput {
  candidatePrompt: string;
  candidateObjective: number;
  passRate: number;
  schemaValid: boolean;
  portfolioPrompts?: string[];
}

/**
 * Compute complete creativity profile for a prompt candidate.
 */
export function computeCreativityProfile(
  input: CreativityInput,
  config: CreativityConfig = {}
): CreativityProfile {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return {
    noveltyAtContext: computeNovelty(input.candidatePrompt, cfg.referencePrompts),
    useValue: computeUseValue(input.candidateObjective, cfg.baselineObjective),
    surprise: computeSurprise(input.candidatePrompt),
    constraintFit: computeConstraintFit(input.passRate, input.schemaValid),
    diversityP: computeDiversityP(
      input.candidatePrompt,
      input.portfolioPrompts ?? []
    ),
  };
}

// ═══════════════════════════════════════════════════════════════
// CREATIVITY GATE (CC-C17-M.2)
// ═══════════════════════════════════════════════════════════════

/**
 * Apply the creativity gate per FPF CC-C17-M.2.
 *
 * Rule: Novelty MUST NOT approve without Use-Value OR Constraint-Fit.
 *
 * Eligibility requires:
 * - Constraint-Fit >= threshold (hard gate), OR
 * - Use-Value > threshold (soft gate with proven improvement)
 */
export function applyCreativityGate(
  input: CreativityInput,
  config: CreativityConfig = {}
): CreativityGateResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const profile = computeCreativityProfile(input, config);

  const warnings: string[] = [];

  // Check constraint-fit gate
  const constraintGatePass =
    profile.constraintFit >= cfg.constraintFitThreshold;

  // Check use-value gate
  const useValueGatePass = profile.useValue > cfg.useValueThreshold;

  // Eligibility per CC-C17-M.2
  const eligible = constraintGatePass || useValueGatePass;

  // Generate warnings
  if (profile.noveltyAtContext > 0.7 && !eligible) {
    warnings.push(
      `High novelty (${profile.noveltyAtContext.toFixed(2)}) but failed both gates`
    );
  }

  if (profile.noveltyAtContext > 0.7 && profile.useValue < 0) {
    warnings.push(
      `Novel prompt performs worse than baseline (Δ=${profile.useValue.toFixed(3)})`
    );
  }

  if (profile.constraintFit < 1.0 && profile.constraintFit > 0.5) {
    warnings.push(
      `Partial constraint fit (${profile.constraintFit.toFixed(2)}) - some runs fail schema`
    );
  }

  // Generate reason
  let reason: string;
  if (constraintGatePass && useValueGatePass) {
    reason = `Passes both gates: Constraint-Fit=${profile.constraintFit.toFixed(2)}, Use-Value=+${profile.useValue.toFixed(3)}`;
  } else if (constraintGatePass) {
    reason = `Passes constraint gate: Constraint-Fit=${profile.constraintFit.toFixed(2)}`;
  } else if (useValueGatePass) {
    reason = `Passes use-value gate: Δ=+${profile.useValue.toFixed(3)} vs baseline`;
  } else {
    reason = `Failed both gates: Constraint-Fit=${profile.constraintFit.toFixed(2)} < ${cfg.constraintFitThreshold}, Use-Value=${profile.useValue.toFixed(3)} <= ${cfg.useValueThreshold}`;
  }

  return {
    profile,
    eligible,
    reason,
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════
// CREATIVITY COMPARISON (for ranking)
// ═══════════════════════════════════════════════════════════════

/**
 * Compare two creativity profiles for ranking.
 *
 * Returns:
 * - Negative if a is better than b
 * - Positive if b is better than a
 * - 0 if equal
 *
 * Priority order:
 * 1. Constraint-Fit (must be 1.0)
 * 2. Use-Value (higher is better)
 * 3. Diversity_P (higher is better, tie-breaker)
 * 4. Novelty (higher is better, tie-breaker)
 */
export function compareCreativityProfiles(
  a: CreativityProfile,
  b: CreativityProfile
): number {
  // 1. Constraint-Fit (binary comparison)
  const aFit = a.constraintFit >= 1.0 ? 1 : 0;
  const bFit = b.constraintFit >= 1.0 ? 1 : 0;
  if (aFit !== bFit) {
    return bFit - aFit; // Higher fit wins
  }

  // 2. Use-Value
  const useValueDelta = b.useValue - a.useValue;
  if (Math.abs(useValueDelta) > 0.001) {
    return useValueDelta; // Higher use-value wins
  }

  // 3. Diversity_P (tie-breaker)
  const diversityDelta = b.diversityP - a.diversityP;
  if (Math.abs(diversityDelta) > 0.01) {
    return diversityDelta;
  }

  // 4. Novelty (final tie-breaker)
  return b.noveltyAtContext - a.noveltyAtContext;
}

/**
 * NQD Portfolio Selector (FPF C.18)
 *
 * Instead of returning a single "best" prompt, maintains a Pareto front
 * of non-dominated candidates across quality dimensions.
 *
 * Pipeline (MANDATORY order per FPF):
 * 1. Eligibility: Constraint-Fit = 1.0 (hard gate)
 * 2. Dominance: Q components only (R_eff, Use-Value)
 * 3. Tie-breakers: Novelty@context, Diversity_P, Surprise
 * 4. Illumination: Report-only telemetry (NEVER in dominance)
 */

import { z } from "npm:zod@4.3.5";
import {
  type CreativityProfile,
  type CreativityGateResult,
  applyCreativityGate,
  compareCreativityProfiles,
  type CreativityConfig,
  type CreativityInput,
} from "./creativity.ts";

// ═══════════════════════════════════════════════════════════════
// CANDIDATE SCHEMA
// ═══════════════════════════════════════════════════════════════

export const CandidateSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  promptText: z.string(),

  // Evaluation results
  objective: z.number(),
  passRate: z.number().min(0).max(1),
  schemaValid: z.boolean(),
  rEff: z.number().min(0).max(1).optional(),

  // Creativity profile (computed)
  creativity: z.custom<CreativityProfile>().optional(),
  gateResult: z.custom<CreativityGateResult>().optional(),
});

export type Candidate = z.infer<typeof CandidateSchema>;

// ═══════════════════════════════════════════════════════════════
// PARETO FRONT TYPES
// ═══════════════════════════════════════════════════════════════

export const ParetoFrontSchema = z.object({
  /**
   * Non-dominated candidates on the Pareto front.
   */
  front: z.array(CandidateSchema),

  /**
   * Dominated candidates (for reference).
   */
  dominated: z.array(CandidateSchema),

  /**
   * Ineligible candidates (failed gate).
   */
  ineligible: z.array(CandidateSchema),

  /**
   * Summary statistics.
   */
  stats: z.object({
    totalCandidates: z.number(),
    eligibleCount: z.number(),
    frontSize: z.number(),
    dominatedCount: z.number(),
    ineligibleCount: z.number(),
  }),
});

export type ParetoFront = z.infer<typeof ParetoFrontSchema>;

// ═══════════════════════════════════════════════════════════════
// ILLUMINATION TELEMETRY (Report-only, never in dominance)
// ═══════════════════════════════════════════════════════════════

export interface IlluminationTelemetry {
  /**
   * Coverage of the solution space.
   */
  coverage: number;

  /**
   * Quality-Diversity score (sum of front objectives).
   */
  qdScore: number;

  /**
   * Average novelty on the front.
   */
  avgNovelty: number;

  /**
   * Average diversity contribution.
   */
  avgDiversity: number;

  /**
   * Spread of objectives (max - min on front).
   */
  objectiveSpread: number;
}

// ═══════════════════════════════════════════════════════════════
// NQD ARCHIVE (Full portfolio result)
// ═══════════════════════════════════════════════════════════════

export interface NQDArchive {
  paretoFront: ParetoFront;
  illumination: IlluminationTelemetry;
  selectedWinner: Candidate | null;
  timestamp: string;
}

// ═══════════════════════════════════════════════════════════════
// DOMINANCE CHECK
// ═══════════════════════════════════════════════════════════════

/**
 * Check if candidate A dominates candidate B.
 *
 * A dominates B if:
 * - A is at least as good as B on ALL Q dimensions
 * - A is strictly better than B on AT LEAST ONE Q dimension
 *
 * Q dimensions (per FPF C.18):
 * - R_eff (reliability)
 * - Use-Value (improvement vs baseline)
 */
function dominates(a: Candidate, b: Candidate): boolean {
  const aReff = a.rEff ?? a.objective;
  const bReff = b.rEff ?? b.objective;

  const aUseValue = a.creativity?.useValue ?? 0;
  const bUseValue = b.creativity?.useValue ?? 0;

  // A must be >= B on all dimensions
  const atLeastAsGoodReff = aReff >= bReff;
  const atLeastAsGoodUseValue = aUseValue >= bUseValue;

  // A must be > B on at least one dimension
  const strictlyBetterReff = aReff > bReff;
  const strictlyBetterUseValue = aUseValue > bUseValue;

  return (
    atLeastAsGoodReff &&
    atLeastAsGoodUseValue &&
    (strictlyBetterReff || strictlyBetterUseValue)
  );
}

// ═══════════════════════════════════════════════════════════════
// PARETO FRONT COMPUTATION
// ═══════════════════════════════════════════════════════════════

/**
 * Compute the Pareto front from a set of candidates.
 *
 * A candidate is on the Pareto front if no other candidate dominates it.
 */
function computeParetoFront(candidates: Candidate[]): {
  front: Candidate[];
  dominated: Candidate[];
} {
  const front: Candidate[] = [];
  const dominated: Candidate[] = [];

  for (const candidate of candidates) {
    let isDominated = false;

    for (const other of candidates) {
      if (other.id !== candidate.id && dominates(other, candidate)) {
        isDominated = true;
        break;
      }
    }

    if (isDominated) {
      dominated.push(candidate);
    } else {
      front.push(candidate);
    }
  }

  return { front, dominated };
}

// ═══════════════════════════════════════════════════════════════
// ILLUMINATION COMPUTATION
// ═══════════════════════════════════════════════════════════════

function computeIllumination(
  front: Candidate[],
  allEligible: Candidate[]
): IlluminationTelemetry {
  if (front.length === 0) {
    return {
      coverage: 0,
      qdScore: 0,
      avgNovelty: 0,
      avgDiversity: 0,
      objectiveSpread: 0,
    };
  }

  // Coverage: fraction of eligible candidates on front
  const coverage = front.length / Math.max(1, allEligible.length);

  // QD Score: sum of objectives on front
  const qdScore = front.reduce((sum, c) => sum + c.objective, 0);

  // Average novelty
  const novelties = front
    .map((c) => c.creativity?.noveltyAtContext ?? 0)
    .filter((n) => n > 0);
  const avgNovelty =
    novelties.length > 0
      ? novelties.reduce((a, b) => a + b, 0) / novelties.length
      : 0;

  // Average diversity
  const diversities = front
    .map((c) => c.creativity?.diversityP ?? 0)
    .filter((d) => d > 0);
  const avgDiversity =
    diversities.length > 0
      ? diversities.reduce((a, b) => a + b, 0) / diversities.length
      : 0;

  // Objective spread
  const objectives = front.map((c) => c.objective);
  const objectiveSpread =
    objectives.length > 1
      ? Math.max(...objectives) - Math.min(...objectives)
      : 0;

  return {
    coverage,
    qdScore,
    avgNovelty,
    avgDiversity,
    objectiveSpread,
  };
}

// ═══════════════════════════════════════════════════════════════
// TIE-BREAKING (When multiple candidates on front)
// ═══════════════════════════════════════════════════════════════

/**
 * Select winner from Pareto front using tie-breakers.
 *
 * Order (per FPF C.18):
 * 1. Constraint-Fit (must be 1.0)
 * 2. Use-Value (higher is better)
 * 3. Diversity_P (higher is better)
 * 4. Novelty@context (higher is better)
 */
function selectWinner(front: Candidate[]): Candidate | null {
  if (front.length === 0) return null;
  if (front.length === 1) return front[0]!;

  // Sort using creativity profile comparison
  const sorted = [...front].sort((a, b) => {
    // If both have creativity profiles, use the comparison function
    if (a.creativity && b.creativity) {
      return compareCreativityProfiles(a.creativity, b.creativity);
    }

    // Fallback to objective comparison
    return b.objective - a.objective;
  });

  return sorted[0]!;
}

// ═══════════════════════════════════════════════════════════════
// MAIN NQD SELECTOR
// ═══════════════════════════════════════════════════════════════

export interface NQDSelectorConfig extends CreativityConfig {
  /**
   * Whether to include dominated candidates in output.
   */
  includeDominated?: boolean;

  /**
   * Maximum front size (prune if larger).
   */
  maxFrontSize?: number;
}

const DEFAULT_NQD_CONFIG: Required<NQDSelectorConfig> = {
  constraintFitThreshold: 1.0,
  useValueThreshold: 0,
  referencePrompts: [],
  baselineObjective: 0,
  includeDominated: true,
  maxFrontSize: 10,
};

/**
 * Run the NQD selection pipeline.
 *
 * Pipeline:
 * 1. Eligibility gate (Constraint-Fit = 1.0)
 * 2. Compute creativity profiles
 * 3. Build Pareto front (dominance on Q dimensions)
 * 4. Apply tie-breakers to select winner
 * 5. Compute illumination telemetry
 */
export function runNQDSelection(
  candidates: Candidate[],
  config: NQDSelectorConfig = {}
): NQDArchive {
  const cfg = { ...DEFAULT_NQD_CONFIG, ...config };

  // Build portfolio of current prompts for diversity calculation
  const portfolioPrompts = candidates.map((c) => c.promptText);

  // Step 1 & 2: Apply eligibility gate and compute creativity profiles
  const eligible: Candidate[] = [];
  const ineligible: Candidate[] = [];

  for (const candidate of candidates) {
    // Compute creativity profile
    const input: CreativityInput = {
      candidatePrompt: candidate.promptText,
      candidateObjective: candidate.objective,
      passRate: candidate.passRate,
      schemaValid: candidate.schemaValid,
      portfolioPrompts: portfolioPrompts.filter((p) => p !== candidate.promptText),
    };

    const gateResult = applyCreativityGate(input, cfg);

    // Attach results to candidate
    const enrichedCandidate: Candidate = {
      ...candidate,
      creativity: gateResult.profile,
      gateResult,
    };

    if (gateResult.eligible) {
      eligible.push(enrichedCandidate);
    } else {
      ineligible.push(enrichedCandidate);
    }
  }

  // Step 3: Compute Pareto front over Q dimensions
  const { front, dominated } = computeParetoFront(eligible);

  // Prune front if too large (keep highest use-value)
  let prunedFront = front;
  if (front.length > cfg.maxFrontSize) {
    prunedFront = [...front]
      .sort((a, b) => (b.creativity?.useValue ?? 0) - (a.creativity?.useValue ?? 0))
      .slice(0, cfg.maxFrontSize);
  }

  // Step 4: Select winner using tie-breakers
  const selectedWinner = selectWinner(prunedFront);

  // Step 5: Compute illumination telemetry
  const illumination = computeIllumination(prunedFront, eligible);

  // Build result
  const paretoFront: ParetoFront = {
    front: prunedFront,
    dominated: cfg.includeDominated ? dominated : [],
    ineligible,
    stats: {
      totalCandidates: candidates.length,
      eligibleCount: eligible.length,
      frontSize: prunedFront.length,
      dominatedCount: dominated.length,
      ineligibleCount: ineligible.length,
    },
  };

  return {
    paretoFront,
    illumination,
    selectedWinner,
    timestamp: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
// CONVENIENCE: Quick selection (returns just the winner)
// ═══════════════════════════════════════════════════════════════

/**
 * Quick selection: Returns just the winning candidate.
 */
export function selectBestCandidate(
  candidates: Candidate[],
  config: NQDSelectorConfig = {}
): Candidate | null {
  const archive = runNQDSelection(candidates, config);
  return archive.selectedWinner;
}

/**
 * Check if a candidate would be eligible.
 */
export function isEligible(
  candidate: Candidate,
  config: NQDSelectorConfig = {}
): boolean {
  const cfg = { ...DEFAULT_NQD_CONFIG, ...config };

  const input: CreativityInput = {
    candidatePrompt: candidate.promptText,
    candidateObjective: candidate.objective,
    passRate: candidate.passRate,
    schemaValid: candidate.schemaValid,
  };

  const gateResult = applyCreativityGate(input, cfg);
  return gateResult.eligible;
}

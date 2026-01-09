/**
 * Contrastive Pair Mining for Prompt Optimization
 *
 * Implements the paper's approach: find "semantic nearest neighbors with large
 * quality delta" to guide OPRO-style prompt optimization.
 *
 * The idea: if two outputs are very similar but one scores much higher,
 * the difference reveals what makes outputs good vs bad. Feeding these
 * pairs to the patch engineer helps it identify targeted improvements.
 *
 * Enhanced with TIERED CONTRASTIVE PAIRS (inspired by CRPO arXiv 2509.02093):
 * - Multi-metric pairing (coverage, INVEST, criteria) not just overall score
 * - Quality tiers (HIGH/MEDIUM/LOW) for stratified learning signal
 * - Error analysis context to explain WHY bad outputs failed
 */

import type { StoryPack } from "./schema.ts";
import { cosine, hashVector } from "./similarity.ts";
import { env } from "./config.ts";

// ─────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────

/** A scored output from distributional evaluation */
export type ScoredOutput = {
  epicId: string;
  seed: number;
  score: number;
  pass: boolean;
  storyPack: StoryPack | null;
  rawText: string;
  /** Optional per-metric subscores for tiered pairing */
  subscores?: MetricSubscores;
};

/** Per-metric subscores for multi-metric pairing */
export type MetricSubscores = {
  coverage?: number; // Keyword coverage score
  invest?: number; // INVEST compliance score
  criteria?: number; // Acceptance criteria quality
  duplication?: number; // Story deduplication score
  schemaValid?: boolean; // Schema validation result
};

/** Quality tier for stratified learning */
export type QualityTier = "HIGH" | "MEDIUM" | "LOW";

/** A contrastive pair: similar outputs with different quality */
export type ContrastPair = {
  epicId: string;
  /** Cosine similarity between the two outputs */
  sim: number;
  /** Absolute score difference */
  delta: number;
  /** The higher-scoring output */
  good: ScoredOutput;
  /** The lower-scoring output */
  bad: ScoredOutput;
  /** Quality tier of the good output */
  tier?: QualityTier;
  /** Which metric(s) show the biggest difference */
  primaryMetric?: keyof MetricSubscores;
  /** Error analysis explaining why bad output is worse */
  errorAnalysis?: string[];
};

/** Tiered pair mining configuration */
export type TieredMiningConfig = {
  /** Enable multi-metric pairing (default: true) */
  multiMetric?: boolean;
  /** Enable quality tier stratification (default: true) */
  stratifyTiers?: boolean;
  /** Enable error analysis (default: true) */
  analyzeErrors?: boolean;
  /** Tier thresholds */
  tierThresholds?: {
    high: number; // Score >= this is HIGH tier (default: 0.75)
    medium: number; // Score >= this is MEDIUM tier (default: 0.50)
  };
};

// ─────────────────────────────────────────────────
// Text Extraction
// ─────────────────────────────────────────────────

/**
 * Extract a compact text representation from a StoryPack for similarity.
 *
 * Includes: story titles, narratives (asA/iWant/soThat), and acceptance criteria.
 * Excludes: ADO fields (redundant), assumptions/risks/followUps (metadata).
 */
function compactText(sp: StoryPack | null): string {
  if (!sp) return "";

  const parts: string[] = [];
  for (const story of sp.userStories) {
    parts.push(
      story.title,
      story.asA,
      story.iWant,
      story.soThat,
      ...story.acceptanceCriteria,
    );
  }
  return parts.join("\n");
}

// ─────────────────────────────────────────────────
// Pair Mining
// ─────────────────────────────────────────────────

export type MineContrastivePairsParams = {
  /** Scored outputs from distributional evaluation */
  runs: ScoredOutput[];
  /** Minimum cosine similarity to consider "near neighbors" (default: env.PAIR_MIN_SIM) */
  minSim?: number;
  /** Minimum score delta to consider "contrastive" (default: env.PAIR_MIN_DELTA) */
  minDelta?: number;
  /** Maximum pairs to return (default: env.PAIR_MAX_PAIRS) */
  maxPairs?: number;
};

/**
 * Mine contrastive pairs from scored outputs.
 *
 * Algorithm:
 * 1. Group runs by epic (pairs must come from the same epic)
 * 2. For each pair of runs within an epic:
 *    - Compute cosine similarity between their outputs
 *    - Compute absolute score delta
 *    - Keep if sim >= minSim AND delta >= minDelta
 * 3. Sort by delta (descending), then by sim (descending)
 * 4. Return top maxPairs
 *
 * Time complexity: O(E * R^2) where E = epics, R = replicates per epic.
 * With R=5 and E=3, this is ~75 comparisons total—trivial.
 */
export function mineContrastivePairs(
  params: MineContrastivePairsParams,
): ContrastPair[] {
  const minSim = params.minSim ?? env.PAIR_MIN_SIM;
  const minDelta = params.minDelta ?? env.PAIR_MIN_DELTA;
  const maxPairs = params.maxPairs ?? env.PAIR_MAX_PAIRS;

  // Group runs by epic
  const byEpic = new Map<string, ScoredOutput[]>();
  for (const run of params.runs) {
    const existing = byEpic.get(run.epicId) ?? [];
    existing.push(run);
    byEpic.set(run.epicId, existing);
  }

  const candidates: ContrastPair[] = [];

  for (const [epicId, runs] of byEpic.entries()) {
    // Pre-compute vectors for all runs in this epic
    const texts = runs.map((r) => compactText(r.storyPack));
    const vectors = texts.map((t) => hashVector(t));

    // Compare all pairs
    for (let i = 0; i < runs.length; i++) {
      for (let j = i + 1; j < runs.length; j++) {
        const a = runs[i]!;
        const b = runs[j]!;

        // Skip if both outputs are empty (both failed)
        if (!a.storyPack && !b.storyPack) continue;

        const sim = cosine(vectors[i]!, vectors[j]!);
        const delta = Math.abs(a.score - b.score);

        // Apply thresholds
        if (sim < minSim) continue;
        if (delta < minDelta) continue;

        // Determine which is good vs bad
        const good = a.score >= b.score ? a : b;
        const bad = a.score >= b.score ? b : a;

        candidates.push({ epicId, sim, delta, good, bad });
      }
    }
  }

  // Sort: highest delta first, then highest similarity
  candidates.sort((p, q) => {
    const deltaDiff = q.delta - p.delta;
    if (Math.abs(deltaDiff) > 0.001) return deltaDiff;
    return q.sim - p.sim;
  });

  return candidates.slice(0, maxPairs);
}

// ─────────────────────────────────────────────────
// Tiered Pair Mining (CRPO-style)
// ─────────────────────────────────────────────────

const DEFAULT_TIER_THRESHOLDS = {
  high: 0.75,
  medium: 0.5,
};

/**
 * Determine quality tier based on score.
 */
function getQualityTier(
  score: number,
  thresholds = DEFAULT_TIER_THRESHOLDS,
): QualityTier {
  if (score >= thresholds.high) return "HIGH";
  if (score >= thresholds.medium) return "MEDIUM";
  return "LOW";
}

/**
 * Find the metric with the largest delta between two outputs.
 */
function findPrimaryMetric(
  good: ScoredOutput,
  bad: ScoredOutput,
): keyof MetricSubscores | undefined {
  if (!good.subscores || !bad.subscores) return undefined;

  const metrics: (keyof MetricSubscores)[] = [
    "coverage",
    "invest",
    "criteria",
    "duplication",
  ];

  let maxDelta = 0;
  let primary: keyof MetricSubscores | undefined;

  for (const metric of metrics) {
    const goodVal = good.subscores[metric];
    const badVal = bad.subscores[metric];

    if (typeof goodVal === "number" && typeof badVal === "number") {
      const delta = Math.abs(goodVal - badVal);
      if (delta > maxDelta) {
        maxDelta = delta;
        primary = metric;
      }
    }
  }

  return primary;
}

/**
 * Analyze errors in the bad output compared to good.
 */
function analyzeErrors(good: ScoredOutput, bad: ScoredOutput): string[] {
  const errors: string[] = [];

  // Schema validation
  if (good.pass && !bad.pass) {
    errors.push("Schema validation failed");
  }

  // Story count issues
  const goodCount = good.storyPack?.userStories.length ?? 0;
  const badCount = bad.storyPack?.userStories.length ?? 0;

  if (goodCount >= 4 && goodCount <= 8 && (badCount < 4 || badCount > 8)) {
    errors.push(
      `Story count outside optimal range: ${badCount} (optimal: 4-8, good had: ${goodCount})`,
    );
  }

  // Subscore analysis
  if (good.subscores && bad.subscores) {
    if (
      good.subscores.coverage !== undefined &&
      bad.subscores.coverage !== undefined
    ) {
      const delta = good.subscores.coverage - bad.subscores.coverage;
      if (delta > 0.15) {
        errors.push(
          `Low keyword coverage: ${(bad.subscores.coverage * 100).toFixed(0)}% vs ${(good.subscores.coverage * 100).toFixed(0)}%`,
        );
      }
    }

    if (
      good.subscores.invest !== undefined &&
      bad.subscores.invest !== undefined
    ) {
      const delta = good.subscores.invest - bad.subscores.invest;
      if (delta > 0.15) {
        errors.push(
          `Poor INVEST compliance: ${(bad.subscores.invest * 100).toFixed(0)}% vs ${(good.subscores.invest * 100).toFixed(0)}%`,
        );
      }
    }

    if (
      good.subscores.criteria !== undefined &&
      bad.subscores.criteria !== undefined
    ) {
      const delta = good.subscores.criteria - bad.subscores.criteria;
      if (delta > 0.15) {
        errors.push(
          `Weak acceptance criteria: ${(bad.subscores.criteria * 100).toFixed(0)}% vs ${(good.subscores.criteria * 100).toFixed(0)}%`,
        );
      }
    }

    if (
      good.subscores.duplication !== undefined &&
      bad.subscores.duplication !== undefined
    ) {
      const delta = good.subscores.duplication - bad.subscores.duplication;
      if (delta > 0.15) {
        errors.push(
          `Story duplication detected: ${(bad.subscores.duplication * 100).toFixed(0)}% unique vs ${(good.subscores.duplication * 100).toFixed(0)}%`,
        );
      }
    }
  }

  // Structural issues
  if (bad.storyPack) {
    for (const story of bad.storyPack.userStories) {
      if (story.acceptanceCriteria.length < 3) {
        errors.push(
          `Story "${story.title.slice(0, 30)}..." has only ${story.acceptanceCriteria.length} acceptance criteria`,
        );
        break; // Only report once
      }
    }
  }

  return errors;
}

/**
 * Mine tiered contrastive pairs with multi-metric analysis.
 *
 * Enhanced version that:
 * 1. Assigns quality tiers (HIGH/MEDIUM/LOW) to pairs
 * 2. Identifies which metric shows the biggest improvement
 * 3. Provides error analysis for the bad output
 * 4. Stratifies results to ensure diversity across tiers
 */
export function mineTieredContrastivePairs(
  params: MineContrastivePairsParams & { config?: TieredMiningConfig },
): ContrastPair[] {
  const config = params.config ?? {};
  const multiMetric = config.multiMetric ?? true;
  const stratifyTiers = config.stratifyTiers ?? true;
  const analyzeErrorsFlag = config.analyzeErrors ?? true;
  const tierThresholds = config.tierThresholds ?? DEFAULT_TIER_THRESHOLDS;

  // Get base pairs using existing algorithm
  const basePairs = mineContrastivePairs(params);

  // Enhance pairs with tiered information
  const enhancedPairs = basePairs.map((pair) => {
    const enhanced: ContrastPair = { ...pair };

    // Add quality tier
    enhanced.tier = getQualityTier(pair.good.score, tierThresholds);

    // Add primary metric (if subscores available)
    if (multiMetric) {
      enhanced.primaryMetric = findPrimaryMetric(pair.good, pair.bad);
    }

    // Add error analysis
    if (analyzeErrorsFlag) {
      enhanced.errorAnalysis = analyzeErrors(pair.good, pair.bad);
    }

    return enhanced;
  });

  // Stratify by tier if enabled
  if (stratifyTiers && enhancedPairs.length > 3) {
    const byTier: Record<QualityTier, ContrastPair[]> = {
      HIGH: [],
      MEDIUM: [],
      LOW: [],
    };

    for (const pair of enhancedPairs) {
      byTier[pair.tier ?? "MEDIUM"].push(pair);
    }

    // Take proportionally from each tier
    const maxPairs = params.maxPairs ?? env.PAIR_MAX_PAIRS;
    const result: ContrastPair[] = [];

    // Priority: HIGH (50%), MEDIUM (35%), LOW (15%)
    const highCount = Math.ceil(maxPairs * 0.5);
    const mediumCount = Math.ceil(maxPairs * 0.35);
    const lowCount = maxPairs - highCount - mediumCount;

    result.push(...byTier.HIGH.slice(0, highCount));
    result.push(...byTier.MEDIUM.slice(0, mediumCount));
    result.push(...byTier.LOW.slice(0, lowCount));

    // Fill remaining slots if any tier was short
    const remaining = maxPairs - result.length;
    if (remaining > 0) {
      const unused = enhancedPairs.filter((p) => !result.includes(p));
      result.push(...unused.slice(0, remaining));
    }

    return result.slice(0, maxPairs);
  }

  return enhancedPairs;
}

// ─────────────────────────────────────────────────
// Formatting for Prompt Engineer
// ─────────────────────────────────────────────────

/**
 * Format contrastive pairs into a context string for the prompt patch engineer.
 *
 * Each pair shows:
 * - Epic ID, similarity, and delta
 * - Quality tier and primary metric (if tiered)
 * - Error analysis (if available)
 * - GOOD output (score, seed, story pack)
 * - BAD output (score, seed, story pack)
 */
export function formatPairsForPrompt(pairs: ContrastPair[]): string {
  if (pairs.length === 0) {
    return "No contrastive pairs found (outputs too different or scores too similar).";
  }

  return pairs
    .map((p, idx) => {
      const lines: string[] = [
        `### PAIR ${idx + 1}`,
        `Epic: ${p.epicId} | Similarity: ${p.sim.toFixed(2)} | Delta: ${p.delta.toFixed(3)}`,
      ];

      // Add tiered information if available
      if (p.tier) {
        lines.push(`Quality Tier: ${p.tier}`);
      }
      if (p.primaryMetric) {
        lines.push(`Primary Differentiator: ${p.primaryMetric}`);
      }

      // Add error analysis if available
      if (p.errorAnalysis && p.errorAnalysis.length > 0) {
        lines.push("");
        lines.push("**Why BAD output failed:**");
        for (const error of p.errorAnalysis) {
          lines.push(`- ${error}`);
        }
      }

      lines.push(
        "",
        `**GOOD** (score=${p.good.score.toFixed(3)}, seed=${p.good.seed})`,
        "```json",
        JSON.stringify(p.good.storyPack, null, 2),
        "```",
        "",
        `**BAD** (score=${p.bad.score.toFixed(3)}, seed=${p.bad.seed})`,
        "```json",
        JSON.stringify(p.bad.storyPack, null, 2),
        "```",
      );

      return lines.join("\n");
    })
    .join("\n\n---\n\n");
}

/**
 * Format tiered pairs with enhanced context for patch engineer.
 *
 * Groups pairs by tier and provides a summary of common issues.
 */
export function formatTieredPairsForPrompt(pairs: ContrastPair[]): string {
  if (pairs.length === 0) {
    return "No contrastive pairs found (outputs too different or scores too similar).";
  }

  // Group by tier
  const byTier: Record<QualityTier, ContrastPair[]> = {
    HIGH: [],
    MEDIUM: [],
    LOW: [],
  };

  for (const pair of pairs) {
    byTier[pair.tier ?? "MEDIUM"].push(pair);
  }

  // Collect all errors for summary
  const allErrors: string[] = [];
  for (const pair of pairs) {
    if (pair.errorAnalysis) {
      allErrors.push(...pair.errorAnalysis);
    }
  }

  // Count error frequencies
  const errorCounts = new Map<string, number>();
  for (const error of allErrors) {
    // Normalize error for counting (remove specific values)
    const normalized = error.replace(/\d+%?/g, "X").replace(/".+?"/g, '"..."');
    errorCounts.set(normalized, (errorCounts.get(normalized) ?? 0) + 1);
  }

  // Build output
  const sections: string[] = [];

  // Summary section
  sections.push("## CONTRASTIVE PAIR ANALYSIS");
  sections.push("");
  sections.push(`Total pairs: ${pairs.length}`);
  sections.push(`- HIGH tier (score >= 0.75): ${byTier.HIGH.length}`);
  sections.push(`- MEDIUM tier (0.50-0.75): ${byTier.MEDIUM.length}`);
  sections.push(`- LOW tier (< 0.50): ${byTier.LOW.length}`);

  // Common issues
  if (errorCounts.size > 0) {
    sections.push("");
    sections.push("### Common Issues in BAD Outputs:");
    const sortedErrors = [...errorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    for (const [error, count] of sortedErrors) {
      sections.push(`- ${error} (${count}x)`);
    }
  }

  sections.push("");
  sections.push("---");
  sections.push("");

  // Individual pairs
  sections.push(formatPairsForPrompt(pairs));

  return sections.join("\n");
}

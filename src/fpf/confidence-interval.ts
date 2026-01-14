/**
 * Confidence Interval Estimation for Prompt Evaluation Scores
 *
 * Provides statistical bounds on score estimates using multiple methods:
 * 1. Wilson score interval for binary gate decisions
 * 2. Bootstrap percentile intervals for score distributions
 * 3. Inter-judge variance from PoLL panel
 *
 * FPF Alignment:
 * - Supports epistemic humility (admitting uncertainty)
 * - Congruence level already captures inter-judge agreement
 * - This adds quantitative uncertainty bounds
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ConfidenceInterval {
  /** Point estimate (mean or median) */
  estimate: number;
  /** Lower bound of confidence interval */
  lower: number;
  /** Upper bound of confidence interval */
  upper: number;
  /** Confidence level (e.g., 0.95 for 95%) */
  level: number;
  /** Method used to compute the interval */
  method: "wilson" | "bootstrap" | "inter-judge" | "t-interval" | "normal";
  /** Sample size or number of observations */
  n: number;
  /** Standard error (if available) */
  standardError?: number;
}

export interface ScoreWithConfidence {
  score: number;
  confidence: ConfidenceInterval;
}

// ═══════════════════════════════════════════════════════════════
// STATISTICAL UTILITIES
// ═══════════════════════════════════════════════════════════════

/**
 * Z-score for common confidence levels.
 */
const Z_SCORES: Record<number, number> = {
  0.9: 1.645,
  0.95: 1.96,
  0.99: 2.576,
};

function getZScore(level: number): number {
  return Z_SCORES[level] ?? 1.96;
}

/**
 * T-score for small samples (approximation).
 * Uses Welch-Satterthwaite approximation for df.
 */
function getTScore(df: number, level: number): number {
  // For large df, converges to z-score
  if (df >= 30) return getZScore(level);

  // Approximate t-values for common cases
  const tTable: Record<number, Record<number, number>> = {
    0.95: {
      1: 12.706,
      2: 4.303,
      3: 3.182,
      4: 2.776,
      5: 2.571,
      6: 2.447,
      7: 2.365,
      8: 2.306,
      9: 2.262,
      10: 2.228,
      15: 2.131,
      20: 2.086,
      25: 2.06,
    },
    0.99: {
      1: 63.657,
      2: 9.925,
      3: 5.841,
      4: 4.604,
      5: 4.032,
      6: 3.707,
      7: 3.499,
      8: 3.355,
      9: 3.25,
      10: 3.169,
      15: 2.947,
      20: 2.845,
      25: 2.787,
    },
  };

  const table = tTable[level] ?? tTable[0.95]!;

  // Find closest df in table
  const dfs = Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b);
  for (const d of dfs) {
    if (df <= d) return table[d]!;
  }
  return getZScore(level);
}

/**
 * Calculate mean of an array.
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate standard deviation (sample, using n-1).
 */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Calculate standard error of the mean.
 */
export function standardError(values: number[]): number {
  if (values.length < 2) return 0;
  return stdDev(values) / Math.sqrt(values.length);
}

/**
 * Calculate percentile of a sorted array.
 */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0]!;

  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;

  return sortedValues[lower]! * (1 - fraction) +
    sortedValues[upper]! * fraction;
}

// ═══════════════════════════════════════════════════════════════
// CONFIDENCE INTERVAL METHODS
// ═══════════════════════════════════════════════════════════════

/**
 * Wilson score interval for binary outcomes.
 *
 * Better than Wald interval for proportions, especially near 0 or 1.
 * Used for gate decision confidence (pass/fail rate).
 *
 * @param successes Number of successes (e.g., passes)
 * @param total Total number of trials
 * @param level Confidence level (default 0.95)
 */
export function wilsonInterval(
  successes: number,
  total: number,
  level: number = 0.95,
): ConfidenceInterval {
  if (total === 0) {
    return {
      estimate: 0,
      lower: 0,
      upper: 1,
      level,
      method: "wilson",
      n: 0,
    };
  }

  const p = successes / total;
  const z = getZScore(level);
  const z2 = z * z;
  const n = total;

  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const margin = (z / denominator) *
    Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));

  return {
    estimate: p,
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
    level,
    method: "wilson",
    n: total,
    standardError: Math.sqrt((p * (1 - p)) / n),
  };
}

/**
 * Bootstrap percentile confidence interval.
 *
 * Non-parametric method that works for any distribution.
 * Resamples the data B times and takes percentiles.
 *
 * @param values Sample values
 * @param level Confidence level (default 0.95)
 * @param B Number of bootstrap resamples (default 1000)
 */
export function bootstrapInterval(
  values: number[],
  level: number = 0.95,
  B: number = 1000,
): ConfidenceInterval {
  if (values.length === 0) {
    return {
      estimate: 0,
      lower: 0,
      upper: 1,
      level,
      method: "bootstrap",
      n: 0,
    };
  }

  if (values.length === 1) {
    return {
      estimate: values[0]!,
      lower: values[0]!,
      upper: values[0]!,
      level,
      method: "bootstrap",
      n: 1,
    };
  }

  // Bootstrap resampling
  const bootstrapMeans: number[] = [];
  for (let b = 0; b < B; b++) {
    const resample: number[] = [];
    for (let i = 0; i < values.length; i++) {
      const idx = Math.floor(Math.random() * values.length);
      resample.push(values[idx]!);
    }
    bootstrapMeans.push(mean(resample));
  }

  // Sort bootstrap means
  bootstrapMeans.sort((a, b) => a - b);

  // Percentile method
  const alpha = 1 - level;
  const lowerP = (alpha / 2) * 100;
  const upperP = (1 - alpha / 2) * 100;

  return {
    estimate: mean(values),
    lower: percentile(bootstrapMeans, lowerP),
    upper: percentile(bootstrapMeans, upperP),
    level,
    method: "bootstrap",
    n: values.length,
    standardError: standardError(values),
  };
}

/**
 * T-interval for small samples (assumes approximate normality).
 *
 * Uses Student's t-distribution, appropriate for n < 30.
 *
 * @param values Sample values
 * @param level Confidence level (default 0.95)
 */
export function tInterval(
  values: number[],
  level: number = 0.95,
): ConfidenceInterval {
  if (values.length < 2) {
    return {
      estimate: values[0] ?? 0,
      lower: 0,
      upper: 1,
      level,
      method: "t-interval",
      n: values.length,
    };
  }

  const m = mean(values);
  const se = standardError(values);
  const df = values.length - 1;
  const t = getTScore(df, level);
  const margin = t * se;

  return {
    estimate: m,
    lower: Math.max(0, m - margin),
    upper: Math.min(1, m + margin),
    level,
    method: "t-interval",
    n: values.length,
    standardError: se,
  };
}

/**
 * Inter-judge variance interval (PoLL-specific).
 *
 * Uses the variance between judge scores to estimate uncertainty.
 * Appropriate when we have multiple independent judge evaluations.
 *
 * @param judgeScores Array of scores from different judges
 * @param level Confidence level (default 0.95)
 */
export function interJudgeInterval(
  judgeScores: number[],
  level: number = 0.95,
): ConfidenceInterval {
  if (judgeScores.length < 2) {
    return {
      estimate: judgeScores[0] ?? 0,
      lower: 0,
      upper: 1,
      level,
      method: "inter-judge",
      n: judgeScores.length,
    };
  }

  const m = mean(judgeScores);
  const se = standardError(judgeScores);
  const df = judgeScores.length - 1;

  // Use t-distribution for small judge panels
  const t = getTScore(df, level);
  const margin = t * se;

  // Also compute range-based bounds (more conservative)
  const minScore = Math.min(...judgeScores);
  const maxScore = Math.max(...judgeScores);

  // Return the wider interval (more conservative)
  const tLower = Math.max(0, m - margin);
  const tUpper = Math.min(1, m + margin);

  // For small panels, also consider the observed range
  const rangeLower = Math.max(0, minScore - (maxScore - minScore) * 0.1);
  const rangeUpper = Math.min(1, maxScore + (maxScore - minScore) * 0.1);

  return {
    estimate: m,
    lower: Math.min(tLower, rangeLower),
    upper: Math.max(tUpper, rangeUpper),
    level,
    method: "inter-judge",
    n: judgeScores.length,
    standardError: se,
  };
}

/**
 * Normal approximation interval.
 *
 * Simple z-interval assuming normality. Best for large samples.
 *
 * @param values Sample values
 * @param level Confidence level (default 0.95)
 */
export function normalInterval(
  values: number[],
  level: number = 0.95,
): ConfidenceInterval {
  if (values.length < 2) {
    return {
      estimate: values[0] ?? 0,
      lower: 0,
      upper: 1,
      level,
      method: "normal",
      n: values.length,
    };
  }

  const m = mean(values);
  const se = standardError(values);
  const z = getZScore(level);
  const margin = z * se;

  return {
    estimate: m,
    lower: Math.max(0, m - margin),
    upper: Math.min(1, m + margin),
    level,
    method: "normal",
    n: values.length,
    standardError: se,
  };
}

// ═══════════════════════════════════════════════════════════════
// AUTO-SELECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Automatically select the best confidence interval method.
 *
 * @param values Sample values
 * @param level Confidence level (default 0.95)
 * @param isBinary Whether the values represent binary outcomes
 */
export function autoConfidenceInterval(
  values: number[],
  level: number = 0.95,
  isBinary: boolean = false,
): ConfidenceInterval {
  if (isBinary) {
    // For binary outcomes, use Wilson interval
    const successes = values.filter((v) => v > 0.5).length;
    return wilsonInterval(successes, values.length, level);
  }

  if (values.length < 5) {
    // Very small samples: use bootstrap (no distributional assumptions)
    return bootstrapInterval(values, level, 2000);
  }

  if (values.length < 30) {
    // Small samples: use t-interval
    return tInterval(values, level);
  }

  // Large samples: normal approximation is fine
  return normalInterval(values, level);
}

// ═══════════════════════════════════════════════════════════════
// SCORE WITH CONFIDENCE HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Create a score with confidence interval from judge scores.
 */
export function scoreWithJudgeConfidence(
  judgeScores: number[],
  level: number = 0.95,
): ScoreWithConfidence {
  const confidence = interJudgeInterval(judgeScores, level);
  return {
    score: confidence.estimate,
    confidence,
  };
}

/**
 * Create a score with confidence from repeated evaluations.
 */
export function scoreWithBootstrapConfidence(
  scores: number[],
  level: number = 0.95,
): ScoreWithConfidence {
  const confidence = bootstrapInterval(scores, level);
  return {
    score: confidence.estimate,
    confidence,
  };
}

/**
 * Format a confidence interval for display.
 */
export function formatConfidenceInterval(ci: ConfidenceInterval): string {
  const pct = Math.round(ci.level * 100);
  return `${ci.estimate.toFixed(3)} [${ci.lower.toFixed(3)}, ${
    ci.upper.toFixed(3)
  }] (${pct}% CI, n=${ci.n}, ${ci.method})`;
}

/**
 * Check if two confidence intervals overlap.
 *
 * Non-overlapping intervals suggest statistically significant difference.
 */
export function intervalsOverlap(
  a: ConfidenceInterval,
  b: ConfidenceInterval,
): boolean {
  return a.lower <= b.upper && b.lower <= a.upper;
}

/**
 * Calculate the width of a confidence interval.
 *
 * Narrower intervals indicate more precise estimates.
 */
export function intervalWidth(ci: ConfidenceInterval): number {
  return ci.upper - ci.lower;
}

import { z } from "zod";

/**
 * Centralized configuration with Zod validation.
 *
 * Fail-fast on startup if any env var is invalid/out-of-range.
 */

const EnvSchema = z.object({
  // ─────────────────────────────────────────────────
  // LM Studio / Model Configuration
  // ─────────────────────────────────────────────────
  LMSTUDIO_BASE_URL: z.string().url().default("http://127.0.0.1:1234/v1"),
  LMSTUDIO_API_KEY: z.string().default("lm-studio"),
  LMSTUDIO_MODEL: z.string().default("openai/gpt-oss-120b"),
  LMSTUDIO_JUDGE_MODEL: z.string().optional(),

  // ─────────────────────────────────────────────────
  // Generation Settings
  // ─────────────────────────────────────────────────
  GEN_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  GEN_MAX_TOKENS: z.coerce.number().int().min(100).max(16384).default(4096),

  // ─────────────────────────────────────────────────
  // Distributional Evaluation (Paper Section 3.1)
  // ─────────────────────────────────────────────────
  /** Number of replicate runs per epic to capture output distribution */
  EVAL_REPLICATES: z.coerce.number().int().min(1).max(50).default(5),

  /** Base seed for reproducibility; each replicate uses seedBase + i */
  EVAL_SEED_BASE: z.coerce.number().int().min(0).default(12345),

  /** K for "discoverability within K tries" approximation */
  DISCOVERABILITY_TRIES: z.coerce.number().int().min(1).max(10).default(3),

  // ─────────────────────────────────────────────────
  // Robust Objective Tuning
  // ─────────────────────────────────────────────────
  /** Penalty coefficient for score variance (higher = favor consistent prompts) */
  EVAL_STD_LAMBDA: z.coerce.number().min(0).max(5).default(0.25),

  /** Penalty for low pass rate (higher = favor reliable prompts) */
  EVAL_FAIL_PENALTY: z.coerce.number().min(0).max(5).default(0.4),

  // ─────────────────────────────────────────────────
  // Contrastive Pair Mining (Paper Section 3.2)
  // ─────────────────────────────────────────────────
  /** Minimum cosine similarity for outputs to be considered "near neighbors" */
  PAIR_MIN_SIM: z.coerce.number().min(0).max(1).default(0.86),

  /** Minimum score delta for a pair to be considered "contrastive" */
  PAIR_MIN_DELTA: z.coerce.number().min(0).max(2).default(0.15),

  /** Maximum contrastive pairs to feed to the patch engineer */
  PAIR_MAX_PAIRS: z.coerce.number().int().min(1).max(100).default(8),

  // ─────────────────────────────────────────────────
  // Prompt Patch Optimization (Paper Section 3.3)
  // ─────────────────────────────────────────────────
  /** Number of patch candidates to generate per optimization round */
  OPT_PATCH_CANDIDATES: z.coerce.number().int().min(1).max(50).default(10),

  /** Temperature for patch engineer LLM (higher = more diverse patches) */
  OPT_PATCH_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.6),

  // ─────────────────────────────────────────────────
  // Optimizer Settings
  // ─────────────────────────────────────────────────
  /** Number of optimization iterations */
  OPT_ITERATIONS: z.coerce.number().int().min(1).max(100).default(10),

  /** Improvement threshold for promotion (avoids noise-based promotions) */
  OPT_PROMOTION_THRESHOLD: z.coerce.number().min(0).max(1).default(0.01),

  /** Concurrency for parallel epic evaluation */
  OPT_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
});

// Parse and export validated config
export const env = EnvSchema.parse(process.env);

// Re-export the schema for testing/documentation
export { EnvSchema };

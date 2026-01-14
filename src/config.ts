import "@std/dotenv/load";
import { z } from "zod";

/**
 * Centralized configuration with Zod validation.
 *
 * Fail-fast on startup if any env var is invalid/out-of-range.
 */

const llmBaseUrlFallback = Deno.env.get("LLM_BASE_URL") ??
  Deno.env.get("LLM_API_BASE_URL");
const llmApiKeyFallback = Deno.env.get("LLM_API_KEY");
const llmModelFallback = Deno.env.get("LLM_MODEL");

const envBoolean = (defaultValue: boolean) =>
  z.string().optional().transform((value) => {
    if (value === undefined) return defaultValue;
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  });

const EnvSchema = z.object({
  // ─────────────────────────────────────────────────
  // LM Studio / Model Configuration
  // ─────────────────────────────────────────────────
  LMSTUDIO_BASE_URL: z.string().url().default(
    llmBaseUrlFallback ?? "http://127.0.0.1:1234/v1",
  ),
  LMSTUDIO_API_KEY: z.string().default(llmApiKeyFallback ?? "lm-studio"),
  LMSTUDIO_MODEL: z.string().default(llmModelFallback ?? "openai/gpt-oss-120b"),
  LMSTUDIO_JUDGE_MODEL: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000).default(
    120_000,
  ),

  // ─────────────────────────────────────────────────
  // Telemetry
  // ─────────────────────────────────────────────────
  TELEMETRY_REPORT_INTERVAL_MS: z.coerce.number().int().min(5_000).max(
    600_000,
  ).default(60_000),
  TELEMETRY_LOG_REQUESTS: envBoolean(true),
  TELEMETRY_INCLUDE_LLM_OUTPUT: envBoolean(false),
  TELEMETRY_LLM_PREVIEW_CHARS: z.coerce.number().int().min(0).max(5000).default(
    800,
  ),

  // ─────────────────────────────────────────────────
  // CORS
  // ─────────────────────────────────────────────────
  CORS_ALLOWED_ORIGINS: z.string().default(""),

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

  // ─────────────────────────────────────────────────
  // FPF PoLL Configuration (Panel of LLM Evaluators)
  // Based on arXiv 2404.18796 + FPF B.3 Trust Calculus
  // ─────────────────────────────────────────────────
  /** Enable PoLL (3-judge panel) instead of single judge */
  POLL_ENABLED: envBoolean(true),

  /** Number of judges in the panel (default: 3 per PoLL paper) */
  POLL_NUM_JUDGES: z.coerce.number().int().min(2).max(7).default(3),

  /** Temperature spread for judge diversity (judge_i gets base + i*spread) */
  POLL_TEMP_BASE: z.coerce.number().min(0).max(1).default(0.3),
  POLL_TEMP_SPREAD: z.coerce.number().min(0).max(0.5).default(0.2),

  // ─────────────────────────────────────────────────
  // FPF Congruence Penalty (Φ) Configuration
  // Per FPF B.3:4.4 - monotone decreasing penalties
  // ─────────────────────────────────────────────────
  /** Penalty for CL0 (weak guess - high disagreement) */
  FPF_PHI_CL0: z.coerce.number().min(0).max(1).default(0.3),

  /** Penalty for CL1 (plausible - moderate agreement) */
  FPF_PHI_CL1: z.coerce.number().min(0).max(1).default(0.15),

  /** Penalty for CL2 (validated - strong agreement) */
  FPF_PHI_CL2: z.coerce.number().min(0).max(1).default(0.05),

  /** Penalty for CL3 (verified - near-unanimous) */
  FPF_PHI_CL3: z.coerce.number().min(0).max(1).default(0.0),

  // ─────────────────────────────────────────────────
  // FPF Congruence Level Thresholds
  // Max inter-judge delta to achieve each CL
  // ─────────────────────────────────────────────────
  /** Max delta for CL3 (verified) */
  FPF_CL_THRESHOLD_CL3: z.coerce.number().min(0).max(1).default(0.1),

  /** Max delta for CL2 (validated) */
  FPF_CL_THRESHOLD_CL2: z.coerce.number().min(0).max(1).default(0.25),

  /** Max delta for CL1 (plausible) */
  FPF_CL_THRESHOLD_CL1: z.coerce.number().min(0).max(1).default(0.4),

  // ─────────────────────────────────────────────────
  // FPF NQD Portfolio Selection (C.18)
  // Multi-objective Pareto selection for tournament
  // ─────────────────────────────────────────────────
  /** Enable NQD selection in optimizer tournament */
  NQD_ENABLED: envBoolean(true),

  /** Constraint-fit threshold for eligibility (1.0 = perfect schema compliance) */
  NQD_CONSTRAINT_FIT_THRESHOLD: z.coerce.number().min(0).max(1).default(1.0),
});

// Parse and export validated config
export const env = EnvSchema.parse(Deno.env.toObject());

// Re-export the schema for testing/documentation
export { EnvSchema };

/**
 * Configuration Validation Test Suite
 *
 * These tests ensure configuration consistency between local development
 * (LM Studio) and deployment environments. Run before committing to catch
 * issues early.
 *
 * @module config.test
 */

import { assert, assertEquals, assertExists, assertThrows } from "@std/assert";
import { env, EnvSchema } from "../src/config.ts";

const isDeployed = Boolean(Deno.env.get("DENO_DEPLOYMENT_ID"));

// ─────────────────────────────────────────────────
// LM Studio Configuration Tests
// ─────────────────────────────────────────────────

Deno.test("LM Studio - should have valid LMSTUDIO_BASE_URL format", () => {
  if (isDeployed) return;
  const url = env.LMSTUDIO_BASE_URL;
  assertExists(url);
  const parsed = new URL(url); // Will throw if invalid
  assert(
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1",
    `Expected localhost or 127.0.0.1, got ${parsed.hostname}`,
  );
});

Deno.test("LM Studio - should have LMSTUDIO_API_KEY defined", () => {
  assertExists(env.LMSTUDIO_API_KEY);
  assert(env.LMSTUDIO_API_KEY.length > 0, "API key should not be empty");
});

Deno.test("LM Studio - should have LMSTUDIO_MODEL defined", () => {
  assertExists(env.LMSTUDIO_MODEL);
  assert(env.LMSTUDIO_MODEL.length > 0, "Model name should not be empty");
});

Deno.test("LM Studio - should have valid temperature range", () => {
  assert(env.GEN_TEMPERATURE >= 0, "Temperature should be >= 0");
  assert(env.GEN_TEMPERATURE <= 2, "Temperature should be <= 2");
});

Deno.test("LM Studio - should have valid max tokens range", () => {
  assert(env.GEN_MAX_TOKENS >= 100, "Max tokens should be >= 100");
  assert(env.GEN_MAX_TOKENS <= 16384, "Max tokens should be <= 16384");
});

// ─────────────────────────────────────────────────
// Evaluation Configuration Tests
// ─────────────────────────────────────────────────

Deno.test("Evaluation - should have valid EVAL_REPLICATES", () => {
  assert(env.EVAL_REPLICATES >= 1, "EVAL_REPLICATES should be >= 1");
  assert(env.EVAL_REPLICATES <= 50, "EVAL_REPLICATES should be <= 50");
});

Deno.test("Evaluation - should have valid EVAL_STD_LAMBDA", () => {
  assert(env.EVAL_STD_LAMBDA >= 0, "EVAL_STD_LAMBDA should be >= 0");
  assert(env.EVAL_STD_LAMBDA <= 5, "EVAL_STD_LAMBDA should be <= 5");
});

Deno.test("Evaluation - should have valid EVAL_FAIL_PENALTY", () => {
  assert(env.EVAL_FAIL_PENALTY >= 0, "EVAL_FAIL_PENALTY should be >= 0");
  assert(env.EVAL_FAIL_PENALTY <= 5, "EVAL_FAIL_PENALTY should be <= 5");
});

// ─────────────────────────────────────────────────
// Optimization Configuration Tests
// ─────────────────────────────────────────────────

Deno.test("Optimization - should have valid OPT_ITERATIONS", () => {
  assert(env.OPT_ITERATIONS >= 1, "OPT_ITERATIONS should be >= 1");
  assert(env.OPT_ITERATIONS <= 100, "OPT_ITERATIONS should be <= 100");
});

Deno.test("Optimization - should have valid OPT_PATCH_CANDIDATES", () => {
  assert(env.OPT_PATCH_CANDIDATES >= 1, "OPT_PATCH_CANDIDATES should be >= 1");
  assert(
    env.OPT_PATCH_CANDIDATES <= 50,
    "OPT_PATCH_CANDIDATES should be <= 50",
  );
});

Deno.test("Optimization - should have valid OPT_CONCURRENCY", () => {
  assert(env.OPT_CONCURRENCY >= 1, "OPT_CONCURRENCY should be >= 1");
  assert(env.OPT_CONCURRENCY <= 10, "OPT_CONCURRENCY should be <= 10");
});

Deno.test("Optimization - should have valid OPT_PROMOTION_THRESHOLD", () => {
  assert(
    env.OPT_PROMOTION_THRESHOLD >= 0,
    "OPT_PROMOTION_THRESHOLD should be >= 0",
  );
  assert(
    env.OPT_PROMOTION_THRESHOLD <= 1,
    "OPT_PROMOTION_THRESHOLD should be <= 1",
  );
});

// ─────────────────────────────────────────────────
// FPF Configuration Tests
// ─────────────────────────────────────────────────

Deno.test("FPF - should have valid POLL configuration", () => {
  assert(env.POLL_NUM_JUDGES >= 2, "POLL_NUM_JUDGES should be >= 2");
  assert(env.POLL_NUM_JUDGES <= 7, "POLL_NUM_JUDGES should be <= 7");
  assert(env.POLL_TEMP_BASE >= 0, "POLL_TEMP_BASE should be >= 0");
  assert(env.POLL_TEMP_BASE <= 1, "POLL_TEMP_BASE should be <= 1");
  assert(env.POLL_TEMP_SPREAD >= 0, "POLL_TEMP_SPREAD should be >= 0");
  assert(env.POLL_TEMP_SPREAD <= 0.5, "POLL_TEMP_SPREAD should be <= 0.5");
});

Deno.test("FPF - should have valid phi penalties in descending order", () => {
  // Lower congruence levels should have higher penalties
  assert(
    env.FPF_PHI_CL0 >= env.FPF_PHI_CL1,
    "FPF_PHI_CL0 should be >= FPF_PHI_CL1",
  );
  assert(
    env.FPF_PHI_CL1 >= env.FPF_PHI_CL2,
    "FPF_PHI_CL1 should be >= FPF_PHI_CL2",
  );
  assert(
    env.FPF_PHI_CL2 >= env.FPF_PHI_CL3,
    "FPF_PHI_CL2 should be >= FPF_PHI_CL3",
  );
});

// ─────────────────────────────────────────────────
// Pair Mining Configuration Tests
// ─────────────────────────────────────────────────

Deno.test("Pair Mining - should have valid similarity threshold", () => {
  assert(env.PAIR_MIN_SIM >= 0, "PAIR_MIN_SIM should be >= 0");
  assert(env.PAIR_MIN_SIM <= 1, "PAIR_MIN_SIM should be <= 1");
});

Deno.test("Pair Mining - should have valid delta threshold", () => {
  assert(env.PAIR_MIN_DELTA >= 0, "PAIR_MIN_DELTA should be >= 0");
  assert(env.PAIR_MIN_DELTA <= 2, "PAIR_MIN_DELTA should be <= 2");
});

Deno.test("Pair Mining - should have valid max pairs", () => {
  assert(env.PAIR_MAX_PAIRS >= 1, "PAIR_MAX_PAIRS should be >= 1");
  assert(env.PAIR_MAX_PAIRS <= 100, "PAIR_MAX_PAIRS should be <= 100");
});

// ─────────────────────────────────────────────────
// Schema Type Coercion Tests
// ─────────────────────────────────────────────────

Deno.test("Schema - should coerce string numbers to numbers", () => {
  const testEnv = {
    ...Deno.env.toObject(),
    GEN_TEMPERATURE: "0.8",
    GEN_MAX_TOKENS: "2048",
    EVAL_REPLICATES: "3",
  };

  const parsed = EnvSchema.parse(testEnv);
  assertEquals(typeof parsed.GEN_TEMPERATURE, "number");
  assertEquals(typeof parsed.GEN_MAX_TOKENS, "number");
  assertEquals(typeof parsed.EVAL_REPLICATES, "number");
});

Deno.test("Schema - should handle boolean values", () => {
  const testEnv = {
    ...Deno.env.toObject(),
    POLL_ENABLED: true,
    NQD_ENABLED: false,
  };

  const parsed = EnvSchema.parse(testEnv);
  assertEquals(typeof parsed.POLL_ENABLED, "boolean");
  assertEquals(parsed.POLL_ENABLED, true);
  assertEquals(parsed.NQD_ENABLED, false);
});

Deno.test("Schema - should reject invalid values", () => {
  const invalidEnv = {
    ...Deno.env.toObject(),
    GEN_TEMPERATURE: "invalid",
  };

  assertThrows(() => EnvSchema.parse(invalidEnv));
});

Deno.test("Schema - should reject out-of-range values", () => {
  const invalidEnv = {
    ...Deno.env.toObject(),
    GEN_TEMPERATURE: "5", // Max is 2
  };

  assertThrows(() => EnvSchema.parse(invalidEnv));
});

// ─────────────────────────────────────────────────
// Default Values Tests
// ─────────────────────────────────────────────────

Deno.test(
  "Defaults - should have sensible defaults when env vars are missing",
  () => {
    // Parse with minimal env
    const minimalEnv = {};
    const parsed = EnvSchema.parse(minimalEnv);

    // Check critical defaults exist
    assertEquals(parsed.LMSTUDIO_BASE_URL, "http://127.0.0.1:1234/v1");
    assertEquals(parsed.LMSTUDIO_API_KEY, "lm-studio");
    assertEquals(parsed.GEN_TEMPERATURE, 0.7);
    assertEquals(parsed.GEN_MAX_TOKENS, 4096);
    assertEquals(parsed.EVAL_REPLICATES, 5);
    assertEquals(parsed.OPT_ITERATIONS, 10);
  },
);

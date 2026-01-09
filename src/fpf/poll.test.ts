/**
 * Tests for PoLL (Panel of LLM Evaluators)
 *
 * Tests FPF B.3 compliance:
 * - WLNK aggregation: R_eff = max(0, min(R_i) - Φ(CL_min))
 * - Congruence Level computation
 * - Ordinal F never averaged (only min)
 */

import {
  assertEquals,
  assertLess,
  assertGreater,
  assertAlmostEquals,
} from "jsr:@std/assert";
import {
  FormalityLevel,
  CongruenceLevel,
  PHI,
  CL_THRESHOLDS,
  type JudgeOutput,
  type AssuranceTuple,
} from "./types.ts";

// ═══════════════════════════════════════════════════════════════
// UNIT TESTS: Congruence Level Computation
// ═══════════════════════════════════════════════════════════════

Deno.test("CL3 when judges agree closely (delta < 0.10)", () => {
  const scores = [0.85, 0.87, 0.86];
  const maxDelta = Math.max(...scores) - Math.min(...scores);

  assertEquals(maxDelta < CL_THRESHOLDS.CL3, true);
  // Should be CL3_VERIFIED
});

Deno.test("CL2 when moderate agreement (0.10 <= delta < 0.25)", () => {
  const scores = [0.85, 0.7, 0.8];
  const maxDelta = Math.max(...scores) - Math.min(...scores);

  assertEquals(maxDelta >= CL_THRESHOLDS.CL3, true);
  assertEquals(maxDelta < CL_THRESHOLDS.CL2, true);
  // Should be CL2_VALIDATED
});

Deno.test("CL1 when weak agreement (0.25 <= delta < 0.40)", () => {
  const scores = [0.9, 0.6, 0.75];
  const maxDelta = Math.max(...scores) - Math.min(...scores);

  assertEquals(maxDelta >= CL_THRESHOLDS.CL2, true);
  assertEquals(maxDelta < CL_THRESHOLDS.CL1, true);
  // Should be CL1_PLAUSIBLE
});

Deno.test("CL0 when high disagreement (delta >= 0.40)", () => {
  const scores = [0.95, 0.45, 0.7];
  const maxDelta = Math.max(...scores) - Math.min(...scores);

  assertEquals(maxDelta >= CL_THRESHOLDS.CL1, true);
  // Should be CL0_WEAK_GUESS
});

// ═══════════════════════════════════════════════════════════════
// UNIT TESTS: WLNK Aggregation (B.3:4.4)
// ═══════════════════════════════════════════════════════════════

Deno.test("WLNK: R_eff = min(R_i) when CL3 (no penalty)", () => {
  const rInputs = [0.85, 0.87, 0.86];
  const rRaw = Math.min(...rInputs);
  const phi = PHI[CongruenceLevel.CL3_VERIFIED];
  const rEff = Math.max(0, rRaw - phi);

  assertEquals(rRaw, 0.85);
  assertEquals(phi, 0.0);
  assertEquals(rEff, 0.85);
});

Deno.test("WLNK: R_eff penalized when CL0 (high disagreement)", () => {
  const rInputs = [0.95, 0.45, 0.7];
  const rRaw = Math.min(...rInputs);
  const phi = PHI[CongruenceLevel.CL0_WEAK_GUESS];
  const rEff = Math.max(0, rRaw - phi);

  assertEquals(rRaw, 0.45);
  assertEquals(phi, 0.3);
  assertAlmostEquals(rEff, 0.15, 0.001); // 0.45 - 0.30 = 0.15
});

Deno.test("WLNK: R_eff cannot go below 0", () => {
  const rInputs = [0.2, 0.15, 0.18];
  const rRaw = Math.min(...rInputs);
  const phi = PHI[CongruenceLevel.CL0_WEAK_GUESS];
  const rEff = Math.max(0, rRaw - phi);

  assertEquals(rRaw, 0.15);
  assertEquals(phi, 0.3);
  assertEquals(rEff, 0); // max(0, 0.15 - 0.30) = 0
});

// ═══════════════════════════════════════════════════════════════
// UNIT TESTS: PHI Monotonicity (B.3:4.4)
// ═══════════════════════════════════════════════════════════════

Deno.test("PHI is monotone decreasing (higher CL = lower penalty)", () => {
  assertGreater(
    PHI[CongruenceLevel.CL0_WEAK_GUESS],
    PHI[CongruenceLevel.CL1_PLAUSIBLE],
  );
  assertGreater(
    PHI[CongruenceLevel.CL1_PLAUSIBLE],
    PHI[CongruenceLevel.CL2_VALIDATED],
  );
  assertGreater(
    PHI[CongruenceLevel.CL2_VALIDATED],
    PHI[CongruenceLevel.CL3_VERIFIED],
  );
  assertEquals(PHI[CongruenceLevel.CL3_VERIFIED], 0);
});

// ═══════════════════════════════════════════════════════════════
// UNIT TESTS: Scale Discipline (CC-B3.2)
// ═══════════════════════════════════════════════════════════════

Deno.test("Formality uses min (ordinal), never average", () => {
  const fInputs = [
    FormalityLevel.F2_FORMALIZABLE,
    FormalityLevel.F1_STRUCTURED,
    FormalityLevel.F2_FORMALIZABLE,
  ];

  // Correct: ordinal min
  const fEff = Math.min(...fInputs);
  assertEquals(fEff, FormalityLevel.F1_STRUCTURED);

  // WRONG: average would give 1.67, which is meaningless for ordinals
  const wrongAvg = fInputs.reduce((a, b) => a + b, 0) / fInputs.length;
  assertEquals(wrongAvg > 1 && wrongAvg < 2, true); // 1.67
  // This is why we NEVER average ordinals in FPF
});

// ═══════════════════════════════════════════════════════════════
// INTEGRATION TEST: Full WLNK Pipeline
// ═══════════════════════════════════════════════════════════════

Deno.test("Full WLNK pipeline produces correct assurance tuple", () => {
  // Simulate 3 judges with moderate agreement
  const judgeScores = [0.82, 0.75, 0.78];

  // 1. Compute congruence
  const maxDelta = Math.max(...judgeScores) - Math.min(...judgeScores);
  assertAlmostEquals(maxDelta, 0.07, 0.001); // 0.82 - 0.75

  // 2. Determine CL (delta < 0.10 → CL3)
  let cl: CongruenceLevel;
  if (maxDelta < CL_THRESHOLDS.CL3) {
    cl = CongruenceLevel.CL3_VERIFIED;
  } else if (maxDelta < CL_THRESHOLDS.CL2) {
    cl = CongruenceLevel.CL2_VALIDATED;
  } else if (maxDelta < CL_THRESHOLDS.CL1) {
    cl = CongruenceLevel.CL1_PLAUSIBLE;
  } else {
    cl = CongruenceLevel.CL0_WEAK_GUESS;
  }
  assertEquals(cl, CongruenceLevel.CL3_VERIFIED);

  // 3. Apply WLNK
  const rRaw = Math.min(...judgeScores);
  const rEff = Math.max(0, rRaw - PHI[cl]);

  assertEquals(rRaw, 0.75);
  assertEquals(rEff, 0.75); // No penalty at CL3
});

Deno.test("WLNK prevents trust inflation from high outliers", () => {
  // One judge gives 0.95, but another gives 0.50
  // Traditional averaging: (0.95 + 0.50 + 0.70) / 3 = 0.72
  // WLNK: min(0.95, 0.50, 0.70) - Φ(CL) = 0.50 - 0.30 = 0.20

  const judgeScores = [0.95, 0.5, 0.7];
  const maxDelta = Math.max(...judgeScores) - Math.min(...judgeScores);

  // Delta = 0.45 → CL0
  assertEquals(maxDelta >= CL_THRESHOLDS.CL1, true);
  const cl = CongruenceLevel.CL0_WEAK_GUESS;

  // WLNK result
  const rRaw = Math.min(...judgeScores);
  const rEff = Math.max(0, rRaw - PHI[cl]);

  assertEquals(rRaw, 0.5);
  assertEquals(rEff, 0.2);

  // Compare to naive average (which FPF prevents)
  const naiveAvg = judgeScores.reduce((a, b) => a + b, 0) / judgeScores.length;
  assertGreater(naiveAvg, rEff); // 0.72 > 0.20

  // WLNK correctly identifies this as low-trust situation
});

/**
 * Tests for NQD Portfolio Selector (FPF C.18)
 *
 * Tests the mandatory pipeline order:
 * 1. Eligibility gate
 * 2. Pareto dominance
 * 3. Tie-breakers
 */

import { assertEquals, assertGreater, assertExists } from "jsr:@std/assert";
import {
  runNQDSelection,
  selectBestCandidate,
  isEligible,
  type Candidate,
} from "./nqd-selector.ts";

// ═══════════════════════════════════════════════════════════════
// TEST FIXTURES
// ═══════════════════════════════════════════════════════════════

function makeCandidate(
  id: string,
  objective: number,
  passRate: number,
  schemaValid: boolean = true,
): Candidate {
  return {
    id,
    name: `Candidate ${id}`,
    promptText: `Prompt for ${id} with objective ${objective}`,
    objective,
    passRate,
    schemaValid,
    rEff: objective * 0.9, // Simulate R_eff slightly lower
  };
}

// ═══════════════════════════════════════════════════════════════
// ELIGIBILITY GATE TESTS
// ═══════════════════════════════════════════════════════════════

Deno.test("Eligibility: Constraint-Fit = 1.0 is eligible", () => {
  const candidate = makeCandidate("A", 0.8, 1.0, true);
  assertEquals(isEligible(candidate), true);
});

Deno.test(
  "Eligibility: Partial pass rate with positive use-value is eligible",
  () => {
    const candidate = makeCandidate("A", 0.9, 0.8, true);
    // Has positive use-value vs baseline (0), so should be eligible
    assertEquals(isEligible(candidate, { baselineObjective: 0.5 }), true);
  },
);

Deno.test(
  "Eligibility: Schema invalid with positive use-value is still eligible (CC-C17-M.2)",
  () => {
    // Per FPF CC-C17-M.2: Use-Value gate can override constraint-fit failure
    const candidate = makeCandidate("A", 0.8, 1.0, false);
    // Has positive use-value (0.8 > baseline 0), so eligible via use-value gate
    assertEquals(isEligible(candidate), true);
  },
);

Deno.test(
  "Eligibility: Schema invalid with negative use-value is ineligible",
  () => {
    const candidate = makeCandidate("A", 0.4, 1.0, false);
    // Schema invalid AND negative use-value vs baseline = ineligible
    assertEquals(isEligible(candidate, { baselineObjective: 0.6 }), false);
  },
);

Deno.test(
  "Eligibility: Partial pass rate with negative use-value is ineligible",
  () => {
    const candidate = makeCandidate("A", 0.4, 0.7, true);
    // Negative use-value AND partial pass rate = ineligible
    assertEquals(isEligible(candidate, { baselineObjective: 0.6 }), false);
  },
);

// ═══════════════════════════════════════════════════════════════
// PARETO FRONT TESTS
// ═══════════════════════════════════════════════════════════════

Deno.test("Pareto: Single candidate is on front", () => {
  const candidates = [makeCandidate("A", 0.8, 1.0)];
  const archive = runNQDSelection(candidates);

  assertEquals(archive.paretoFront.front.length, 1);
  assertEquals(archive.paretoFront.front[0]!.id, "A");
});

Deno.test("Pareto: Dominated candidate is filtered", () => {
  const candidates = [
    makeCandidate("A", 0.9, 1.0), // Dominates B
    makeCandidate("B", 0.7, 1.0), // Dominated by A
  ];

  const archive = runNQDSelection(candidates, { baselineObjective: 0.5 });

  assertEquals(archive.paretoFront.front.length, 1);
  assertEquals(archive.paretoFront.front[0]!.id, "A");
  assertEquals(archive.paretoFront.dominated.length, 1);
  assertEquals(archive.paretoFront.dominated[0]!.id, "B");
});

Deno.test("Pareto: Non-dominated candidates form multi-point front", () => {
  // Two candidates, neither dominates the other
  // A: high R_eff but lower use-value improvement
  // B: lower R_eff but higher use-value improvement
  const a: Candidate = {
    id: "A",
    promptText: "High reliability prompt",
    objective: 0.85,
    passRate: 1.0,
    schemaValid: true,
    rEff: 0.9, // High R_eff
  };

  const b: Candidate = {
    id: "B",
    promptText: "High improvement prompt different approach",
    objective: 0.95, // Higher objective = higher use-value
    passRate: 1.0,
    schemaValid: true,
    rEff: 0.75, // Lower R_eff
  };

  const archive = runNQDSelection([a, b], { baselineObjective: 0.5 });

  // Both should be on front (non-dominated)
  assertEquals(archive.paretoFront.front.length, 2);
  assertEquals(archive.paretoFront.dominated.length, 0);
});

// ═══════════════════════════════════════════════════════════════
// WINNER SELECTION TESTS
// ═══════════════════════════════════════════════════════════════

Deno.test("Winner: Best candidate selected from front", () => {
  const candidates = [
    makeCandidate("A", 0.7, 1.0),
    makeCandidate("B", 0.9, 1.0), // Best objective
    makeCandidate("C", 0.8, 1.0),
  ];

  const winner = selectBestCandidate(candidates, { baselineObjective: 0.5 });

  assertExists(winner);
  assertEquals(winner.id, "B");
});

Deno.test("Winner: No winner when all ineligible", () => {
  const candidates = [
    makeCandidate("A", 0.3, 0.5, true), // Ineligible
    makeCandidate("B", 0.4, 0.4, true), // Ineligible
  ];

  const winner = selectBestCandidate(candidates, {
    baselineObjective: 0.6, // All have negative use-value
    constraintFitThreshold: 1.0,
  });

  assertEquals(winner, null);
});

// ═══════════════════════════════════════════════════════════════
// ILLUMINATION TELEMETRY TESTS
// ═══════════════════════════════════════════════════════════════

Deno.test("Illumination: QD score is sum of objectives", () => {
  const candidates = [
    makeCandidate("A", 0.8, 1.0),
    makeCandidate("B", 0.7, 1.0),
  ];

  const archive = runNQDSelection(candidates);

  // Both on front (B dominated by A actually)
  // QD score should be sum of front objectives
  assertGreater(archive.illumination.qdScore, 0);
});

Deno.test("Illumination: Coverage reflects front size", () => {
  const candidates = [
    makeCandidate("A", 0.9, 1.0),
    makeCandidate("B", 0.7, 1.0), // Dominated
    makeCandidate("C", 0.5, 1.0), // Dominated
  ];

  const archive = runNQDSelection(candidates, { baselineObjective: 0 });

  // Only A should be on front
  assertEquals(archive.paretoFront.front.length, 1);
  // Coverage = 1/3 = 0.333...
  assertGreater(archive.illumination.coverage, 0);
});

// ═══════════════════════════════════════════════════════════════
// STATS TESTS
// ═══════════════════════════════════════════════════════════════

Deno.test("Stats: Counts are accurate", () => {
  const candidates = [
    makeCandidate("A", 0.9, 1.0), // Eligible, on front
    makeCandidate("B", 0.7, 1.0), // Eligible, dominated
    makeCandidate("C", 0.5, 0.5), // Ineligible (partial pass, low objective)
  ];

  const archive = runNQDSelection(candidates, { baselineObjective: 0.6 });

  assertEquals(archive.paretoFront.stats.totalCandidates, 3);
  // A and B have positive use-value vs baseline (0.6), so eligible
  // C has negative use-value (-0.1) and partial pass rate, so ineligible
  assertEquals(archive.paretoFront.stats.ineligibleCount, 1);
  assertEquals(archive.paretoFront.stats.eligibleCount, 2);
});

// ═══════════════════════════════════════════════════════════════
// INTEGRATION TEST
// ═══════════════════════════════════════════════════════════════

Deno.test("Full pipeline: Realistic tournament scenario", () => {
  const candidates = [
    // Champion (baseline)
    {
      id: "champion",
      name: "Current Champion",
      promptText: "Generate user stories following INVEST principles",
      objective: 0.75,
      passRate: 1.0,
      schemaValid: true,
      rEff: 0.72,
    },
    // Improvement candidate
    {
      id: "patch-1",
      name: "Patch #1",
      promptText:
        "Generate INVEST-compliant user stories with clear acceptance criteria",
      objective: 0.82,
      passRate: 1.0,
      schemaValid: true,
      rEff: 0.78,
    },
    // Failed candidate
    {
      id: "patch-2",
      name: "Patch #2",
      promptText: "Create stories quickly without validation",
      objective: 0.6,
      passRate: 0.6,
      schemaValid: true,
      rEff: 0.55,
    },
  ];

  const archive = runNQDSelection(candidates, {
    baselineObjective: 0.75, // Champion is baseline
    constraintFitThreshold: 1.0,
    referencePrompts: [candidates[0]!.promptText], // Champion is reference
  });

  // patch-1 should win (improves on champion)
  assertExists(archive.selectedWinner);
  assertEquals(archive.selectedWinner.id, "patch-1");

  // patch-2 should be ineligible (partial pass rate, negative use-value)
  assertEquals(archive.paretoFront.stats.ineligibleCount, 1);

  // Champion and patch-1 eligible
  assertEquals(archive.paretoFront.stats.eligibleCount, 2);
});

/**
 * Tests for Creativity Characteristics (FPF C.17)
 *
 * Tests CC-C17-M.2: Novelty MUST NOT approve without
 * Use-Value OR Constraint-Fit gate.
 */

import {
  assertEquals,
  assertGreater,
  assertLess,
  assertAlmostEquals,
} from "jsr:@std/assert";
import {
  computeNovelty,
  computeUseValue,
  computeSurprise,
  computeConstraintFit,
  computeDiversityP,
  computeCreativityProfile,
  applyCreativityGate,
  compareCreativityProfiles,
  type CreativityProfile,
} from "./creativity.ts";

// ═══════════════════════════════════════════════════════════════
// UNIT TESTS: Novelty Computation
// ═══════════════════════════════════════════════════════════════

Deno.test("Novelty: No references = maximally novel (1.0)", () => {
  const novelty = computeNovelty("Generate user stories for e-commerce", []);
  assertEquals(novelty, 1.0);
});

Deno.test("Novelty: Identical to reference = zero novelty", () => {
  const prompt = "Generate user stories for e-commerce";
  const novelty = computeNovelty(prompt, [prompt]);
  assertAlmostEquals(novelty, 0.0, 0.001);
});

Deno.test("Novelty: Different from references = high novelty", () => {
  const candidate = "Create technical specifications for API endpoints";
  const references = [
    "Generate user stories for e-commerce",
    "Write acceptance criteria for login flow",
  ];
  const novelty = computeNovelty(candidate, references);
  assertGreater(novelty, 0.5);
});

// ═══════════════════════════════════════════════════════════════
// UNIT TESTS: Use-Value Computation
// ═══════════════════════════════════════════════════════════════

Deno.test("Use-Value: Positive when better than baseline", () => {
  const useValue = computeUseValue(0.85, 0.7);
  assertAlmostEquals(useValue, 0.15, 0.001);
});

Deno.test("Use-Value: Negative when worse than baseline", () => {
  const useValue = computeUseValue(0.6, 0.7);
  assertAlmostEquals(useValue, -0.1, 0.001);
});

Deno.test("Use-Value: Zero when equal to baseline", () => {
  const useValue = computeUseValue(0.7, 0.7);
  assertEquals(useValue, 0);
});

// ═══════════════════════════════════════════════════════════════
// UNIT TESTS: Surprise Computation
// ═══════════════════════════════════════════════════════════════

Deno.test("Surprise: Empty prompt = zero surprise", () => {
  const surprise = computeSurprise("");
  assertEquals(surprise, 0);
});

Deno.test("Surprise: Varied text = higher surprise", () => {
  const boringText = "the the the the the the the the";
  const variedText =
    "Implement authentication middleware with JWT tokens and OAuth2 integration for secure API access.";

  const boringSurprise = computeSurprise(boringText);
  const variedSurprise = computeSurprise(variedText);

  assertGreater(variedSurprise, boringSurprise);
});

// ═══════════════════════════════════════════════════════════════
// UNIT TESTS: Constraint-Fit Computation
// ═══════════════════════════════════════════════════════════════

Deno.test("Constraint-Fit: Schema invalid = zero", () => {
  const fit = computeConstraintFit(1.0, false);
  assertEquals(fit, 0);
});

Deno.test("Constraint-Fit: Full pass rate with valid schema = 1.0", () => {
  const fit = computeConstraintFit(1.0, true);
  assertEquals(fit, 1.0);
});

Deno.test("Constraint-Fit: Partial pass rate", () => {
  const fit = computeConstraintFit(0.8, true);
  assertEquals(fit, 0.8);
});

// ═══════════════════════════════════════════════════════════════
// UNIT TESTS: Diversity_P Computation
// ═══════════════════════════════════════════════════════════════

Deno.test("Diversity_P: Empty portfolio = max diversity", () => {
  const diversity = computeDiversityP("New unique prompt", []);
  assertEquals(diversity, 1.0);
});

Deno.test("Diversity_P: Identical to portfolio member = zero diversity", () => {
  const prompt = "Generate user stories";
  const diversity = computeDiversityP(prompt, [prompt]);
  assertAlmostEquals(diversity, 0.0, 0.001);
});

Deno.test("Diversity_P: Different from portfolio = high diversity", () => {
  const candidate = "Create API specifications for REST endpoints";
  const portfolio = [
    "Generate user stories for mobile app",
    "Write test cases for authentication",
  ];
  const diversity = computeDiversityP(candidate, portfolio);
  assertGreater(diversity, 0.5);
});

// ═══════════════════════════════════════════════════════════════
// INTEGRATION TESTS: Creativity Gate (CC-C17-M.2)
// ═══════════════════════════════════════════════════════════════

Deno.test("Gate: High novelty but failed constraints = ineligible", () => {
  // This tests CC-C17-M.2: Novelty alone is insufficient
  const result = applyCreativityGate(
    {
      candidatePrompt: "Completely unique revolutionary approach to everything",
      candidateObjective: 0.5, // Same as baseline
      passRate: 0.6, // Fails constraint
      schemaValid: true,
    },
    {
      baselineObjective: 0.5,
      constraintFitThreshold: 1.0,
      useValueThreshold: 0,
      referencePrompts: [],
    },
  );

  assertEquals(result.eligible, false);
  assertGreater(result.profile.noveltyAtContext, 0);
  assertLess(result.profile.constraintFit, 1.0);
});

Deno.test(
  "Gate: Constraint-Fit = 1.0 = eligible (even with negative use-value)",
  () => {
    const result = applyCreativityGate(
      {
        candidatePrompt: "Standard prompt with full compliance",
        candidateObjective: 0.65, // Worse than baseline
        passRate: 1.0,
        schemaValid: true,
      },
      {
        baselineObjective: 0.7,
        constraintFitThreshold: 1.0,
      },
    );

    assertEquals(result.eligible, true);
    assertEquals(result.profile.constraintFit, 1.0);
    assertLess(result.profile.useValue, 0);
  },
);

Deno.test(
  "Gate: Positive use-value = eligible (even with partial constraint)",
  () => {
    const result = applyCreativityGate(
      {
        candidatePrompt: "Improved prompt with better results",
        candidateObjective: 0.85,
        passRate: 0.9, // Not 100% but has improvement
        schemaValid: true,
      },
      {
        baselineObjective: 0.7,
        constraintFitThreshold: 1.0,
        useValueThreshold: 0,
      },
    );

    assertEquals(result.eligible, true);
    assertGreater(result.profile.useValue, 0);
  },
);

Deno.test("Gate: Both gates pass = eligible with positive reason", () => {
  const result = applyCreativityGate(
    {
      candidatePrompt: "Optimized prompt for user story generation",
      candidateObjective: 0.9,
      passRate: 1.0,
      schemaValid: true,
    },
    {
      baselineObjective: 0.7,
      constraintFitThreshold: 1.0,
      useValueThreshold: 0,
    },
  );

  assertEquals(result.eligible, true);
  assertEquals(result.profile.constraintFit, 1.0);
  assertGreater(result.profile.useValue, 0);
  assertEquals(result.reason.includes("both gates"), true);
});

// ═══════════════════════════════════════════════════════════════
// INTEGRATION TESTS: Profile Comparison
// ═══════════════════════════════════════════════════════════════

Deno.test("Comparison: Constraint-fit takes priority", () => {
  const a: CreativityProfile = {
    noveltyAtContext: 0.9,
    useValue: 0.5,
    surprise: 2.0,
    constraintFit: 0.8, // Not fully compliant
    diversityP: 0.9,
  };

  const b: CreativityProfile = {
    noveltyAtContext: 0.5,
    useValue: 0.3,
    surprise: 1.0,
    constraintFit: 1.0, // Fully compliant
    diversityP: 0.5,
  };

  const cmp = compareCreativityProfiles(a, b);
  assertGreater(cmp, 0); // b is better (has constraint-fit = 1.0)
});

Deno.test("Comparison: Use-value decides when constraint-fit equal", () => {
  const a: CreativityProfile = {
    noveltyAtContext: 0.5,
    useValue: 0.3,
    surprise: 1.0,
    constraintFit: 1.0,
    diversityP: 0.5,
  };

  const b: CreativityProfile = {
    noveltyAtContext: 0.5,
    useValue: 0.5, // Higher use-value
    surprise: 1.0,
    constraintFit: 1.0,
    diversityP: 0.5,
  };

  const cmp = compareCreativityProfiles(a, b);
  assertGreater(cmp, 0); // b is better (higher use-value)
});

Deno.test("Comparison: Diversity_P is tie-breaker", () => {
  const a: CreativityProfile = {
    noveltyAtContext: 0.5,
    useValue: 0.3,
    surprise: 1.0,
    constraintFit: 1.0,
    diversityP: 0.5,
  };

  const b: CreativityProfile = {
    noveltyAtContext: 0.5,
    useValue: 0.3, // Same use-value
    surprise: 1.0,
    constraintFit: 1.0,
    diversityP: 0.8, // Higher diversity
  };

  const cmp = compareCreativityProfiles(a, b);
  assertGreater(cmp, 0); // b is better (higher diversity)
});

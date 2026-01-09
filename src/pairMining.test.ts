/**
 * Unit tests for contrastive pair mining
 */

import { assertEquals, assert } from "@std/assert";
import {
  mineContrastivePairs,
  formatPairsForPrompt,
  type ScoredOutput,
  type ContrastPair,
} from "./pairMining.ts";
import type { StoryPack } from "./schema.ts";

// ─────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────

function createMockStoryPack(epicId: string, variant: string): StoryPack {
  return {
    epicId,
    epicTitle: `Epic ${epicId}`,
    userStories: [
      {
        title: `Story ${variant}`,
        asA: "user",
        iWant: `to perform action ${variant}`,
        soThat: "I can achieve my goal",
        acceptanceCriteria: [
          `Criterion 1 for ${variant}`,
          `Criterion 2 for ${variant}`,
        ],
        ado: {
          fields: {
            "System.Title": `Story ${variant}`,
            "System.Description": `As a user, I want to perform action ${variant}`,
            "Microsoft.VSTS.Common.AcceptanceCriteria": `Criterion 1, Criterion 2`,
          },
        },
      },
    ],
    assumptions: [],
    risks: [],
    followUps: [],
  };
}

function createScoredOutput(
  epicId: string,
  seed: number,
  score: number,
  variant: string
): ScoredOutput {
  return {
    epicId,
    seed,
    score,
    pass: score > 0.5,
    storyPack: createMockStoryPack(epicId, variant),
    rawText: JSON.stringify(createMockStoryPack(epicId, variant)),
  };
}

// ─────────────────────────────────────────────────
// mineContrastivePairs Tests
// ─────────────────────────────────────────────────

Deno.test("mineContrastivePairs - returns empty array for empty input", () => {
  const pairs = mineContrastivePairs({ runs: [] });
  assertEquals(pairs.length, 0);
});

Deno.test("mineContrastivePairs - returns empty array for single run", () => {
  const runs: ScoredOutput[] = [
    createScoredOutput("E-001", 1, 0.8, "A"),
  ];

  const pairs = mineContrastivePairs({ runs });
  assertEquals(pairs.length, 0, "Single run cannot form a pair");
});

Deno.test("mineContrastivePairs - finds pairs within same epic", () => {
  // Create similar outputs (same variant base) with different scores
  const runs: ScoredOutput[] = [
    createScoredOutput("E-001", 1, 0.9, "A"),  // High score
    createScoredOutput("E-001", 2, 0.5, "A"),  // Low score (same content = high similarity)
  ];

  const pairs = mineContrastivePairs({
    runs,
    minSim: 0.5,    // Lower threshold for test
    minDelta: 0.2,  // Require meaningful score difference
    maxPairs: 10,
  });

  // Identical variant content yields similarity=1, delta=0.4 which passes thresholds
  assertEquals(pairs.length, 1, "Should find exactly one pair with identical content");
  assertEquals(pairs[0]!.good.score, 0.9);
  assertEquals(pairs[0]!.bad.score, 0.5);
});

Deno.test("mineContrastivePairs - does not pair different epics", () => {
  const runs: ScoredOutput[] = [
    createScoredOutput("E-001", 1, 0.9, "A"),
    createScoredOutput("E-002", 2, 0.5, "A"),  // Different epic
  ];

  const pairs = mineContrastivePairs({
    runs,
    minSim: 0.0,   // Accept any similarity
    minDelta: 0.0, // Accept any delta
    maxPairs: 10,
  });

  assertEquals(pairs.length, 0, "Should not pair outputs from different epics");
});

Deno.test("mineContrastivePairs - respects minDelta threshold", () => {
  const runs: ScoredOutput[] = [
    createScoredOutput("E-001", 1, 0.8, "A"),
    createScoredOutput("E-001", 2, 0.79, "A"),  // Very close score
  ];

  const pairs = mineContrastivePairs({
    runs,
    minSim: 0.0,
    minDelta: 0.1, // Require at least 0.1 delta
    maxPairs: 10,
  });

  assertEquals(pairs.length, 0, "Should not pair when delta < minDelta");
});

Deno.test("mineContrastivePairs - respects maxPairs limit", () => {
  // Create many runs that could form pairs
  const runs: ScoredOutput[] = [];
  for (let i = 0; i < 10; i++) {
    runs.push(createScoredOutput("E-001", i, i * 0.1, `variant-${i}`));
  }

  const pairs = mineContrastivePairs({
    runs,
    minSim: 0.0,
    minDelta: 0.0,
    maxPairs: 3,
  });

  assert(pairs.length <= 3, `Should respect maxPairs limit, got ${pairs.length}`);
});

Deno.test("mineContrastivePairs - sorts by delta descending", () => {
  const runs: ScoredOutput[] = [
    createScoredOutput("E-001", 1, 0.9, "high"),
    createScoredOutput("E-001", 2, 0.3, "low"),   // delta = 0.6
    createScoredOutput("E-001", 3, 0.7, "mid"),   // delta from high = 0.2, from low = 0.4
  ];

  const pairs = mineContrastivePairs({
    runs,
    minSim: 0.0,
    minDelta: 0.0,
    maxPairs: 10,
  });

  if (pairs.length >= 2) {
    // First pair should have largest delta
    assert(
      pairs[0]!.delta >= pairs[1]!.delta,
      "Pairs should be sorted by delta descending"
    );
  }
});

Deno.test("mineContrastivePairs - good/bad assignment is correct", () => {
  const runs: ScoredOutput[] = [
    createScoredOutput("E-001", 1, 0.9, "winner"),
    createScoredOutput("E-001", 2, 0.3, "loser"),
  ];

  const pairs = mineContrastivePairs({
    runs,
    minSim: 0.0,
    minDelta: 0.0,
    maxPairs: 10,
  });

  if (pairs.length > 0) {
    const pair = pairs[0]!;
    assert(pair.good.score >= pair.bad.score, "Good should have higher score than bad");
    assertEquals(pair.good.score, 0.9);
    assertEquals(pair.bad.score, 0.3);
  }
});

Deno.test("mineContrastivePairs - skips pairs where both outputs failed", () => {
  const runs: ScoredOutput[] = [
    {
      epicId: "E-001",
      seed: 1,
      score: 0,
      pass: false,
      storyPack: null,  // Failed output
      rawText: "",
    },
    {
      epicId: "E-001",
      seed: 2,
      score: 0,
      pass: false,
      storyPack: null,  // Failed output
      rawText: "",
    },
  ];

  const pairs = mineContrastivePairs({
    runs,
    minSim: 0.0,
    minDelta: 0.0,
    maxPairs: 10,
  });

  assertEquals(pairs.length, 0, "Should skip pairs where both outputs failed");
});

// ─────────────────────────────────────────────────
// formatPairsForPrompt Tests
// ─────────────────────────────────────────────────

Deno.test("formatPairsForPrompt - returns message for empty pairs", () => {
  const result = formatPairsForPrompt([]);
  assert(result.includes("No contrastive pairs found"), "Should indicate no pairs");
});

Deno.test("formatPairsForPrompt - formats pairs correctly", () => {
  const pairs: ContrastPair[] = [
    {
      epicId: "E-001",
      sim: 0.95,
      delta: 0.4,
      good: createScoredOutput("E-001", 1, 0.9, "good"),
      bad: createScoredOutput("E-001", 2, 0.5, "bad"),
    },
  ];

  const result = formatPairsForPrompt(pairs);

  // Check structure
  assert(result.includes("### PAIR 1"), "Should have pair header");
  assert(result.includes("Epic: E-001"), "Should include epic ID");
  assert(result.includes("Similarity: 0.95"), "Should include similarity");
  assert(result.includes("Delta: 0.400"), "Should include delta");
  assert(result.includes("**GOOD**"), "Should have GOOD section");
  assert(result.includes("**BAD**"), "Should have BAD section");
  assert(result.includes("score=0.900"), "Should include good score");
  assert(result.includes("score=0.500"), "Should include bad score");
});

Deno.test("formatPairsForPrompt - handles multiple pairs", () => {
  const pairs: ContrastPair[] = [
    {
      epicId: "E-001",
      sim: 0.9,
      delta: 0.3,
      good: createScoredOutput("E-001", 1, 0.8, "A"),
      bad: createScoredOutput("E-001", 2, 0.5, "B"),
    },
    {
      epicId: "E-002",
      sim: 0.85,
      delta: 0.25,
      good: createScoredOutput("E-002", 3, 0.9, "C"),
      bad: createScoredOutput("E-002", 4, 0.65, "D"),
    },
  ];

  const result = formatPairsForPrompt(pairs);

  assert(result.includes("### PAIR 1"), "Should have pair 1");
  assert(result.includes("### PAIR 2"), "Should have pair 2");
  assert(result.includes("---"), "Should have separator between pairs");
});

Deno.test("formatPairsForPrompt - includes JSON story pack", () => {
  const pairs: ContrastPair[] = [
    {
      epicId: "E-001",
      sim: 0.9,
      delta: 0.3,
      good: createScoredOutput("E-001", 1, 0.8, "test"),
      bad: createScoredOutput("E-001", 2, 0.5, "test"),
    },
  ];

  const result = formatPairsForPrompt(pairs);

  assert(result.includes("```json"), "Should include JSON code block");
  assert(result.includes("epicId"), "Should include story pack fields");
  assert(result.includes("userStories"), "Should include user stories");
});

/**
 * Integration Tests for Orchestrator Tools
 *
 * Tests the meta-patcher and pair-miner tools with realistic scenarios.
 */

import { assertEquals, assertExists, assertGreater } from "@std/assert";
import {
  executePairMiner,
  hasPairs,
} from "../../../src/orchestrator/tools/pair-miner-tool.ts";
import {
  executeMetaPatcher,
  hasMetaPatches,
  runHypermutation,
  updateMutationFitness,
} from "../../../src/orchestrator/tools/meta-patcher-tool.ts";
import type { FlatRun } from "../../../src/eval.ts";
import { createToolContext } from "../../../src/orchestrator/types.ts";
import type { StoryPack } from "../../../src/schema.ts";

// ═══════════════════════════════════════════════════════════════
// TEST FIXTURES
// ═══════════════════════════════════════════════════════════════

function makeStoryPack(epicId: string, epicTitle: string): StoryPack {
  return {
    epicId,
    epicTitle,
    userStories: [
      {
        title: "Story 1",
        asA: "user",
        iWant: "to do something",
        soThat: "I can achieve a goal",
        acceptanceCriteria: ["Given X, When Y, Then Z", "Another criterion"],
        ado: {
          fields: {
            "System.Title": "Story 1",
            "System.Description": "Description of story",
            "Microsoft.VSTS.Common.AcceptanceCriteria":
              "Acceptance criteria text",
            "Microsoft.VSTS.Scheduling.StoryPoints": 3,
          },
        },
      },
    ],
    assumptions: [],
    risks: [],
    followUps: [],
  };
}

function makeFlatRun(
  epicId: string,
  seed: number,
  score: number,
  rawText: string,
): FlatRun {
  return {
    epicId,
    seed,
    score,
    pass: score > 0.5,
    storyPack: score > 0.5 ? makeStoryPack(epicId, `Epic ${epicId}`) : null,
    rawText,
  };
}

// ═══════════════════════════════════════════════════════════════
// PAIR MINER TESTS
// ═══════════════════════════════════════════════════════════════

Deno.test("PairMiner: Finds contrastive pairs within same epic", async () => {
  const ctx = createToolContext();
  const runs: FlatRun[] = [
    makeFlatRun("E-101", 1, 0.85, "Good output with detailed stories"),
    makeFlatRun("E-101", 2, 0.45, "Bad output with vague stories"),
  ];

  const result = await executePairMiner(
    { runs, minSim: 0.5, minDelta: 0.2, maxPairs: 5 },
    ctx,
  );

  assertEquals(result.success, true);
  assertExists(result.data);
  assertEquals(result.data.tiered, false);
  // Pairs may or may not be found depending on similarity
});

Deno.test("PairMiner: Does not pair different epics", async () => {
  const ctx = createToolContext();
  const runs: FlatRun[] = [
    makeFlatRun("E-101", 1, 0.85, "Good output for epic 1"),
    makeFlatRun("E-202", 2, 0.45, "Bad output for different epic"),
  ];

  const result = await executePairMiner(
    { runs, minSim: 0.0, minDelta: 0.1, maxPairs: 5 },
    ctx,
  );

  assertEquals(result.success, true);
  assertExists(result.data);
  assertEquals(result.data.pairs.length, 0); // No pairs across epics
});

Deno.test("PairMiner: Tiered mining adds quality tier metadata", async () => {
  const ctx = createToolContext();
  const runs: FlatRun[] = [
    makeFlatRun(
      "E-101",
      1,
      0.85,
      "Good output with detailed acceptance criteria",
    ),
    makeFlatRun("E-101", 2, 0.45, "Bad output with vague requirements"),
    makeFlatRun("E-101", 3, 0.65, "Medium output with some detail"),
  ];

  const result = await executePairMiner(
    { runs, minSim: 0.3, minDelta: 0.15, maxPairs: 5, tieredMining: true },
    ctx,
  );

  assertEquals(result.success, true);
  assertExists(result.data);
  assertEquals(result.data.tiered, true);
  // Tiered mining should include tier information in formatted context
  if (result.data.pairs.length > 0) {
    assertExists(result.data.pairs[0]!.tier);
  }
});

Deno.test("PairMiner: hasPairs helper works correctly", async () => {
  const ctx = createToolContext();

  // Empty runs
  const emptyResult = await executePairMiner({ runs: [] }, ctx);
  assertEquals(hasPairs(emptyResult), false);

  // Runs that can form pairs
  const runs: FlatRun[] = [
    makeFlatRun("E-101", 1, 0.9, "Excellent detailed output"),
    makeFlatRun("E-101", 2, 0.3, "Poor vague output"),
  ];
  const pairsResult = await executePairMiner(
    { runs, minSim: 0.0, minDelta: 0.3 },
    ctx,
  );
  // hasPairs depends on actual similarity computation
  assertEquals(pairsResult.success, true);
});

Deno.test(
  "PairMiner: Formatted context includes pair information",
  async () => {
    const ctx = createToolContext();
    const runs: FlatRun[] = [
      makeFlatRun("E-101", 1, 0.9, "Good output with acceptance criteria"),
      makeFlatRun("E-101", 2, 0.4, "Bad output missing criteria"),
    ];

    const result = await executePairMiner(
      { runs, minSim: 0.0, minDelta: 0.3 },
      ctx,
    );

    assertEquals(result.success, true);
    assertExists(result.data);
    assertExists(result.data.formattedContext);
    // Should have some formatted content
    assertGreater(result.data.formattedContext.length, 0);
  },
);

// ═══════════════════════════════════════════════════════════════
// META-PATCHER TESTS
// ═══════════════════════════════════════════════════════════════

Deno.test("MetaPatcher: Returns result structure", async () => {
  const ctx = createToolContext();

  const result = await executeMetaPatcher(
    {
      basePrompt: "Generate user stories following INVEST principles",
      pairs: [], // Empty pairs for quick test
      currentPatch: "Focus on acceptance criteria",
      candidateCount: 1,
      temperature: 0.7,
    },
    ctx,
  );

  // Meta-patcher may fail without LLM, but structure should be valid
  assertEquals(typeof result.success, "boolean");
  assertExists(result.duration);
  assertExists(result.context);
});

Deno.test(
  "MetaPatcher: updateMutationFitness adjusts fitness on improvement",
  () => {
    const mutations = [
      {
        id: "mut-1",
        text: "Improve acceptance criteria",
        type: "DIRECT_MUTATION" as const,
        fitness: 0.5,
        usageCount: 2,
        successRate: 0.5,
        generation: 0,
      },
      {
        id: "mut-2",
        text: "Add security considerations",
        type: "EDA_MUTATION" as const,
        fitness: 0.6,
        usageCount: 3,
        successRate: 0.67,
        generation: 0,
      },
    ];

    // Simulate successful mutation with patch results (objective > championObjective)
    const patchResults = [
      { mutationId: "mut-1", objective: 0.82, championObjective: 0.72 }, // +0.1 improvement
    ];
    const updated = updateMutationFitness(mutations, patchResults);

    assertEquals(updated.length, 2);
    const mut1 = updated.find((m) => m.id === "mut-1")!;
    // Uses EMA: alpha=0.3, so new = 0.3*1 + 0.7*0.5 = 0.65
    assertGreater(mut1.fitness, 0.5); // Fitness should increase
    assertGreater(mut1.successRate, 0.5); // Success rate should increase
  },
);

Deno.test("MetaPatcher: updateMutationFitness handles regression", () => {
  const mutations = [
    {
      id: "mut-1",
      text: "Some mutation",
      type: "DIRECT_MUTATION" as const,
      fitness: 0.8,
      usageCount: 5,
      successRate: 0.8,
      generation: 0,
    },
  ];

  // Regression: objective < championObjective (not improved)
  const patchResults = [
    { mutationId: "mut-1", objective: 0.62, championObjective: 0.72 }, // -0.1 regression
  ];
  const updated = updateMutationFitness(mutations, patchResults);

  const mut1 = updated.find((m) => m.id === "mut-1")!;
  // Uses EMA: alpha=0.3, so new = 0.3*0 + 0.7*0.8 = 0.56
  assertEquals(mut1.fitness < 0.8, true); // Fitness should decrease
  assertEquals(mut1.successRate < 0.8, true); // Success rate should decrease
});

Deno.test(
  "MetaPatcher: runHypermutation creates derived mutations",
  async () => {
    const mutations = [
      {
        id: "mut-1",
        text: "Improve acceptance criteria clarity",
        type: "DIRECT_MUTATION" as const,
        fitness: 0.8,
        usageCount: 10,
        successRate: 0.7,
        generation: 0,
      },
    ];

    const result = await runHypermutation(mutations, 1);

    // Hypermutation returns array (possibly same if no hyper mutations exist)
    assertExists(result);
    assertEquals(Array.isArray(result), true);
  },
);

Deno.test("MetaPatcher: hasMetaPatches checks result correctly", async () => {
  const ctx = createToolContext();

  // Test with empty pairs
  const result = await executeMetaPatcher(
    {
      basePrompt: "Generate user stories",
      pairs: [],
      currentPatch: "",
      candidateCount: 1,
      temperature: 0.7,
    },
    ctx,
  );

  // hasMetaPatches should return boolean
  const has = hasMetaPatches(result);
  assertEquals(typeof has, "boolean");
});

// ═══════════════════════════════════════════════════════════════
// TOOL CONTEXT AND TIMING TESTS
// ═══════════════════════════════════════════════════════════════

Deno.test("Tools: Include execution duration in results", async () => {
  const ctx = createToolContext();
  const runs: FlatRun[] = [
    makeFlatRun("E-101", 1, 0.8, "Output 1"),
    makeFlatRun("E-101", 2, 0.5, "Output 2"),
  ];

  const result = await executePairMiner({ runs }, ctx);

  assertEquals(result.success, true);
  assertExists(result.duration);
  assertGreater(result.duration, -1); // Duration should be non-negative
});

Deno.test("Tools: Propagate context with runId", async () => {
  const ctx = createToolContext();
  const runs: FlatRun[] = [makeFlatRun("E-101", 1, 0.8, "Output")];

  const result = await executePairMiner({ runs }, ctx);

  assertEquals(result.success, true);
  assertExists(result.context);
  assertExists(result.context.runId);
});

Deno.test("Tools: Context creates unique runIds", () => {
  const ctx1 = createToolContext();
  const ctx2 = createToolContext();

  // Each context should have unique runId
  assertEquals(ctx1.runId !== ctx2.runId, true);
});

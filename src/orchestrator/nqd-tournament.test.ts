/**
 * Tests for NQD Tournament Adapter
 *
 * Verifies that the NQD selection integrates correctly with
 * the optimization loop's tournament system.
 */

import {
  assertEquals,
  assertExists,
  assertGreater,
} from "jsr:@std/assert";
import {
  runNQDTournament,
  selectNQDWinner,
  enrichWithPrompts,
  type NQDTournamentCandidate,
} from "./nqd-tournament.ts";

// ═══════════════════════════════════════════════════════════════
// TEST FIXTURES
// ═══════════════════════════════════════════════════════════════

function makeCandidate(
  id: string,
  objective: number,
  passRate: number = 1.0,
  schemaValid: boolean = true
): NQDTournamentCandidate {
  return {
    id,
    patch: `Patch for ${id}`,
    objective,
    isChampion: false,
    deltaVsChampion: objective - 0.7, // Assume champion at 0.7
    promptText: `Full prompt text for ${id} with objective ${objective}`,
    passRate,
    schemaValid,
  };
}

// ═══════════════════════════════════════════════════════════════
// BASIC FUNCTIONALITY TESTS
// ═══════════════════════════════════════════════════════════════

Deno.test("NQD Tournament: Single candidate returns as winner", () => {
  const candidates = [makeCandidate("A", 0.8)];
  const result = runNQDTournament(candidates, { championObjective: 0.7 });

  assertExists(result.winner);
  assertEquals(result.winner.id, "A");
  assertEquals(result.candidates.length, 1);
});

Deno.test("NQD Tournament: Empty candidates returns null winner", () => {
  const result = runNQDTournament([], { championObjective: 0.7 });

  assertEquals(result.winner, null);
  assertEquals(result.candidates.length, 0);
});

Deno.test("NQD Tournament: Best objective wins when all eligible", () => {
  const candidates = [
    makeCandidate("A", 0.75),
    makeCandidate("B", 0.85), // Best
    makeCandidate("C", 0.80),
  ];

  const result = runNQDTournament(candidates, { championObjective: 0.7 });

  assertExists(result.winner);
  assertEquals(result.winner.id, "B");
});

Deno.test("NQD Tournament: Ineligible candidates are filtered", () => {
  const candidates = [
    makeCandidate("A", 0.9, 0.5, true),   // Partial pass rate
    makeCandidate("B", 0.75, 1.0, true),  // Perfect pass rate
  ];

  // With baseline at 0.8, A has negative use-value (-0.1) and partial pass
  const result = runNQDTournament(candidates, {
    championObjective: 0.95,
    constraintFitThreshold: 1.0,
  });

  // A should be ineligible (negative use-value + partial pass)
  // B should be ineligible too (negative use-value + perfect pass... wait, B also has negative use-value)
  // Let me adjust: with baseline 0.95, both have negative use-value
  // A: pass=0.5, use-value=-0.05 -> ineligible (partial pass + negative UV)
  // B: pass=1.0, use-value=-0.2 -> eligible via constraint gate!

  assertEquals(result.archive.paretoFront.stats.ineligibleCount, 1);
});

Deno.test("NQD Tournament: Archive contains illumination telemetry", () => {
  const candidates = [
    makeCandidate("A", 0.8),
    makeCandidate("B", 0.85),
  ];

  const result = runNQDTournament(candidates, { championObjective: 0.7 });

  assertExists(result.archive.illumination);
  assertGreater(result.archive.illumination.qdScore, 0);
  assertGreater(result.archive.illumination.coverage, 0);
});

Deno.test("NQD Tournament: nqdChangedWinner is false when same as simple sort", () => {
  const candidates = [
    makeCandidate("A", 0.75),
    makeCandidate("B", 0.85), // Best by both methods
    makeCandidate("C", 0.80),
  ];

  const result = runNQDTournament(candidates, { championObjective: 0.7 });

  // B should win by both NQD and simple sort
  assertEquals(result.nqdChangedWinner, false);
});

// ═══════════════════════════════════════════════════════════════
// PARETO FRONT TESTS
// ═══════════════════════════════════════════════════════════════

Deno.test("NQD Tournament: Pareto front contains non-dominated candidates", () => {
  const candidates = [
    makeCandidate("A", 0.9),  // Dominates B and C
    makeCandidate("B", 0.8),
    makeCandidate("C", 0.7),
  ];

  const result = runNQDTournament(candidates, { championObjective: 0.5 });

  // A dominates all others on both R_eff (objective proxy) and use-value
  assertEquals(result.archive.paretoFront.stats.frontSize, 1);
  assertEquals(result.archive.paretoFront.front[0]!.id, "A");
});

// ═══════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTION TESTS
// ═══════════════════════════════════════════════════════════════

Deno.test("selectNQDWinner: Returns winner directly", () => {
  const candidates = [
    makeCandidate("A", 0.75),
    makeCandidate("B", 0.85),
  ];

  const winner = selectNQDWinner(candidates, { championObjective: 0.7 });

  assertExists(winner);
  assertEquals(winner.id, "B");
});

Deno.test("enrichWithPrompts: Converts basic candidates", () => {
  const basicCandidates = [
    { id: "A", patch: "patch A", objective: 0.8, isChampion: false, deltaVsChampion: 0.1 },
    { id: "B", patch: "patch B", objective: 0.7, isChampion: false, deltaVsChampion: 0.0 },
  ];

  const enriched = enrichWithPrompts(basicCandidates, (id, patch) => `Prompt: ${patch}`);

  assertEquals(enriched.length, 2);
  assertEquals(enriched[0]!.promptText, "Prompt: patch A");
  assertEquals(enriched[0]!.passRate, 1.0);
  assertEquals(enriched[0]!.schemaValid, true);
});

// ═══════════════════════════════════════════════════════════════
// INTEGRATION SCENARIO TEST
// ═══════════════════════════════════════════════════════════════

Deno.test("NQD Tournament: Realistic optimization scenario", () => {
  // Simulate a real tournament with champion at 0.72
  const championObjective = 0.72;
  const championPrompt = "Generate user stories following INVEST principles";

  const candidates: NQDTournamentCandidate[] = [
    {
      id: "patch-1",
      patch: "Add: Focus on clear acceptance criteria",
      objective: 0.78,
      isChampion: false,
      deltaVsChampion: 0.06,
      promptText: "Generate user stories following INVEST principles\n\n## PATCH\nAdd: Focus on clear acceptance criteria",
      passRate: 1.0,
      schemaValid: true,
    },
    {
      id: "patch-2",
      patch: "Add: Include story points estimation",
      objective: 0.75,
      isChampion: false,
      deltaVsChampion: 0.03,
      promptText: "Generate user stories following INVEST principles\n\n## PATCH\nAdd: Include story points estimation",
      passRate: 0.9, // Some schema failures
      schemaValid: true,
    },
    {
      id: "patch-3",
      patch: "Add: Rewrite everything differently",
      objective: 0.68, // Worse than champion
      isChampion: false,
      deltaVsChampion: -0.04,
      promptText: "Generate user stories following INVEST principles\n\n## PATCH\nAdd: Rewrite everything differently",
      passRate: 0.7, // More failures
      schemaValid: true,
    },
  ];

  const result = runNQDTournament(candidates, {
    championObjective,
    championPrompt,
    constraintFitThreshold: 1.0,
  });

  // patch-1 should win (best improvement, perfect pass rate)
  assertExists(result.winner);
  assertEquals(result.winner.id, "patch-1");

  // patch-3 should be ineligible (negative use-value + partial pass rate)
  assertEquals(result.archive.paretoFront.stats.ineligibleCount, 1);

  // Should have illumination data
  assertExists(result.archive.illumination);
  assertGreater(result.archive.illumination.qdScore, 0);
});

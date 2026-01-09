/**
 * Tests for Optimization Progress Types
 *
 * Verifies the streaming progress types and helpers work correctly.
 */

import { assertEquals } from "https://deno.land/std@0.218.0/assert/mod.ts";
import {
  createOptimizationTask,
  updateTaskStep,
  updateTaskEvalProgress,
  updateTaskTournamentProgress,
  completeTaskIteration,
  toIterationSummary,
  STEP_LABELS,
  type OptimizationTask,
  type IterationSummary,
} from "./optimization-progress.ts";
import type { IterationResult } from "./types.ts";

Deno.test("OptimizationProgress: createOptimizationTask initializes correctly", () => {
  const task = createOptimizationTask("test-123", {
    maxIterations: 5,
    replicates: 3,
    patchCandidates: 3,
    metaEvolutionEnabled: false,
  });

  assertEquals(task.id, "test-123");
  assertEquals(task.status, "pending");
  assertEquals(task.progress.iteration, 0);
  assertEquals(task.progress.maxIterations, 5);
  assertEquals(task.progress.step, "initializing");
  assertEquals(task.progress.stepLabel, "Initializing");
  assertEquals(task.progress.championObjective, 0);
  assertEquals(task.progress.history.length, 0);
  assertEquals(task.config.maxIterations, 5);
  assertEquals(task.config.metaEvolutionEnabled, false);
});

Deno.test("OptimizationProgress: updateTaskStep changes step correctly", () => {
  const task = createOptimizationTask("test-456", {
    maxIterations: 3,
    replicates: 2,
    patchCandidates: 2,
    metaEvolutionEnabled: true,
  });

  updateTaskStep(task, "evaluating_champion");

  assertEquals(task.progress.step, "evaluating_champion");
  assertEquals(task.progress.stepLabel, "Evaluating Champion");

  updateTaskStep(task, "mining_pairs", { pairsFound: 5 });

  assertEquals(task.progress.step, "mining_pairs");
  assertEquals(task.progress.pairsFound, 5);
});

Deno.test("OptimizationProgress: updateTaskEvalProgress updates eval progress", () => {
  const task = createOptimizationTask("test-789", {
    maxIterations: 3,
    replicates: 3,
    patchCandidates: 3,
    metaEvolutionEnabled: false,
  });

  updateTaskEvalProgress(task, { completed: 5, total: 15 });

  assertEquals(task.progress.evalProgress?.completed, 5);
  assertEquals(task.progress.evalProgress?.total, 15);
});

Deno.test("OptimizationProgress: updateTaskTournamentProgress updates tournament progress", () => {
  const task = createOptimizationTask("test-abc", {
    maxIterations: 3,
    replicates: 3,
    patchCandidates: 3,
    metaEvolutionEnabled: false,
  });

  updateTaskTournamentProgress(task, {
    candidateIdx: 1,
    totalCandidates: 4,
    runsCompleted: 10,
    totalRuns: 60,
  });

  assertEquals(task.progress.tournamentProgress?.candidateIdx, 1);
  assertEquals(task.progress.tournamentProgress?.totalCandidates, 4);
  assertEquals(task.progress.tournamentProgress?.runsCompleted, 10);
  assertEquals(task.progress.tournamentProgress?.totalRuns, 60);
});

Deno.test("OptimizationProgress: toIterationSummary extracts correct fields", () => {
  const result: IterationResult = {
    iteration: 2,
    pairsFound: 5,
    candidatesGenerated: 3,
    bestCandidateObjective: 0.75,
    championObjective: 0.70,
    promoted: true,
    duration: 15000,
  };

  const summary = toIterationSummary(result);

  assertEquals(summary.iteration, 2);
  assertEquals(summary.pairsFound, 5);
  assertEquals(summary.candidatesGenerated, 3);
  assertEquals(summary.bestCandidateObjective, 0.75);
  assertEquals(summary.championObjective, 0.70);
  assertEquals(summary.promoted, true);
  assertEquals(summary.duration, 15000);
  assertEquals(summary.error, undefined);
});

Deno.test("OptimizationProgress: completeTaskIteration adds to history and updates state", () => {
  const task = createOptimizationTask("test-def", {
    maxIterations: 3,
    replicates: 3,
    patchCandidates: 3,
    metaEvolutionEnabled: false,
  });

  const result: IterationResult = {
    iteration: 1,
    pairsFound: 4,
    candidatesGenerated: 3,
    bestCandidateObjective: 0.72,
    championObjective: 0.68,
    promoted: true,
    duration: 12000,
  };

  completeTaskIteration(task, result);

  assertEquals(task.progress.history.length, 1);
  assertEquals(task.progress.history[0]!.iteration, 1);
  assertEquals(task.progress.championObjective, 0.72); // Updated because promoted
  assertEquals(task.progress.promoted, true);
  assertEquals(task.progress.pairsFound, 4);
  assertEquals(task.progress.candidatesGenerated, 3);
});

Deno.test("OptimizationProgress: completeTaskIteration keeps champion on no promotion", () => {
  const task = createOptimizationTask("test-ghi", {
    maxIterations: 3,
    replicates: 3,
    patchCandidates: 3,
    metaEvolutionEnabled: false,
  });

  // Set initial champion
  task.progress.championObjective = 0.70;

  const result: IterationResult = {
    iteration: 1,
    pairsFound: 3,
    candidatesGenerated: 3,
    bestCandidateObjective: 0.69,
    championObjective: 0.70,
    promoted: false,
    duration: 10000,
  };

  completeTaskIteration(task, result);

  assertEquals(task.progress.championObjective, 0.70); // Unchanged
  assertEquals(task.progress.promoted, false);
});

Deno.test("OptimizationProgress: STEP_LABELS has all expected steps", () => {
  const expectedSteps = [
    "initializing",
    "evaluating_champion",
    "mining_pairs",
    "generating_patches",
    "tournament",
    "promotion",
    "meta_evolution",
    "checkpointing",
    "completed",
    "failed",
  ];

  for (const step of expectedSteps) {
    assertEquals(typeof STEP_LABELS[step as keyof typeof STEP_LABELS], "string");
  }
});

Deno.test("OptimizationProgress: Multiple iterations build history correctly", () => {
  const task = createOptimizationTask("test-multi", {
    maxIterations: 3,
    replicates: 3,
    patchCandidates: 3,
    metaEvolutionEnabled: false,
  });

  // Iteration 1
  completeTaskIteration(task, {
    iteration: 1,
    pairsFound: 5,
    candidatesGenerated: 3,
    bestCandidateObjective: 0.72,
    championObjective: 0.65,
    promoted: true,
    duration: 10000,
  });

  // Iteration 2
  completeTaskIteration(task, {
    iteration: 2,
    pairsFound: 3,
    candidatesGenerated: 3,
    bestCandidateObjective: 0.74,
    championObjective: 0.72,
    promoted: true,
    duration: 11000,
  });

  // Iteration 3
  completeTaskIteration(task, {
    iteration: 3,
    pairsFound: 1,
    candidatesGenerated: 3,
    bestCandidateObjective: 0.73,
    championObjective: 0.74,
    promoted: false,
    duration: 9000,
  });

  assertEquals(task.progress.history.length, 3);
  assertEquals(task.progress.championObjective, 0.74); // From iteration 2
  assertEquals(task.progress.history[0]!.championObjective, 0.65);
  assertEquals(task.progress.history[1]!.championObjective, 0.72);
  assertEquals(task.progress.history[2]!.championObjective, 0.74);
});

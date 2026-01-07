/**
 * Prompt Optimization Loop with Distributional Evaluation
 *
 * This optimizer implements the methodology from paper 2507.22133:
 * 1. Evaluate prompts as DISTRIBUTIONS over repeated stochastic runs
 * 2. Mine CONTRASTIVE PAIRS with high similarity but big quality delta
 * 3. Optimize via PROMPT ADDITIONS (patches), not full rewrites
 *
 * Refactored to use the Orchestrator pattern (Google's 4-step framework).
 */

import { join, dirname } from "jsr:@std/path";
import { epicSchema, type Epic } from "../schema.ts";
import { env } from "../config.ts";
import {
  Orchestrator,
  type OptimizationState,
  type IterationResult,
  composePrompt,
} from "../orchestrator/index.ts";

// ─────────────────────────────────────────────────
// File I/O
// ─────────────────────────────────────────────────

async function readFile(relativePath: string): Promise<string> {
  const fullPath = join(Deno.cwd(), relativePath);
  try {
    return await Deno.readTextFile(fullPath);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return "";
    throw err;
  }
}

async function writeFile(relativePath: string, content: string): Promise<void> {
  const fullPath = join(Deno.cwd(), relativePath);
  await Deno.mkdir(dirname(fullPath), { recursive: true });
  await Deno.writeTextFile(fullPath, content);
}

async function loadEpics(): Promise<Epic[]> {
  const parsed = JSON.parse(
    await Deno.readTextFile(join(Deno.cwd(), "data", "epics.eval.json"))
  ) as unknown[];
  return parsed.map((e) => epicSchema.parse(e));
}

async function loadChampion(): Promise<{ base: string; patch: string }> {
  let base = await readFile("prompts/champion.base.md");
  const patch = await readFile("prompts/champion.patch.md");

  if (!base) {
    // Fall back to champion.md if base doesn't exist
    base = await readFile("prompts/champion.md");
    if (!base) {
      throw new Error("No base prompt found in prompts/champion.base.md or prompts/champion.md");
    }
    console.log("Using prompts/champion.md as base (no champion.base.md found)\n");
  }

  return { base, patch };
}

async function saveChampion(champion: { base: string; patch: string }): Promise<void> {
  await writeFile("prompts/champion.patch.md", champion.patch);
  await writeFile("prompts/champion.md", composePrompt(champion.base, champion.patch));

  // Create timestamped backup
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await writeFile(
    `prompts/versions/champion.${timestamp}.md`,
    composePrompt(champion.base, champion.patch)
  );
}

// ─────────────────────────────────────────────────
// Logging Helpers
// ─────────────────────────────────────────────────

function logHeader(title: string): void {
  console.log(`\n${"═".repeat(50)}`);
  console.log(title);
  console.log(`${"═".repeat(50)}\n`);
}

function logIterationResult(result: IterationResult): void {
  console.log(`  Pairs found: ${result.pairsFound}`);
  console.log(`  Candidates generated: ${result.candidatesGenerated}`);
  console.log(`  Best objective: ${result.bestCandidateObjective.toFixed(4)}`);
  console.log(`  Champion objective: ${result.championObjective.toFixed(4)}`);
  console.log(`  Delta: ${(result.bestCandidateObjective - result.championObjective).toFixed(4)}`);
  console.log(`  Promoted: ${result.promoted ? "✅ Yes" : "❌ No"}`);
  console.log(`  Duration: ${(result.duration / 1000).toFixed(1)}s`);
  if (result.error) {
    console.log(`  Error: ${result.error}`);
  }
}

function logFinalState(state: OptimizationState): void {
  logHeader("Optimization Complete!");
  console.log(`Total iterations: ${state.iteration}`);
  console.log(`Final objective: ${state.championObjective.toFixed(4)}`);
  console.log(`Session ID: ${state.sessionId}`);
  console.log();

  const promotions = state.history.filter((h) => h.promoted).length;
  console.log(`Promotions: ${promotions}/${state.iteration}`);

  if (state.history.length > 0) {
    console.log("\nIteration summary:");
    for (const h of state.history) {
      const status = h.promoted ? "✅" : h.pairsFound === 0 ? "◯" : "─";
      console.log(
        `  ${status} Iter ${h.iteration}: obj=${h.championObjective.toFixed(4)} ` +
        `pairs=${h.pairsFound} candidates=${h.candidatesGenerated}`
      );
    }
  }

  console.log();
  console.log("Files updated:");
  console.log("  - prompts/champion.md (composed prompt)");
  console.log("  - prompts/champion.patch.md (optimized patch)");
  console.log("  - prompts/versions/ (timestamped backups)");
}

// ─────────────────────────────────────────────────
// Main Optimization Loop
// ─────────────────────────────────────────────────

export async function main(): Promise<void> {
  logHeader("Prompt Optimization with Distributional Evaluation");
  console.log("Using Orchestrator pattern (Google's 4-step framework)");

  // Load data
  const epics = await loadEpics();
  const champion = await loadChampion();

  console.log(`\nLoaded ${epics.length} epics for evaluation`);
  console.log(`Replicates per epic: ${env.EVAL_REPLICATES}`);
  console.log(`Total runs per prompt: ${epics.length * env.EVAL_REPLICATES}`);
  console.log(`Max iterations: ${env.OPT_ITERATIONS}`);
  console.log(`Patch candidates per iteration: ${env.OPT_PATCH_CANDIDATES}`);
  console.log(`Promotion threshold: ${env.OPT_PROMOTION_THRESHOLD}`);

  // Create orchestrator
  const orchestrator = new Orchestrator({ epics, champion });

  // Track progress for logging
  let currentIteration = 0;
  let lastProgressLog = 0;

  // Run optimization with callbacks
  logHeader("Starting Optimization Loop");

  const finalState = await orchestrator.runOptimization(
    {
      maxIterations: env.OPT_ITERATIONS,
      replicates: env.EVAL_REPLICATES,
      patchCandidates: env.OPT_PATCH_CANDIDATES,
      promotionThreshold: env.OPT_PROMOTION_THRESHOLD,
      concurrency: env.OPT_CONCURRENCY,
    },
    {
      onIterationStart: (iteration) => {
        currentIteration = iteration;
        logHeader(`Iteration ${iteration}/${env.OPT_ITERATIONS}`);
      },
      onIterationEnd: (result) => {
        console.log();
        logIterationResult(result);

        // Save promoted champion immediately
        if (result.promoted) {
          const updatedChampion = orchestrator.getChampion();
          saveChampion(updatedChampion).catch((err) => {
            console.error("Failed to save champion:", err);
          });
        }

        // Log iteration result to file
        writeFile(
          `runs/iter-${result.iteration}.json`,
          JSON.stringify(result, null, 2)
        ).catch((err) => {
          console.error("Failed to save iteration log:", err);
        });
      },
      onProgress: (completed, total) => {
        // Throttle progress updates to avoid flooding console
        const now = Date.now();
        if (now - lastProgressLog > 500) {
          Deno.stdout.writeSync(
            new TextEncoder().encode(`\r  Progress: ${completed}/${total} runs`)
          );
          lastProgressLog = now;
        }
      },
    }
  );

  // Save final champion if any promotions happened
  if (finalState.history.some((h) => h.promoted)) {
    await saveChampion(finalState.championPrompt);
  }

  // Save final state
  await writeFile(
    `runs/final-state.json`,
    JSON.stringify(finalState, null, 2)
  );

  // Log final summary
  logFinalState(finalState);
}

main().catch((e) => {
  console.error("Error:", e);
  Deno.exit(1);
});

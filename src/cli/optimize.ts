/**
 * Prompt Optimization Loop with Distributional Evaluation
 *
 * This optimizer implements the methodology from paper 2507.22133:
 * 1. Evaluate prompts as DISTRIBUTIONS over repeated stochastic runs
 * 2. Mine CONTRASTIVE PAIRS with high similarity but big quality delta
 * 3. Optimize via PROMPT ADDITIONS (patches), not full rewrites
 *
 * Flow per iteration:
 * 1. Evaluate champion prompt distribution (R replicates × E epics)
 * 2. Mine contrastive pairs from the distribution
 * 3. Generate N patch candidates using the patch engineer agent
 * 4. Tournament select: evaluate each candidate, keep best
 * 5. Promote if objective improves beyond threshold
 */

import { join, dirname } from "jsr:@std/path";
import { epicSchema, type Epic } from "../schema.ts";
import { env } from "../config.ts";
import {
  evalPromptDistribution,
  flattenDistReport,
  type PromptDistReport,
} from "../eval.ts";
import { mineContrastivePairs, formatPairsForPrompt } from "../pairMining.ts";
import {
  generatePatchCandidates,
  composePrompt,
} from "../patchEngineer.ts";

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

// ─────────────────────────────────────────────────
// Logging Helpers
// ─────────────────────────────────────────────────

function logHeader(title: string): void {
  console.log(`\n${"═".repeat(50)}`);
  console.log(title);
  console.log(`${"═".repeat(50)}\n`);
}

function logDistReport(report: PromptDistReport): void {
  console.log(`  Aggregate metrics:`);
  console.log(`    passRate:   ${(report.agg.meanPassRate * 100).toFixed(1)}%`);
  console.log(`    meanScore:  ${report.agg.meanOfMeans.toFixed(3)}`);
  console.log(`    p10Score:   ${report.agg.meanP10.toFixed(3)}`);
  console.log(`    stdScore:   ${report.agg.meanStd.toFixed(3)}`);
  console.log(`    OBJECTIVE:  ${report.agg.objective.toFixed(4)}`);
  console.log();
  console.log(`  Per-epic breakdown:`);
  for (const e of report.perEpic) {
    console.log(
      `    ${e.epicId}: pass=${(e.passRate * 100).toFixed(0)}% mean=${e.meanScore.toFixed(3)} p10=${e.p10Score.toFixed(3)} std=${e.stdScore.toFixed(3)}`
    );
  }
}

// ─────────────────────────────────────────────────
// Run Log Types
// ─────────────────────────────────────────────────

type IterationLog = {
  iter: number;
  championObjective: number;
  championReport: {
    agg: PromptDistReport["agg"];
    perEpic: Array<{
      epicId: string;
      passRate: number;
      meanScore: number;
      p10Score: number;
      stdScore: number;
    }>;
  };
  pairsFound: number;
  candidatesGenerated: number;
  candidateResults: Array<{
    idx: number;
    objective: number;
    patchPreview: string;
  }>;
  promoted: boolean;
  newObjective?: number;
  newPatch?: string;
};

// ─────────────────────────────────────────────────
// Main Optimization Loop
// ─────────────────────────────────────────────────

export async function main(): Promise<void> {
  logHeader("Prompt Optimization with Distributional Evaluation");

  // Load data
  const epics = await loadEpics();
  console.log(`Loaded ${epics.length} epics for evaluation`);
  console.log(`Replicates per epic: ${env.EVAL_REPLICATES}`);
  console.log(`Total runs per prompt: ${epics.length * env.EVAL_REPLICATES}\n`);

  // Load base prompt and current patch
  let base = await readFile("prompts/champion.base.md");
  let patch = await readFile("prompts/champion.patch.md");

  if (!base) {
    // Fall back to champion.md if base doesn't exist
    base = await readFile("prompts/champion.md");
    if (!base) {
      throw new Error("No base prompt found in prompts/champion.base.md or prompts/champion.md");
    }
    console.log("Using prompts/champion.md as base (no champion.base.md found)\n");
  }

  // Evaluate initial champion
  logHeader("Evaluating Initial Champion");

  let championReport = await evalPromptDistribution({
    promptId: "champion",
    promptText: composePrompt(base, patch),
    epics,
    onProgress: (done, total) => {
      Deno.stdout.writeSync(
        new TextEncoder().encode(`\r  Progress: ${done}/${total} runs completed`)
      );
    },
  });
  console.log("\n");
  logDistReport(championReport);

  let championObjective = championReport.agg.objective;

  // Optimization loop
  for (let iter = 1; iter <= env.OPT_ITERATIONS; iter++) {
    logHeader(`Iteration ${iter}/${env.OPT_ITERATIONS}`);

    const iterLog: IterationLog = {
      iter,
      championObjective,
      championReport: {
        agg: championReport.agg,
        perEpic: championReport.perEpic.map((e) => ({
          epicId: e.epicId,
          passRate: e.passRate,
          meanScore: e.meanScore,
          p10Score: e.p10Score,
          stdScore: e.stdScore,
        })),
      },
      pairsFound: 0,
      candidatesGenerated: 0,
      candidateResults: [],
      promoted: false,
    };

    // Step 1: Mine contrastive pairs from champion distribution
    console.log("Mining contrastive pairs...");
    const flatRuns = flattenDistReport(championReport);
    const pairs = mineContrastivePairs({ runs: flatRuns });
    iterLog.pairsFound = pairs.length;
    console.log(`  Found ${pairs.length} contrastive pairs\n`);

    if (pairs.length === 0) {
      console.log("  No contrastive pairs found—outputs too similar or scores too close.");
      console.log("  Skipping patch generation for this iteration.\n");

      // Save iteration log
      await writeFile(`runs/iter-${iter}.json`, JSON.stringify(iterLog, null, 2));
      continue;
    }

    // Step 2: Generate patch candidates
    console.log(`Generating ${env.OPT_PATCH_CANDIDATES} patch candidates...`);
    const pairsContext = formatPairsForPrompt(pairs);
    const candidates = await generatePatchCandidates(
      { basePrompt: base, currentPatch: patch, pairsContext },
      env.OPT_PATCH_CANDIDATES
    );
    iterLog.candidatesGenerated = candidates.length;
    console.log(`  Generated ${candidates.length} valid candidates\n`);

    // Step 3: Tournament selection—evaluate each candidate
    console.log("Evaluating candidates (tournament selection)...\n");

    let bestCandidate = { patch, objective: championObjective };

    for (let i = 0; i < candidates.length; i++) {
      const candidatePatch = candidates[i]!;
      const candidatePrompt = composePrompt(base, candidatePatch);

      console.log(`  Candidate ${i + 1}/${candidates.length}:`);
      console.log(`    Patch preview: ${candidatePatch.slice(0, 80).replace(/\n/g, " ")}...`);

      const report = await evalPromptDistribution({
        promptId: `candidate-${i}`,
        promptText: candidatePrompt,
        epics,
        onProgress: (done, total) => {
          Deno.stdout.writeSync(
            new TextEncoder().encode(`\r    Evaluating: ${done}/${total} runs`)
          );
        },
      });
      console.log();

      iterLog.candidateResults.push({
        idx: i,
        objective: report.agg.objective,
        patchPreview: candidatePatch.slice(0, 100),
      });

      console.log(`    Objective: ${report.agg.objective.toFixed(4)} (champion: ${championObjective.toFixed(4)})`);

      if (report.agg.objective > bestCandidate.objective) {
        bestCandidate = { patch: candidatePatch, objective: report.agg.objective };
        console.log(`    ✓ New best candidate!`);
      }
      console.log();
    }

    // Step 4: Promote if improvement exceeds threshold
    const improvement = bestCandidate.objective - championObjective;

    if (improvement > env.OPT_PROMOTION_THRESHOLD) {
      patch = bestCandidate.patch;
      championObjective = bestCandidate.objective;

      // Save updated files
      await writeFile("prompts/champion.patch.md", patch);
      await writeFile("prompts/champion.md", composePrompt(base, patch));

      // Re-evaluate for accurate champion report
      championReport = await evalPromptDistribution({
        promptId: "champion",
        promptText: composePrompt(base, patch),
        epics,
      });

      iterLog.promoted = true;
      iterLog.newObjective = championObjective;
      iterLog.newPatch = patch;

      console.log(`\n✅ Promoted new champion!`);
      console.log(`   Improvement: +${(improvement * 100).toFixed(2)}%`);
      console.log(`   New objective: ${championObjective.toFixed(4)}`);
    } else {
      console.log(`\n⏸️  No significant improvement`);
      console.log(`   Best candidate: ${bestCandidate.objective.toFixed(4)}`);
      console.log(`   Champion: ${championObjective.toFixed(4)}`);
      console.log(`   Threshold: ${env.OPT_PROMOTION_THRESHOLD}`);
    }

    // Save iteration log
    await writeFile(`runs/iter-${iter}.json`, JSON.stringify(iterLog, null, 2));
  }

  // Final summary
  logHeader("Optimization Complete!");
  console.log(`Final champion objective: ${championObjective.toFixed(4)}`);
  console.log();
  console.log("Final metrics:");
  logDistReport(championReport);
  console.log();
  console.log("Files updated:");
  console.log("  - prompts/champion.md (composed prompt)");
  console.log("  - prompts/champion.patch.md (optimized patch)");
  console.log("  - runs/iter-*.json (iteration logs)");
}

main().catch((e) => {
  console.error("Error:", e);
  Deno.exit(1);
});

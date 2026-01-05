/**
 * Distributional Evaluation CLI
 *
 * Evaluates the champion prompt across multiple replicates per epic
 * and outputs detailed distribution statistics.
 *
 * Usage: bun run src/cli/eval-dist.ts [--replicates <N>] [--output <path>]
 */

import fs from "node:fs/promises";
import path from "node:path";
import { epicSchema } from "../mastra/schema.ts";
import { env } from "../config.ts";
import { evalPromptDistribution, type PromptDistReport } from "../eval/evalPromptDistribution.ts";
import { composePrompt } from "../optimizer/promptPatchEngineerAgent.ts";

function parseArgs(args: string[]): { replicates?: number; output?: string } {
  let replicates: number | undefined;
  let output: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--replicates" && args[i + 1]) {
      replicates = parseInt(args[i + 1]!, 10);
      i++;
    } else if (arg === "--output" && args[i + 1]) {
      output = args[i + 1]!;
      i++;
    }
  }

  return { replicates, output };
}

async function readFile(relativePath: string): Promise<string> {
  try {
    return await fs.readFile(path.join(process.cwd(), relativePath), "utf8");
  } catch {
    return "";
  }
}

async function main() {
  const { replicates, output } = parseArgs(process.argv.slice(2));
  const numReplicates = replicates ?? env.EVAL_REPLICATES;
  const outputPath = output ?? "out/eval.dist.json";

  console.log("═".repeat(50));
  console.log("Distributional Evaluation");
  console.log("═".repeat(50));
  console.log();

  // Load epics
  const dataPath = path.join(process.cwd(), "data", "epics.eval.json");
  console.log(`Loading epics from ${dataPath}...`);
  const raw = await fs.readFile(dataPath, "utf8");
  const epics = (JSON.parse(raw) as unknown[]).map((e) => epicSchema.parse(e));
  console.log(`Loaded ${epics.length} epics\n`);

  // Load prompt
  let base = await readFile("prompts/champion.base.md");
  const patch = await readFile("prompts/champion.patch.md");

  if (!base) {
    base = await readFile("prompts/champion.md");
    if (!base) {
      console.error("No prompt found in prompts/champion.base.md or prompts/champion.md");
      process.exit(1);
    }
  }

  const promptText = composePrompt(base, patch);

  console.log(`Replicates per epic: ${numReplicates}`);
  console.log(`Total runs: ${epics.length * numReplicates}`);
  console.log(`Seed base: ${env.EVAL_SEED_BASE}`);
  console.log();

  // Run evaluation
  console.log("Running distributional evaluation...\n");

  const report = await evalPromptDistribution({
    promptId: "champion",
    promptText,
    epics,
    replicates: numReplicates,
    onProgress: (done, total) => {
      process.stdout.write(`\rProgress: ${done}/${total} runs completed`);
    },
  });

  console.log("\n");

  // Display results
  console.log("═".repeat(50));
  console.log("Results");
  console.log("═".repeat(50));
  console.log();

  console.log("Aggregate Metrics:");
  console.log(`  Pass Rate:   ${(report.agg.meanPassRate * 100).toFixed(1)}%`);
  console.log(`  Mean Score:  ${report.agg.meanOfMeans.toFixed(3)}`);
  console.log(`  P10 Score:   ${report.agg.meanP10.toFixed(3)} (worst-case)`);
  console.log(`  Std Score:   ${report.agg.meanStd.toFixed(3)} (consistency)`);
  console.log(`  OBJECTIVE:   ${report.agg.objective.toFixed(4)}`);
  console.log();

  console.log("Per-Epic Breakdown:");
  console.log("─".repeat(80));
  console.log(
    "Epic".padEnd(12) +
      "PassRate".padStart(10) +
      "Mean".padStart(10) +
      "P10".padStart(10) +
      "Std".padStart(10) +
      "Discover".padStart(12)
  );
  console.log("─".repeat(80));

  for (const e of report.perEpic) {
    console.log(
      e.epicId.padEnd(12) +
        `${(e.passRate * 100).toFixed(0)}%`.padStart(10) +
        e.meanScore.toFixed(3).padStart(10) +
        e.p10Score.toFixed(3).padStart(10) +
        e.stdScore.toFixed(3).padStart(10) +
        `${(e.discoverabilityK * 100).toFixed(0)}%`.padStart(12)
    );
  }
  console.log("─".repeat(80));
  console.log();

  // Save output
  const fullOutputPath = path.join(process.cwd(), outputPath);
  await fs.mkdir(path.dirname(fullOutputPath), { recursive: true });
  await fs.writeFile(fullOutputPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Results saved to: ${outputPath}`);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});

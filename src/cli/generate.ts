/**
 * Single-shot Story Generation CLI
 *
 * Usage: bun run src/cli/generate.ts <EPIC_ID> [--seed <N>]
 */

import fs from "node:fs/promises";
import path from "node:path";
import { epicSchema } from "../mastra/schema.ts";
import { generateStoryPack } from "../mastra/agents/storyGenerator.ts";

function parseArgs(args: string[]): { epicId?: string; seed?: number } {
  let epicId: string | undefined;
  let seed: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--seed" && args[i + 1]) {
      seed = parseInt(args[i + 1]!, 10);
      i++; // skip next arg
    } else if (!arg.startsWith("--")) {
      epicId = arg;
    }
  }

  return { epicId, seed };
}

async function main() {
  const { epicId, seed } = parseArgs(process.argv.slice(2));

  if (!epicId) {
    console.error("Usage: bun run src/cli/generate.ts <EPIC_ID> [--seed <N>]");
    console.error("Example: bun run src/cli/generate.ts E-101");
    console.error("Example: bun run src/cli/generate.ts E-101 --seed 42");
    process.exit(1);
  }

  const dataPath = path.join(process.cwd(), "data", "epics.eval.json");
  const promptPath = path.join(process.cwd(), "prompts", "champion.md");

  console.log(`Loading epics from ${dataPath}...`);
  const raw = await fs.readFile(dataPath, "utf8");
  const epics = (JSON.parse(raw) as unknown[]).map((e) => epicSchema.parse(e));

  const epic = epics.find((e) => e.id === epicId);
  if (!epic) {
    console.error(`Epic not found: ${epicId}`);
    console.error(`Available epics: ${epics.map((e) => e.id).join(", ")}`);
    process.exit(1);
  }

  console.log(`Loading champion prompt from ${promptPath}...`);
  const prompt = await fs.readFile(promptPath, "utf8");

  console.log(`\nGenerating stories for epic: ${epic.title}...`);
  if (seed !== undefined) {
    console.log(`Using seed: ${seed}`);
  }
  console.log();

  const result = await generateStoryPack(epic, prompt, { seed });

  if (result.error) {
    console.error("Generation failed:", result.error);
    process.exit(1);
  }

  console.log("Generated Story Pack:");
  console.log(JSON.stringify(result.storyPack, null, 2));

  if (seed !== undefined) {
    console.log(`\nSeed used: ${result.seed}`);
  }
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});

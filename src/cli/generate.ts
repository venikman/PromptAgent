/**
 * Single-shot Story Generation CLI
 *
 * Usage: deno task generate -- <EPIC_ID> [--seed <N>]
 */

import { join } from "@std/path";
import { epicSchema } from "../schema.ts";
import { generateStoryPack } from "../generator.ts";

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
  const { epicId, seed } = parseArgs(Deno.args);

  if (!epicId) {
    console.error("Usage: deno task generate -- <EPIC_ID> [--seed <N>]");
    console.error("Example: deno task generate -- E-101");
    console.error("Example: deno task generate -- E-101 --seed 42");
    Deno.exit(1);
  }

  const dataPath = join(Deno.cwd(), "data", "epics.eval.json");
  const promptPath = join(Deno.cwd(), "prompts", "champion.md");

  console.log(`Loading epics from ${dataPath}...`);
  const raw = JSON.parse(await Deno.readTextFile(dataPath)) as unknown[];
  const epics = raw.map((e) => epicSchema.parse(e));

  const epic = epics.find((e) => e.id === epicId);
  if (!epic) {
    console.error(`Epic not found: ${epicId}`);
    console.error(`Available epics: ${epics.map((e) => e.id).join(", ")}`);
    Deno.exit(1);
  }

  console.log(`Loading champion prompt from ${promptPath}...`);
  const prompt = await Deno.readTextFile(promptPath);

  console.log(`\nGenerating stories for epic: ${epic.title}...`);
  if (seed !== undefined) {
    console.log(`Using seed: ${seed}`);
  }
  console.log();

  const result = await generateStoryPack(epic, prompt, { seed });

  if (result.error) {
    console.error("Generation failed:", result.error);
    Deno.exit(1);
  }

  console.log("Generated Story Pack:");
  console.log(JSON.stringify(result.storyPack, null, 2));

  if (seed !== undefined) {
    console.log(`\nSeed used: ${result.seed}`);
  }
}

main().catch((e) => {
  console.error("Error:", e);
  Deno.exit(1);
});

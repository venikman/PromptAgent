#!/usr/bin/env -S deno run -A
/**
 * Development server script - starts backend + Fresh UI.
 * Usage: deno task dev
 */

const cwd = new URL("..", import.meta.url).pathname;
const watchTargets = ["deploy", "src", "src/ui"].join(",");

console.log("Starting PromptAgent dev server...");

const process = new Deno.Command("deno", {
  args: ["run", "-A", `--watch=${watchTargets}`, "deploy/main.ts"],
  cwd,
  env: {
    ...Deno.env.toObject(),
  },
  stdout: "inherit",
  stderr: "inherit",
}).spawn();

const status = await process.status;
Deno.exit(status.code);

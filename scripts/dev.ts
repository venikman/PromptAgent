#!/usr/bin/env -S deno run -A
/**
 * Development server script - starts backend + Vite UI.
 * Usage: deno task dev
 */

import { fromFileUrl } from "@std/path";

const rootDir = fromFileUrl(new URL("..", import.meta.url));
const uiDir = fromFileUrl(new URL("../src/ui", import.meta.url));
const apiWatchTargets = [
  "src/server",
  "src/orchestrator",
  "src/judge",
  "src/meta-evolution",
  "src/fpf",
  "src/cli",
  "src/config.ts",
  "src/eval.ts",
  "src/generator.ts",
  "src/models.ts",
  "src/pairMining.ts",
  "src/patchEngineer.ts",
  "src/schema.ts",
  "src/scorer.ts",
  "src/similarity.ts",
  "src/telemetry.ts",
].join(",");

console.log("Starting PromptAgent dev servers...");

const apiProcess = new Deno.Command("deno", {
  args: [
    "run",
    "-A",
    "--unstable-kv",
    `--watch=${apiWatchTargets}`,
    "src/server/main.ts",
  ],
  cwd: rootDir,
  env: {
    ...Deno.env.toObject(),
  },
  stdout: "inherit",
  stderr: "inherit",
}).spawn();

const uiProcess = new Deno.Command("npm", {
  args: ["run", "dev"],
  cwd: uiDir,
  env: {
    ...Deno.env.toObject(),
  },
  stdout: "inherit",
  stderr: "inherit",
}).spawn();

const shutdown = () => {
  apiProcess.kill("SIGTERM");
  uiProcess.kill("SIGTERM");
};

Deno.addSignalListener("SIGINT", shutdown);
Deno.addSignalListener("SIGTERM", shutdown);

const status = await Promise.race([apiProcess.status, uiProcess.status]);
shutdown();
Deno.exit(status.code);

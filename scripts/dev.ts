#!/usr/bin/env -S deno run -A
/**
 * Development server script - starts both backend and UI dev server
 * Usage: deno task dev
 */

const cwd = new URL("..", import.meta.url).pathname;

console.log("🚀 Starting PromptAgent development servers...\n");

// Start backend server
const backend = new Deno.Command("deno", {
  args: ["run", "-A", "deploy/main.ts"],
  cwd,
  stdout: "inherit",
  stderr: "inherit",
}).spawn();

// Wait for backend to be healthy
console.log("⏳ Waiting for backend to be ready...");
const maxAttempts = 30;
for (let i = 0; i < maxAttempts; i++) {
  try {
    const res = await fetch("http://localhost:8000/health");
    if (res.ok) {
      console.log("✅ Backend is ready!\n");
      break;
    }
  } catch {
    // Not ready yet
  }
  if (i === maxAttempts - 1) {
    console.error("❌ Backend failed to start after 30 seconds");
    backend.kill("SIGTERM");
    Deno.exit(1);
  }
  await new Promise((r) => setTimeout(r, 1000));
}

// Start UI dev server
const ui = new Deno.Command("deno", {
  args: ["run", "-A", "--node-modules-dir", "npm:vite"],
  cwd: `${cwd}/ui`,
  stdout: "inherit",
  stderr: "inherit",
}).spawn();

console.log("\n✅ Servers starting:");
console.log("   Backend: http://localhost:8000");
console.log("   UI:      http://localhost:5173\n");

// Handle shutdown
const shutdown = () => {
  console.log("\n🛑 Shutting down...");
  try {
    backend.kill("SIGTERM");
  } catch { /* already dead */ }
  try {
    ui.kill("SIGTERM");
  } catch { /* already dead */ }
  Deno.exit(0);
};

Deno.addSignalListener("SIGINT", shutdown);
Deno.addSignalListener("SIGTERM", shutdown);

// Wait for either to exit
await Promise.race([backend.status, ui.status]);
shutdown();

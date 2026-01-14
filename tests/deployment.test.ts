/**
 * Deployment Configuration Validation Tests
 *
 * Ensures configuration consistency between local (LM Studio) and
 * deployment environments. Catches common issues before deployment.
 *
 * @module deployment.test
 */

import { assert, assertExists } from "@std/assert";
import { join } from "@std/path";

const ROOT_DIR = join(import.meta.dirname ?? ".", "..");

// Helper to check if file exists
async function fileExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

// Helper to read file if exists
async function readFileIfExists(path: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(path);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────
// Environment Files Tests
// ─────────────────────────────────────────────────

Deno.test("Environment - should have .env.example file", async () => {
  const envExamplePath = join(ROOT_DIR, ".env.example");
  assert(await fileExists(envExamplePath), ".env.example should exist");
});

Deno.test(
  "Environment - should have .env file for local development",
  async () => {
    const envPath = join(ROOT_DIR, ".env");
    assert(
      await fileExists(envPath),
      ".env should exist for local development",
    );
  },
);

Deno.test(
  "Environment - .env should not contain production secrets",
  async () => {
    const envPath = join(ROOT_DIR, ".env");
    const content = await readFileIfExists(envPath);
    if (!content) return;

    // Should not contain real API keys (common patterns)
    assert(
      !content.match(/sk-[a-zA-Z0-9]{32,}/),
      ".env should not contain OpenAI API keys",
    );
    assert(
      !content.match(/sk-ant-[a-zA-Z0-9-]{32,}/),
      ".env should not contain Anthropic API keys",
    );
    assert(
      !content.match(/AIza[a-zA-Z0-9_-]{35}/),
      ".env should not contain Google API keys",
    );

    // Should use local LM Studio placeholder
    assert(
      content.match(/lm-studio|localhost|127\.0\.0\.1/),
      ".env should reference local LM Studio",
    );
  },
);

Deno.test(
  "Environment - .env.example should document required variables",
  async () => {
    const envExamplePath = join(ROOT_DIR, ".env.example");
    const content = await readFileIfExists(envExamplePath);
    if (!content) return;

    // Critical variables that must be documented
    const requiredVars = [
      "LMSTUDIO_BASE_URL",
      "LMSTUDIO_API_KEY",
      "LMSTUDIO_MODEL",
    ];

    for (const varName of requiredVars) {
      assert(
        content.includes(varName),
        `.env.example should document ${varName}`,
      );
    }
  },
);

// ─────────────────────────────────────────────────
// Deployment Main Configuration Tests
// ─────────────────────────────────────────────────

Deno.test("Deployment - should have deploy/main.ts", async () => {
  const deployMainPath = join(ROOT_DIR, "deploy", "main.ts");
  assert(await fileExists(deployMainPath), "deploy/main.ts should exist");
});

Deno.test(
  "Deployment - should use environment variables for API configuration",
  async () => {
    const deployMainPath = join(ROOT_DIR, "deploy", "main.ts");
    const content = await readFileIfExists(deployMainPath);
    if (!content) return;

    // Should read from environment, not hardcode
    assert(
      content.match(/Deno\.env\.get\s*\(\s*["']LLM_API/),
      "Should read LLM_API from environment",
    );
  },
);

Deno.test(
  "Deployment - should have fallback for local development",
  async () => {
    const deployMainPath = join(ROOT_DIR, "deploy", "main.ts");
    const content = await readFileIfExists(deployMainPath);
    if (!content) return;

    // Should have localhost fallback for local dev
    assert(
      content.match(/localhost:1234|127\.0\.0\.1:1234/),
      "Should have localhost:1234 fallback",
    );
  },
);

Deno.test("Deployment - should detect deployment environment", async () => {
  const deployMainPath = join(ROOT_DIR, "deploy", "main.ts");
  const content = await readFileIfExists(deployMainPath);
  if (!content) return;

  // Should check for DENO_DEPLOYMENT_ID
  assert(
    content.includes("DENO_DEPLOYMENT_ID"),
    "Should check DENO_DEPLOYMENT_ID for environment detection",
  );
});

Deno.test(
  "Deployment - should not have hardcoded production URLs",
  async () => {
    const deployMainPath = join(ROOT_DIR, "deploy", "main.ts");
    const content = await readFileIfExists(deployMainPath);
    if (!content) return;

    // Should not hardcode production API endpoints
    assert(
      !content.match(/https:\/\/api\.openai\.com(?!.*example)/),
      "Should not hardcode OpenAI production URL",
    );
    assert(
      !content.match(/https:\/\/api\.anthropic\.com(?!.*example)/),
      "Should not hardcode Anthropic production URL",
    );
  },
);

// ─────────────────────────────────────────────────
// Configuration Variable Consistency Tests
// ─────────────────────────────────────────────────

Deno.test(
  "Config Consistency - should use consistent variable naming",
  async () => {
    const srcConfigPath = join(ROOT_DIR, "src", "config.ts");
    const srcConfigContent = await readFileIfExists(srcConfigPath);
    if (!srcConfigContent) return;

    // src/config.ts uses LMSTUDIO_* pattern
    const srcUsesLmstudio = srcConfigContent.includes("LMSTUDIO_");
    assert(srcUsesLmstudio, "src/config.ts should use LMSTUDIO_* variables");
  },
);

Deno.test(
  "Config Consistency - should have matching default ports",
  async () => {
    const srcConfigPath = join(ROOT_DIR, "src", "config.ts");
    const deployMainPath = join(ROOT_DIR, "deploy", "main.ts");

    const srcConfigContent = await readFileIfExists(srcConfigPath);
    const deployMainContent = await readFileIfExists(deployMainPath);

    if (!srcConfigContent || !deployMainContent) return;

    // Both should default to port 1234 for LM Studio
    assert(
      srcConfigContent.includes("1234"),
      "src/config.ts should use port 1234",
    );
    assert(
      deployMainContent.includes("1234"),
      "deploy/main.ts should use port 1234",
    );
  },
);

// ─────────────────────────────────────────────────
// Git Configuration Tests
// ─────────────────────────────────────────────────

Deno.test("Git - should have .gitignore", async () => {
  const gitignorePath = join(ROOT_DIR, ".gitignore");
  assert(await fileExists(gitignorePath), ".gitignore should exist");
});

Deno.test("Git - .gitignore should exclude .env", async () => {
  const gitignorePath = join(ROOT_DIR, ".gitignore");
  const content = await readFileIfExists(gitignorePath);
  if (!content) return;

  // Should ignore .env
  assert(content.match(/^\.env$/m), ".gitignore should exclude .env");
});

// ─────────────────────────────────────────────────
// Deno Configuration Tests
// ─────────────────────────────────────────────────

Deno.test("Deno - should have deno.json", async () => {
  const denoJsonPath = join(ROOT_DIR, "deno.json");
  assert(await fileExists(denoJsonPath), "deno.json should exist");
});

Deno.test("Deno - should have test task defined", async () => {
  const denoJsonPath = join(ROOT_DIR, "deno.json");
  const content = await readFileIfExists(denoJsonPath);
  if (!content) return;

  const denoConfig = JSON.parse(content);
  const tasks = denoConfig.tasks as Record<string, string> | undefined;

  assertExists(tasks, "deno.json should have tasks");
  assertExists(tasks?.test, "deno.json should have test task");
});

Deno.test("Deno - should have @std imports", async () => {
  const denoJsonPath = join(ROOT_DIR, "deno.json");
  const content = await readFileIfExists(denoJsonPath);
  if (!content) return;

  const denoConfig = JSON.parse(content);
  const imports = denoConfig.imports as Record<string, string> | undefined;

  // Should have @std imports for Deno
  const hasStdImports = imports &&
    Object.keys(imports).some((k) => k.startsWith("@std/"));
  assert(hasStdImports, "deno.json should have @std/* imports");
});

// ─────────────────────────────────────────────────
// API Endpoint Consistency Tests
// ─────────────────────────────────────────────────

Deno.test("UI - Fresh app entry should exist", async () => {
  const appPath = join(ROOT_DIR, "src", "ui", "app.ts");
  const content = await readFileIfExists(appPath);
  assertExists(content, "Fresh app entry should exist");
});

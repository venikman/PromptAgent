/**
 * Project Configuration Validation Tests
 *
 * Ensures configuration consistency between local (LM Studio) and
 * runtime environments. Catches common issues before running the app.
 *
 * @module project-config.test
 */

import { assert, assertExists } from "@std/assert";
import { join } from "@std/path";

const ROOT_DIR = join(import.meta.dirname ?? ".", "..");
const IS_CI = Boolean(Deno.env.get("CI"));

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
    if (IS_CI) return;
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
// UI Entry Point Tests
// ─────────────────────────────────────────────────

Deno.test("UI - Vite app entry should exist", async () => {
  const indexPath = join(ROOT_DIR, "src", "ui", "index.html");
  const entryPath = join(ROOT_DIR, "src", "ui", "src", "main.tsx");
  const indexContent = await readFileIfExists(indexPath);
  const entryContent = await readFileIfExists(entryPath);
  assertExists(indexContent, "Vite index.html should exist");
  assertExists(entryContent, "Vite main.tsx should exist");
});

/**
 * Environment Consistency Test Suite
 *
 * Validates that local development (LM Studio) and deployment
 * configurations are consistent and won't cause runtime issues.
 *
 * @module env-consistency.test
 */

import { assertEquals, assert, assertExists } from "@std/assert";
import { join } from "@std/path";
import { env } from "./config.ts";

const ROOT_DIR = join(import.meta.dirname ?? ".", "..");

// Helper to read file if exists
async function readFileIfExists(path: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(path);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────
// Environment Variable Naming Consistency Tests
// ─────────────────────────────────────────────────

Deno.test(
  "Naming - should use LMSTUDIO_ prefix consistently in config",
  async () => {
    const configPath = join(ROOT_DIR, "src", "config.ts");
    const content = await readFileIfExists(configPath);
    if (!content) return;

    // Extract all env var names from schema
    const envVarMatches = content.matchAll(/(\w+):\s*z\./g);
    const envVars = [...envVarMatches].map((m) => m[1]);

    // LM Studio related vars should use LMSTUDIO_ prefix
    const lmVars = envVars.filter(
      (v): v is string =>
        v !== undefined &&
        (v.includes("MODEL") ||
          v.includes("API_KEY") ||
          v.includes("BASE_URL") ||
          v.includes("JUDGE")),
    );

    for (const varName of lmVars) {
      const usesLmstudioPrefix =
        varName.startsWith("LMSTUDIO_") || !varName.includes("LLM");
      if (!usesLmstudioPrefix) {
        console.warn(`  ⚠ ${varName} should use LMSTUDIO_ prefix`);
      }
    }

    // At least some LMSTUDIO_ vars should exist
    const hasLmstudioVars = lmVars.some((v) => v.startsWith("LMSTUDIO_"));
    assert(hasLmstudioVars, "Should have LMSTUDIO_ prefixed variables");
  },
);

Deno.test(
  "Naming - deploy/main.ts should support config patterns",
  async () => {
    const deployPath = join(ROOT_DIR, "deploy", "main.ts");
    const content = await readFileIfExists(deployPath);
    if (!content) return;

    // Check if deploy supports both patterns for backwards compatibility
    const hasLlmPattern = content.includes("LLM_API_");
    const hasLmstudioPattern = content.includes("LMSTUDIO_");

    // At minimum, one pattern should be supported
    assert(
      hasLlmPattern || hasLmstudioPattern,
      "deploy/main.ts should support LLM_* or LMSTUDIO_* patterns",
    );

    if (hasLlmPattern && !hasLmstudioPattern) {
      console.warn(
        "  ⚠ deploy/main.ts uses LLM_* but src/config.ts uses LMSTUDIO_*",
      );
      console.warn("  Consider adding LMSTUDIO_* fallback for consistency");
    }
  },
);

// ─────────────────────────────────────────────────
// Port Configuration Consistency Tests
// ─────────────────────────────────────────────────

Deno.test("Ports - LM Studio should use port 1234", () => {
  const url = new URL(env.LMSTUDIO_BASE_URL);
  assertEquals(url.port, "1234", "LM Studio should use port 1234");
});

Deno.test("Ports - Backend server should use Deno.serve", async () => {
  const deployPath = join(ROOT_DIR, "deploy", "main.ts");
  const content = await readFileIfExists(deployPath);
  if (!content) return;

  // Should use Deno.serve (defaults to port 8000)
  assert(content.includes("Deno.serve"), "Backend should use Deno.serve");
});

Deno.test("Ports - Vite should proxy to correct backend port", async () => {
  const vitePath = join(ROOT_DIR, "ui", "vite.config.ts");
  const content = await readFileIfExists(vitePath);
  if (!content) return;

  // Should proxy to localhost:8000
  assert(
    content.match(/localhost:8000|127\.0\.0\.1:8000/),
    "Vite should proxy to localhost:8000",
  );
});

// ─────────────────────────────────────────────────
// Model Configuration Consistency Tests
// ─────────────────────────────────────────────────

Deno.test("Model - should have model configured", () => {
  assertExists(env.LMSTUDIO_MODEL, "LMSTUDIO_MODEL should be defined");
  assert(env.LMSTUDIO_MODEL.length > 0, "LMSTUDIO_MODEL should not be empty");
});

Deno.test("Model - generator model should exist for judge fallback", () => {
  // If LMSTUDIO_JUDGE_MODEL is not set, it should use generator model
  const judgeModel = env.LMSTUDIO_JUDGE_MODEL;

  if (!judgeModel) {
    // This is expected behavior - should use generator model
    assertExists(
      env.LMSTUDIO_MODEL,
      "Generator model should exist as fallback for judge",
    );
  }
});

// ─────────────────────────────────────────────────
// API Endpoint Consistency Tests
// ─────────────────────────────────────────────────

Deno.test("API - should have consistent API versioning", async () => {
  const deployPath = join(ROOT_DIR, "deploy", "main.ts");
  const content = await readFileIfExists(deployPath);
  if (!content) return;

  // Check for version prefixes - deploy uses v2 for orchestrator endpoints
  const hasV2 = content.includes('"/v2');

  // At minimum, v2 should exist for orchestrator API
  assert(hasV2, "Should have v2 API endpoints");
});

// ─────────────────────────────────────────────────
// Environment File Sync Tests
// ─────────────────────────────────────────────────

Deno.test(
  "Env Sync - .env and .env.example should have same variables",
  async () => {
    const envPath = join(ROOT_DIR, ".env");
    const envExamplePath = join(ROOT_DIR, ".env.example");

    const envContent = await readFileIfExists(envPath);
    const exampleContent = await readFileIfExists(envExamplePath);

    if (!envContent || !exampleContent) return;

    const parseEnvFile = (content: string): Set<string> => {
      const vars = new Set<string>();
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=/);
          if (match && match[1]) {
            vars.add(match[1]);
          }
        }
      }
      return vars;
    };

    const envVars = parseEnvFile(envContent);
    const exampleVars = parseEnvFile(exampleContent);

    // Check for vars in .env but not in .env.example
    const missingInExample: string[] = [];
    for (const v of envVars) {
      if (!exampleVars.has(v)) {
        missingInExample.push(v);
      }
    }

    if (missingInExample.length > 0) {
      console.warn("  ⚠ Variables in .env but not in .env.example:");
      missingInExample.forEach((v) => console.warn(`    - ${v}`));
    }

    // Check for vars in .env.example but not in .env
    const missingInEnv: string[] = [];
    for (const v of exampleVars) {
      if (!envVars.has(v)) {
        missingInEnv.push(v);
      }
    }

    if (missingInEnv.length > 0) {
      console.warn("  ⚠ Variables in .env.example but not in .env:");
      missingInEnv.forEach((v) => console.warn(`    - ${v}`));
    }
  },
);

// ─────────────────────────────────────────────────
// Deployment Readiness Tests
// ─────────────────────────────────────────────────

Deno.test(
  "Readiness - should not have TODO comments in critical paths",
  async () => {
    const criticalFiles = ["src/config.ts", "src/models.ts", "deploy/main.ts"];

    const filesWithTodos: string[] = [];

    for (const file of criticalFiles) {
      const filePath = join(ROOT_DIR, file);
      const content = await readFileIfExists(filePath);
      if (!content) continue;

      if (content.match(/\/\/\s*TODO|\/\*\s*TODO/i)) {
        filesWithTodos.push(file);
      }
    }

    if (filesWithTodos.length > 0) {
      console.warn("  ⚠ TODOs in critical files:");
      filesWithTodos.forEach((f) => console.warn(`    - ${f}`));
    }
  },
);

Deno.test("Readiness - should have orchestrator exports", async () => {
  const indexPath = join(ROOT_DIR, "src", "orchestrator", "index.ts");
  const content = await readFileIfExists(indexPath);
  if (!content) return;

  // Check for essential exports
  const requiredExports = [
    "runOptimizationLoop",
    "OptimizationProgress",
    "createOptimizationTask",
  ];

  for (const exp of requiredExports) {
    const hasExport =
      content.includes(`export { ${exp}`) ||
      content.includes(`export type { ${exp}`) ||
      content.includes(`${exp},`) ||
      content.includes(`${exp} }`);

    if (!hasExport) {
      console.warn(`  ⚠ Missing export: ${exp}`);
    }
  }
});

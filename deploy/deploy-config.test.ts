/**
 * Deploy Configuration Tests
 *
 * These tests ensure the deployed application won't fail due to
 * localhost fallbacks being used in production.
 *
 * The key issue: deploy/main.ts uses:
 *   const LLM_BASE_URL = Deno.env.get("LLM_BASE_URL") ?? "http://localhost:1234/v1";
 *
 * In production (Deno Deploy), if LLM_BASE_URL isn't set, it falls back
 * to localhost which doesn't exist - causing runtime failures.
 *
 * @module deploy-config.test
 */

import { assertEquals, assert, assertExists } from "@std/assert";
import { join } from "@std/path";

const DEPLOY_DIR = import.meta.dirname ?? ".";
const ROOT_DIR = join(DEPLOY_DIR, "..");

// Helper to read file
async function readFile(path: string): Promise<string> {
  return await Deno.readTextFile(path);
}

// ─────────────────────────────────────────────────
// Production Safety Tests
// ─────────────────────────────────────────────────

Deno.test("Deploy - should detect deployment environment", async () => {
  const content = await readFile(join(DEPLOY_DIR, "main.ts"));

  // Should check DENO_DEPLOYMENT_ID to detect production
  assert(
    content.includes("DENO_DEPLOYMENT_ID"),
    "Should detect Deno Deploy environment via DENO_DEPLOYMENT_ID",
  );
});

Deno.test(
  "Deploy - should NOT use localhost fallback in production",
  async () => {
    const content = await readFile(join(DEPLOY_DIR, "main.ts"));

    // Check for the problematic pattern: env var ?? "localhost"
    const hasLocalhostFallback = content.match(
      /Deno\.env\.get\s*\([^)]+\)\s*\?\?\s*["'][^"']*localhost[^"']*["']/,
    );

    // This is a CRITICAL issue - localhost fallbacks cause production failures
    if (hasLocalhostFallback) {
      // Check if there's deployment detection that throws for missing config in prod
      const hasDeployGuard =
        content.includes("isDeployed") && content.includes("throw new Error");

      assert(
        hasDeployGuard,
        "CRITICAL: Localhost fallback found without production guard!\n" +
          "Pattern: " +
          hasLocalhostFallback[0] +
          "\n\n" +
          "This causes: 'error sending request for url (http://localhost:1234/...)'\n" +
          "Fix: Add startup validation that throws if LLM_BASE_URL is not set in production.\n" +
          "Example:\n" +
          '  const isDeployed = !!Deno.env.get("DENO_DEPLOYMENT_ID");\n' +
          "  if (isDeployed && !Deno.env.get('LLM_BASE_URL')) {\n" +
          "    throw new Error('LLM_BASE_URL required in production');\n" +
          "  }",
      );
    }
  },
);

Deno.test(
  "Deploy - should validate LLM config on startup in production",
  async () => {
    const content = await readFile(join(DEPLOY_DIR, "main.ts"));

    // In production, LLM_BASE_URL should be required (no silent localhost fallback)
    const isDeployed = Deno.env.get("DENO_DEPLOYMENT_ID");

    if (isDeployed) {
      // When running on Deno Deploy, env vars must be set
      const llmUrl = Deno.env.get("LLM_BASE_URL");
      assertExists(
        llmUrl,
        "LLM_BASE_URL must be set in production. " +
          "Configure this in Deno Deploy environment variables.",
      );
      assert(
        !llmUrl.includes("localhost"),
        "LLM_BASE_URL cannot be localhost in production",
      );
    }
  },
);

Deno.test(
  "Deploy - LLM_BASE_URL should not default to localhost in prod code",
  async () => {
    const content = await readFile(join(DEPLOY_DIR, "main.ts"));

    // Find the LLM_BASE_URL assignment
    const urlAssignment = content.match(/LLM_BASE_URL\s*=[\s\S]*?(?:;|\n\n)/);

    if (urlAssignment) {
      const assignment = urlAssignment[0];

      // Should either:
      // 1. Not have localhost fallback, OR
      // 2. Have deployment detection that throws/errors for localhost in prod
      const hasLocalhostDefault = assignment.includes("localhost:1234");

      if (hasLocalhostDefault) {
        // Check if the code handles this case for production
        const hasProductionCheck =
          content.includes("isDeployed") ||
          (content.includes("DENO_DEPLOYMENT_ID") &&
            content.includes("localhost") &&
            (content.includes("throw") ||
              content.includes("console.error") ||
              content.includes("must be set")));

        assert(
          hasProductionCheck,
          "LLM_BASE_URL defaults to localhost but lacks production validation. " +
            "The deployed app will fail when trying to connect to localhost:1234. " +
            "Add: if (isDeployed && !LLM_BASE_URL) throw new Error('LLM_BASE_URL required')",
        );
      }
    }
  },
);

// ─────────────────────────────────────────────────
// Environment Variable Requirements
// ─────────────────────────────────────────────────

Deno.test("Deploy - should document required env vars", async () => {
  const envExample = await readFile(join(ROOT_DIR, ".env.example"));

  // These vars are used in deploy/main.ts and MUST be documented
  const requiredVars = ["LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"];

  const missingDocs: string[] = [];
  for (const varName of requiredVars) {
    if (!envExample.includes(varName)) {
      missingDocs.push(varName);
    }
  }

  assertEquals(
    missingDocs.length,
    0,
    `Missing documentation for deploy env vars: ${missingDocs.join(", ")}. ` +
      "Add them to .env.example so deployers know to set them.",
  );
});

// ─────────────────────────────────────────────────
// Runtime Environment Detection
// ─────────────────────────────────────────────────

Deno.test("Deploy - isDeployed detection should exist", async () => {
  const content = await readFile(join(DEPLOY_DIR, "main.ts"));

  // Should have a way to detect if running on Deno Deploy
  const hasDeployDetection =
    content.includes('Deno.env.get("DENO_DEPLOYMENT_ID")') ||
    content.includes("Deno.env.get('DENO_DEPLOYMENT_ID')");

  assert(
    hasDeployDetection,
    "Missing deployment environment detection. " +
      'Add: const isDeployed = !!Deno.env.get("DENO_DEPLOYMENT_ID")',
  );
});

Deno.test(
  "Deploy - should fail fast on missing config in production",
  async () => {
    const content = await readFile(join(DEPLOY_DIR, "main.ts"));

    // Simulate production environment check
    const isDeployed = Deno.env.get("DENO_DEPLOYMENT_ID");

    if (isDeployed) {
      // In production, these must be set
      const requiredVars = ["LLM_BASE_URL", "LLM_API_KEY"];

      for (const varName of requiredVars) {
        const value = Deno.env.get(varName);
        assertExists(
          value,
          `${varName} is required in production but not set. ` +
            "Configure in Deno Deploy dashboard → Settings → Environment Variables",
        );
      }
    } else {
      // In local dev, just check the code has validation
      const hasValidation =
        content.includes("required") ||
        content.includes("must be set") ||
        (content.includes("isDeployed") && content.includes("throw"));

      // This is a softer check - just warn if no validation exists
      if (!hasValidation) {
        console.warn(
          "  ⚠ deploy/main.ts may not validate required env vars in production",
        );
      }
    }
  },
);

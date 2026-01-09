/**
 * Connectivity Test Suite
 *
 * Tests LM Studio and API endpoint connectivity.
 * These tests are skipped in CI (no LM Studio) but run locally.
 *
 * Run with: deno task test:connectivity
 *
 * @module connectivity.test
 */

import { assertEquals, assert, assertExists } from "@std/assert";
import { env } from "./config.ts";

// Skip connectivity tests unless explicitly enabled
// Run with: CONNECTIVITY_TEST=true deno task test:connectivity
// Run with: BACKEND_TEST=true deno task test:connectivity (for backend tests)
const isCI = Deno.env.get("CI") === "true";
const skipLmStudio = !Deno.env.get("CONNECTIVITY_TEST") || isCI;
const skipBackend = !Deno.env.get("BACKEND_TEST") || isCI;

// ─────────────────────────────────────────────────
// LM Studio Connectivity Tests
// ─────────────────────────────────────────────────

Deno.test({
  name: "LM Studio - should connect to models endpoint",
  ignore: skipLmStudio,
  async fn() {
    const baseUrl = env.LMSTUDIO_BASE_URL;
    const apiKey = env.LMSTUDIO_API_KEY;

    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });

      assertEquals(response.status, 200, "Expected 200 status from LM Studio");

      const data = await response.json();
      assertExists(data.data, "Response should have 'data' property");
      assert(Array.isArray(data.data), "data.data should be an array");
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new Error(
          `Cannot connect to LM Studio at ${baseUrl}. ` +
            `Make sure LM Studio is running with the server enabled on port 1234.`,
        );
      }
      throw error;
    }
  },
});

Deno.test({
  name: "LM Studio - should have at least one model loaded",
  ignore: skipLmStudio,
  async fn() {
    const baseUrl = env.LMSTUDIO_BASE_URL;
    const apiKey = env.LMSTUDIO_API_KEY;

    const response = await fetch(`${baseUrl}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });

    const data = await response.json();

    if (data.data.length === 0) {
      throw new Error(
        "No models loaded in LM Studio. " +
          "Please load a model before running tests.",
      );
    }

    assert(data.data.length > 0, "Should have at least one model loaded");
    console.log(
      `  ✓ Found ${data.data.length} model(s): ${data.data.map((m: { id: string }) => m.id).join(", ")}`,
    );
  },
});

Deno.test({
  name: "LM Studio - should have the configured model available",
  ignore: skipLmStudio,
  async fn() {
    const baseUrl = env.LMSTUDIO_BASE_URL;
    const apiKey = env.LMSTUDIO_API_KEY;

    const response = await fetch(`${baseUrl}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });

    const data = await response.json();
    const modelIds = data.data.map((m: { id: string }) => m.id);
    const configuredModel = env.LMSTUDIO_MODEL;

    // Check if configured model matches any loaded model (partial match OK)
    const modelAvailable = modelIds.some(
      (id: string) =>
        id.includes(configuredModel) || configuredModel.includes(id),
    );

    if (!modelAvailable) {
      console.warn(
        `  ⚠ Configured model "${configuredModel}" not found in loaded models: ${modelIds.join(", ")}`,
      );
      console.warn(
        "  This may cause issues if the model names don't match exactly.",
      );
    }
  },
});

Deno.test({
  name: "LM Studio - should complete a simple chat completion",
  ignore: skipLmStudio,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const baseUrl = env.LMSTUDIO_BASE_URL;
    const apiKey = env.LMSTUDIO_API_KEY;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: env.LMSTUDIO_MODEL,
        messages: [{ role: "user", content: "Say hello in one word." }],
        max_tokens: 10,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Chat completion failed (${response.status}): ${text}. ` +
          `Check if model "${env.LMSTUDIO_MODEL}" is loaded.`,
      );
    }

    const data = await response.json();
    assertExists(data.choices, "Response should have 'choices'");
    assert(data.choices.length > 0, "Should have at least one choice");
    assertExists(data.choices[0].message, "Choice should have 'message'");
    assertExists(
      data.choices[0].message.content,
      "Message should have 'content'",
    );
  },
});

// ─────────────────────────────────────────────────
// Backend Server Connectivity Tests (skipped in CI)
// ─────────────────────────────────────────────────

Deno.test({
  name: "Backend - should connect to health endpoint",
  ignore: skipBackend,
  async fn() {
    const backendUrl = "http://localhost:8000";

    try {
      const response = await fetch(`${backendUrl}/health`);
      assert(response.ok, "Backend health check should return OK");

      const data = await response.json();
      assertEquals(data.status, "ok", "Status should be 'ok'");
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new Error(
          `Cannot connect to backend at ${backendUrl}. ` +
            `Start the server with: cd deploy && deno run -A main.ts`,
        );
      }
      throw error;
    }
  },
});

// ─────────────────────────────────────────────────
// URL Configuration Consistency Tests (always run)
// ─────────────────────────────────────────────────

Deno.test("URL Config - should use consistent localhost format", () => {
  const url = new URL(env.LMSTUDIO_BASE_URL);

  // Both localhost and 127.0.0.1 are valid
  const validHosts = ["localhost", "127.0.0.1"];
  assert(
    validHosts.includes(url.hostname),
    `Expected localhost or 127.0.0.1, got ${url.hostname}`,
  );

  // Should use standard LM Studio port
  assertEquals(url.port, "1234", "Should use LM Studio port 1234");

  // Should use /v1 path
  assertEquals(url.pathname, "/v1", "Should use /v1 API path");
});

Deno.test("URL Config - should not have trailing slashes in base URLs", () => {
  assert(
    !env.LMSTUDIO_BASE_URL.endsWith("/"),
    "Base URL should not end with /",
  );
});

Deno.test("URL Config - should use http for localhost", () => {
  const url = new URL(env.LMSTUDIO_BASE_URL);

  // Localhost should use http, not https
  if (["localhost", "127.0.0.1"].includes(url.hostname)) {
    assertEquals(url.protocol, "http:", "Localhost should use http protocol");
  }
});

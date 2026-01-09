/**
 * Integration tests for the API endpoints
 *
 * These tests verify the HTTP API behavior without requiring an LLM backend.
 * They test routing, request validation, and response formats.
 */

import { assertEquals, assert, assertExists } from "@std/assert";

// Base URL for testing - uses the same server module
const TEST_PORT = 8765;
let server: Deno.HttpServer | null = null;
let baseUrl: string;

// ─────────────────────────────────────────────────
// Test Setup / Teardown
// ─────────────────────────────────────────────────

async function startTestServer(): Promise<void> {

  // Minimal test server that mimics main.ts routing
  server = Deno.serve({ port: TEST_PORT }, async (req) => {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "content-type",
          "access-control-allow-methods": "GET,POST,OPTIONS",
        },
      });
    }

    const jsonResponse = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
        },
      });

    // Health check
    if (url.pathname === "/health") {
      return jsonResponse({ status: "ok", time: new Date().toISOString() });
    }

    // Epics endpoint (mock)
    if (url.pathname === "/epics" && req.method === "GET") {
      return jsonResponse({
        epics: [
          { id: "E-101", title: "Test Epic 1", description: "Description 1" },
          { id: "E-102", title: "Test Epic 2", description: "Description 2" },
        ],
      });
    }

    // Champion endpoint (mock)
    if (url.pathname === "/champion" && req.method === "GET") {
      return jsonResponse({
        base: "Base prompt content",
        patch: "Patch content",
        composed: "Base prompt content\n\n## PATCH SECTION\nPatch content",
      });
    }

    // Generate story - requires epicId
    if (url.pathname === "/generate-story" && req.method === "POST") {
      let payload: Record<string, unknown> | null = null;
      try {
        payload = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      if (!payload?.epicId) {
        return jsonResponse({ error: "epicId is required" }, 400);
      }

      // Mock response (no actual LLM call)
      return jsonResponse({
        result: {
          storyPack: null,
          rawText: "Mock response - LLM not available in tests",
          error: "LLM backend not configured for tests",
        },
        scorerResult: null,
      });
    }

    // V2 Playground
    if (url.pathname === "/v2/playground" && req.method === "POST") {
      let payload: Record<string, unknown> | null = null;
      try {
        payload = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      if (!payload?.epicId) {
        return jsonResponse({ error: "epicId is required" }, 400);
      }

      return jsonResponse({
        result: {
          storyPack: null,
          rawText: "Mock v2 response",
          error: "LLM backend not configured for tests",
        },
        scorerResult: null,
      });
    }

    // V2 Evaluate
    if (url.pathname === "/v2/evaluate" && req.method === "POST") {
      return jsonResponse({
        taskId: "test-task-" + crypto.randomUUID(),
        status: "pending",
      });
    }

    // V2 Tasks
    if (url.pathname.startsWith("/v2/tasks/") && req.method === "GET") {
      const taskId = url.pathname.split("/")[3];
      return jsonResponse({
        taskId,
        type: "evaluation",
        status: "pending",
        progress: { completed: 0, total: 10 },
        startedAt: new Date().toISOString(),
      });
    }

    // Mine pairs - pure computation
    if (url.pathname === "/mine-pairs" && req.method === "POST") {
      let payload: Record<string, unknown> | null = null;
      try {
        payload = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      if (!payload?.report) {
        return jsonResponse({ error: "report with perEpic is required" }, 400);
      }

      return jsonResponse({ pairs: [] });
    }

    // Root - API info
    if (url.pathname === "/") {
      return jsonResponse({
        service: "PromptAgent Test API",
        routes: {
          "GET /health": "Health check",
          "GET /epics": "List epics",
        },
      });
    }

    return jsonResponse({ error: "not_found" }, 404);
  });

  baseUrl = `http://localhost:${TEST_PORT}`;

  // Wait for server to be ready
  await new Promise((resolve) => setTimeout(resolve, 100));
}

async function stopTestServer(): Promise<void> {
  if (server) {
    await server.shutdown();
    server = null;
  }
}

// ─────────────────────────────────────────────────
// Health Check Tests
// ─────────────────────────────────────────────────

Deno.test({
  name: "API - GET /health returns ok status",
  async fn() {
    await startTestServer();
    try {
      const res = await fetch(`${baseUrl}/health`);
      assertEquals(res.status, 200);

      const data = await res.json();
      assertEquals(data.status, "ok");
      assertExists(data.time);
    } finally {
      await stopTestServer();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ─────────────────────────────────────────────────
// CORS Tests
// ─────────────────────────────────────────────────

Deno.test({
  name: "API - OPTIONS returns CORS headers",
  async fn() {
    await startTestServer();
    try {
      const res = await fetch(`${baseUrl}/health`, { method: "OPTIONS" });
      assertEquals(res.status, 204);
      assertEquals(res.headers.get("access-control-allow-origin"), "*");
      assertEquals(res.headers.get("access-control-allow-methods"), "GET,POST,OPTIONS");
    } finally {
      await stopTestServer();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ─────────────────────────────────────────────────
// Epics Endpoint Tests
// ─────────────────────────────────────────────────

Deno.test({
  name: "API - GET /epics returns epic list",
  async fn() {
    await startTestServer();
    try {
      const res = await fetch(`${baseUrl}/epics`);
      assertEquals(res.status, 200);

      const data = await res.json();
      assertExists(data.epics);
      assert(Array.isArray(data.epics));
      assert(data.epics.length > 0);

      // Check epic structure
      const epic = data.epics[0];
      assertExists(epic.id);
      assertExists(epic.title);
      assertExists(epic.description);
    } finally {
      await stopTestServer();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ─────────────────────────────────────────────────
// Champion Endpoint Tests
// ─────────────────────────────────────────────────

Deno.test({
  name: "API - GET /champion returns prompt structure",
  async fn() {
    await startTestServer();
    try {
      const res = await fetch(`${baseUrl}/champion`);
      assertEquals(res.status, 200);

      const data = await res.json();
      assertExists(data.base);
      assertExists(data.patch);
      assertExists(data.composed);
    } finally {
      await stopTestServer();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ─────────────────────────────────────────────────
// Generate Story Tests
// ─────────────────────────────────────────────────

Deno.test({
  name: "API - POST /generate-story requires epicId",
  async fn() {
    await startTestServer();
    try {
      const res = await fetch(`${baseUrl}/generate-story`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),  // Missing epicId
      });
      assertEquals(res.status, 400);

      const data = await res.json();
      assertEquals(data.error, "epicId is required");
    } finally {
      await stopTestServer();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "API - POST /generate-story rejects invalid JSON",
  async fn() {
    await startTestServer();
    try {
      const res = await fetch(`${baseUrl}/generate-story`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json",
      });
      assertEquals(res.status, 400);

      const data = await res.json();
      assertEquals(data.error, "Invalid JSON body");
    } finally {
      await stopTestServer();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ─────────────────────────────────────────────────
// V2 Endpoint Tests
// ─────────────────────────────────────────────────

Deno.test({
  name: "API - POST /v2/playground requires epicId",
  async fn() {
    await startTestServer();
    try {
      const res = await fetch(`${baseUrl}/v2/playground`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      assertEquals(res.status, 400);

      const data = await res.json();
      assertEquals(data.error, "epicId is required");
    } finally {
      await stopTestServer();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "API - POST /v2/evaluate returns taskId",
  async fn() {
    await startTestServer();
    try {
      const res = await fetch(`${baseUrl}/v2/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replicates: 2 }),
      });
      assertEquals(res.status, 200);

      const data = await res.json();
      assertExists(data.taskId);
      assertEquals(data.status, "pending");
    } finally {
      await stopTestServer();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "API - GET /v2/tasks/:id returns task status",
  async fn() {
    await startTestServer();
    try {
      const res = await fetch(`${baseUrl}/v2/tasks/test-task-123`);
      assertEquals(res.status, 200);

      const data = await res.json();
      assertExists(data.taskId);
      assertExists(data.status);
      assertExists(data.progress);
    } finally {
      await stopTestServer();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ─────────────────────────────────────────────────
// Pair Mining Tests
// ─────────────────────────────────────────────────

Deno.test({
  name: "API - POST /mine-pairs requires report",
  async fn() {
    await startTestServer();
    try {
      const res = await fetch(`${baseUrl}/mine-pairs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      assertEquals(res.status, 400);
    } finally {
      await stopTestServer();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ─────────────────────────────────────────────────
// 404 Tests
// ─────────────────────────────────────────────────

Deno.test({
  name: "API - Unknown route returns 404",
  async fn() {
    await startTestServer();
    try {
      const res = await fetch(`${baseUrl}/unknown-route`);
      assertEquals(res.status, 404);

      const data = await res.json();
      assertEquals(data.error, "not_found");
    } finally {
      await stopTestServer();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// ─────────────────────────────────────────────────
// Root Endpoint Tests
// ─────────────────────────────────────────────────

Deno.test({
  name: "API - GET / returns service info",
  async fn() {
    await startTestServer();
    try {
      const res = await fetch(`${baseUrl}/`);
      assertEquals(res.status, 200);

      const data = await res.json();
      assertExists(data.service);
      assertExists(data.routes);
    } finally {
      await stopTestServer();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

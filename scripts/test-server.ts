#!/usr/bin/env -S deno run -A
/**
 * Simple test server for API testing
 * Usage: deno run -A scripts/test-server.ts
 */

const LLM_API_BASE_URL = Deno.env.get("LLM_API_BASE_URL") ?? "http://localhost:1234/v1";
const LLM_API_KEY = Deno.env.get("LLM_API_KEY") ?? "";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve({ port: 8000 }, async (req) => {
  const url = new URL(req.url);
  console.log(`${req.method} ${url.pathname}`);

  // Health check
  if (url.pathname === "/health") {
    return json({ status: "ok", time: new Date().toISOString() });
  }

  // Get current model from LM Studio
  if (url.pathname === "/model") {
    try {
      const res = await fetch(`${LLM_API_BASE_URL}/models`);
      const data = await res.json();
      return json({
        endpoint: LLM_API_BASE_URL,
        models: data.data ?? data,
      });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }

  // Simple chat completion test
  if (url.pathname === "/chat" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const message = body.message ?? "Hello!";

    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (LLM_API_KEY) headers["authorization"] = `Bearer ${LLM_API_KEY}`;

      const res = await fetch(`${LLM_API_BASE_URL}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: body.model ?? "default",
          messages: [{ role: "user", content: message }],
          max_tokens: 100,
        }),
      });

      const data = await res.json();
      return json({
        response: data.choices?.[0]?.message?.content ?? data,
        model: data.model,
      });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }

  // List endpoints
  if (url.pathname === "/") {
    return json({
      endpoints: {
        "GET /health": "Health check",
        "GET /model": "List available models from LM Studio",
        "POST /chat": "Test chat completion { message: string, model?: string }",
      },
      config: {
        LLM_API_BASE_URL,
      },
    });
  }

  return json({ error: "not_found" }, 404);
});

const OLLAMA_API_BASE_URL =
  Deno.env.get("OLLAMA_API_BASE_URL") ?? "https://ollama.com/api";
const OLLAMA_API_KEY = Deno.env.get("OLLAMA_API_KEY") ?? "";
const DEFAULT_MODEL = Deno.env.get("OLLAMA_MODEL") ?? "";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
    },
  });

const safeJson = (text: string) => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

type GenerateRequest = {
  prompt?: string;
  model?: string;
  system?: string;
  options?: Record<string, unknown>;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);

  if (url.pathname === "/health") {
    return jsonResponse({ status: "ok", time: new Date().toISOString() });
  }

  if (url.pathname === "/generate" && req.method === "POST") {
    if (!OLLAMA_API_KEY) {
      return jsonResponse({ error: "OLLAMA_API_KEY not configured" }, 500);
    }

    let payload: GenerateRequest | null = null;
    try {
      payload = (await req.json()) as GenerateRequest;
    } catch {
      payload = null;
    }

    const prompt = payload?.prompt?.trim();
    if (!prompt) {
      return jsonResponse({ error: "prompt is required" }, 400);
    }

    const model = payload?.model?.trim() || DEFAULT_MODEL;
    if (!model) {
      return jsonResponse({ error: "model is required" }, 400);
    }

    const requestBody = {
      model,
      prompt,
      stream: false,
      ...(payload?.system ? { system: payload.system } : {}),
      ...(payload?.options ? { options: payload.options } : {}),
    };

    const upstream = await fetch(
      `${OLLAMA_API_BASE_URL.replace(/\/$/, "")}/generate`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${OLLAMA_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
      }
    );

    const raw = await upstream.text();
    if (!upstream.ok) {
      return jsonResponse(
        {
          error: "ollama_error",
          status: upstream.status,
          detail: safeJson(raw),
        },
        upstream.status
      );
    }

    const data = safeJson(raw);
    return jsonResponse({ provider: "ollama-cloud", model, response: data });
  }

  if (url.pathname === "/") {
    return jsonResponse({
      service: "PromptAgent Deno Deploy API",
      routes: {
        "GET /health": "Service health check",
        "POST /generate": "Proxy to Ollama Cloud generate endpoint",
      },
    });
  }

  return jsonResponse({ error: "not_found" }, 404);
});

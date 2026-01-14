import { fromFileUrl } from "@std/path";
import { app } from "../src/ui/app.ts";
import { env } from "../src/config.ts";
import { createApiHandler, type ApiConfig } from "../src/server/handler.ts";
import {
  normalizePath,
  recordHttpRequest,
  startTelemetryReporter,
} from "../src/telemetry.ts";

// ─────────────────────────────────────────────────
// Environment Detection & Validation
// ─────────────────────────────────────────────────
const isDeployed = !!Deno.env.get("DENO_DEPLOYMENT_ID");

// OpenAI-compatible API (OpenRouter, LM Studio, etc.)
// Support both LLM_BASE_URL and legacy LLM_API_BASE_URL
const localLmstudio = {
  baseUrl: Deno.env.get("LMSTUDIO_BASE_URL") ?? "http://localhost:1234/v1",
  apiKey: Deno.env.get("LMSTUDIO_API_KEY") ?? "lm-studio",
  model: Deno.env.get("LMSTUDIO_MODEL") ?? "openai/gpt-oss-120b",
};

const remoteBaseUrl = Deno.env.get("LLM_BASE_URL") ??
  Deno.env.get("LLM_API_BASE_URL");
const remoteApiKey = Deno.env.get("LLM_API_KEY") ?? "";
const remoteModel = Deno.env.get("LLM_MODEL") ?? "openai/gpt-oss-120b";

const useLocalLmstudio = !isDeployed;
const LLM_BASE_URL = useLocalLmstudio
  ? localLmstudio.baseUrl
  : (remoteBaseUrl ?? localLmstudio.baseUrl);
const LLM_API_KEY = useLocalLmstudio ? localLmstudio.apiKey : remoteApiKey;
const LLM_MODEL = useLocalLmstudio ? localLmstudio.model : remoteModel;

// Production validation - fail fast if config is missing
if (isDeployed) {
  if (!Deno.env.get("LLM_BASE_URL") && !Deno.env.get("LLM_API_BASE_URL")) {
    throw new Error(
      "LLM_BASE_URL (or LLM_API_BASE_URL) is required in production. " +
        "Set it in Deno Deploy → Settings → Environment Variables. " +
        "Example: https://openrouter.ai/api/v1",
    );
  }
  if (LLM_BASE_URL.includes("localhost")) {
    throw new Error(
      "LLM_BASE_URL cannot be localhost in production. " +
        "Configure a real API endpoint like OpenRouter or OpenAI.",
    );
  }
  if (!LLM_API_KEY) {
    throw new Error(
      "LLM_API_KEY is required in production. " +
        "Set it in Deno Deploy → Settings → Environment Variables.",
    );
  }
}

// Debug: Log config on startup (key is redacted)
console.log("[LLM Config]", {
  environment: isDeployed ? "production" : "local",
  baseUrl: LLM_BASE_URL,
  model: LLM_MODEL,
  hasKey: !!LLM_API_KEY,
  keyPrefix: LLM_API_KEY ? LLM_API_KEY.slice(0, 10) + "..." : "(none)",
});

// ─────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────
const DATA_ROOT = fromFileUrl(new URL("../data", import.meta.url));
const PROMPTS_ROOT = fromFileUrl(new URL("../prompts", import.meta.url));

const apiConfig: ApiConfig = {
  llmBaseUrl: LLM_BASE_URL,
  llmApiKey: LLM_API_KEY,
  llmModel: LLM_MODEL,
  dataRoot: DATA_ROOT,
  promptsRoot: PROMPTS_ROOT,
};

const apiHandler = createApiHandler(apiConfig);

const uiRootUrl = new URL("../src/ui/", import.meta.url);
const uiRootPath = fromFileUrl(uiRootUrl);
const uiSnapshotUrl = new URL("../src/ui/_fresh/snapshot.js", import.meta.url);

if (isDeployed) {
  try {
    const { setBuildCache, ProdBuildCache } = await import("@fresh/core/internal");
    const snapshot = await import(uiSnapshotUrl.toString());
    setBuildCache(app, new ProdBuildCache(uiRootPath, snapshot), "production");
  } catch (err) {
    console.error(err);
    throw new Error(
      "Fresh build output is missing for production. " +
        "Run `deno task ui:build` before deploying so `src/ui/_fresh` is packaged.",
    );
  }
} else {
  const { Builder } = await import("@fresh/core/dev");
  const builder = new Builder({ root: uiRootUrl.toString() });
  const mode = Deno.env.get("FRESH_MODE") === "development"
    ? "development"
    : "production";
  app.config.mode = mode;
  const applySnapshot = await builder.build({ snapshot: "memory", mode });
  applySnapshot(app);
}

const freshHandler = app.handler();
startTelemetryReporter(env.TELEMETRY_REPORT_INTERVAL_MS);

const API_PREFIXES = [
  "/health",
  "/debug",
  "/telemetry",
  "/epics",
  "/champion",
  "/generate",
  "/generate-story",
  "/evaluate",
  "/mine-pairs",
  "/generate-patches",
  "/run-tournament",
  "/tournament",
  "/v2",
  "/v3",
];

const isApiRoute = (pathname: string) =>
  API_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

Deno.serve(async (req) => {
  const started = performance.now();
  const url = new URL(req.url);
  const isApi = isApiRoute(url.pathname);
  const routeKey = isApi ? normalizePath(url.pathname) : "ui";
  try {
    const res = isApi ? await apiHandler(req) : await freshHandler(req);
    const durationMs = performance.now() - started;
    recordHttpRequest({
      key: `${req.method} ${routeKey}`,
      status: res.status,
      durationMs,
    });
    if (env.TELEMETRY_LOG_REQUESTS) {
      console.log(
        JSON.stringify({
          type: "http",
          at: new Date().toISOString(),
          method: req.method,
          route: routeKey,
          status: res.status,
          durationMs: Math.round(durationMs),
        }),
      );
    }
    return res;
  } catch (err) {
    const durationMs = performance.now() - started;
    recordHttpRequest({
      key: `${req.method} ${routeKey}`,
      status: 500,
      durationMs,
    });
    if (env.TELEMETRY_LOG_REQUESTS) {
      console.log(
        JSON.stringify({
          type: "http",
          at: new Date().toISOString(),
          method: req.method,
          route: routeKey,
          status: 500,
          durationMs: Math.round(durationMs),
        }),
      );
    }
    console.error(err);
    return new Response("Internal server error", { status: 500 });
  }
});

import { fromFileUrl } from "@std/path";
import { app } from "../src/ui/app.ts";
import { env } from "../src/config.ts";
import { type ApiConfig, createApiHandler } from "../src/server/handler.ts";
import {
  normalizePath,
  recordHttpRequest,
  startTelemetryReporter,
} from "../src/telemetry.ts";

const isDeployed = Boolean(Deno.env.get("DENO_DEPLOYMENT_ID"));

if (isDeployed) {
  if (
    !env.LMSTUDIO_BASE_URL ||
    /localhost|127\.0\.0\.1/.test(env.LMSTUDIO_BASE_URL)
  ) {
    throw new Error(
      "LMSTUDIO_BASE_URL must be set to a non-localhost value in production.",
    );
  }
  if (!env.LMSTUDIO_API_KEY || env.LMSTUDIO_API_KEY === "lm-studio") {
    throw new Error("LMSTUDIO_API_KEY must be set in production.");
  }
}

// Debug: Log config on startup (key is redacted)
console.log("[LLM Config]", {
  baseUrl: env.LMSTUDIO_BASE_URL,
  model: env.LMSTUDIO_MODEL,
  hasKey: !!env.LMSTUDIO_API_KEY,
});

// ─────────────────────────────────────────────────
// Paths
// ─────────────────────────────────────────────────
const DATA_ROOT = fromFileUrl(new URL("../data", import.meta.url));
const PROMPTS_ROOT = fromFileUrl(new URL("../prompts", import.meta.url));

const apiConfig: ApiConfig = {
  llmBaseUrl: env.LMSTUDIO_BASE_URL,
  llmApiKey: env.LMSTUDIO_API_KEY,
  llmModel: env.LMSTUDIO_MODEL,
  dataRoot: DATA_ROOT,
  promptsRoot: PROMPTS_ROOT,
};

const apiHandler = createApiHandler(apiConfig);
const uiRootUrl = new URL("../src/ui/", import.meta.url);
const uiRootPath = fromFileUrl(uiRootUrl);
const uiMode = "production";
app.config.mode = uiMode;

let freshHandler: (req: Request) => Response | Promise<Response>;

try {
  const { setBuildCache, ProdBuildCache } = await import(
    "@fresh/core/internal"
  );
  type BuildSnapshot = ConstructorParameters<typeof ProdBuildCache>[1];
  const snapshot = await import("../src/ui/_fresh/snapshot.js") as unknown as
    BuildSnapshot;
  setBuildCache(app, new ProdBuildCache(uiRootPath, snapshot), uiMode);
  freshHandler = app.handler();
} catch (err) {
  if (isDeployed) {
    console.warn(
      "Fresh build output is missing in Deno Deploy; UI routes are disabled.",
      err,
    );
    freshHandler = () =>
      new Response("Fresh build output is missing.", { status: 503 });
  } else {
    console.warn(
      "Fresh build output is missing. Falling back to in-memory build.",
      err,
    );
    const { Builder } = await import("@fresh/core/dev");
    const builder = new Builder({ root: uiRootUrl.toString() });
    const applySnapshot = await builder.build({
      snapshot: "memory",
      mode: uiMode,
    });
    applySnapshot(app);
    freshHandler = app.handler();
  }
}
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

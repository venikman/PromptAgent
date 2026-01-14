import { fromFileUrl } from "@std/path";
import { Builder } from "@fresh/core/dev";
import { app } from "../ui/app.ts";
import { env } from "../config.ts";
import { createApiHandler, type ApiConfig } from "./handler.ts";
import {
  normalizePath,
  recordHttpRequest,
  startTelemetryReporter,
} from "../telemetry.ts";

const DATA_ROOT = fromFileUrl(new URL("../../data", import.meta.url));
const PROMPTS_ROOT = fromFileUrl(new URL("../../prompts", import.meta.url));

const apiConfig: ApiConfig = {
  llmBaseUrl: env.LMSTUDIO_BASE_URL,
  llmApiKey: env.LMSTUDIO_API_KEY,
  llmModel: env.LMSTUDIO_MODEL,
  dataRoot: DATA_ROOT,
  promptsRoot: PROMPTS_ROOT,
};

const apiHandler = createApiHandler(apiConfig);

const uiRootUrl = new URL("../ui/", import.meta.url);
const builder = new Builder({ root: uiRootUrl.toString() });
const mode = Deno.env.get("FRESH_MODE") === "development"
  ? "development"
  : "production";
app.config.mode = mode;
const applySnapshot = await builder.build({ snapshot: "memory", mode });
applySnapshot(app);

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

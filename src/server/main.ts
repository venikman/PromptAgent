import { fromFileUrl, isAbsolute, join, relative, resolve } from "@std/path";
import { serveFile } from "@std/http/file-server";
import { env } from "../config.ts";
import { type ApiConfig, createApiHandler } from "./handler.ts";
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

const uiRootPath = fromFileUrl(new URL("../ui/dist", import.meta.url));
const uiIndexPath = join(uiRootPath, "index.html");
let uiAvailable = true;

try {
  const indexInfo = await Deno.stat(uiIndexPath);
  uiAvailable = indexInfo.isFile;
} catch {
  uiAvailable = false;
  console.warn("UI build output is missing. Run `deno task ui:build`.");
}

const serveUi = async (req: Request) => {
  if (!uiAvailable) {
    return new Response("UI build output is missing.", { status: 503 });
  }

  const url = new URL(req.url);
  const filePath = resolve(uiRootPath, `.${url.pathname}`);
  const relativePath = relative(uiRootPath, filePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const info = await Deno.stat(filePath);
    if (info.isFile) {
      return await serveFile(req, filePath);
    }
  } catch {
    // fall through to index.html
  }

  try {
    return await serveFile(req, uiIndexPath);
  } catch {
    return new Response("UI build output is missing.", { status: 503 });
  }
};
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
    const res = isApi ? await apiHandler(req) : await serveUi(req);
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

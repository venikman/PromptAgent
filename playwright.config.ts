import { defineConfig, devices } from "@playwright/test";
import { parse } from "@std/dotenv";

const readEnvFile = (): Record<string, string> => {
  try {
    const raw = Deno.readTextFileSync(".env");
    return parse(raw);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      return {};
    }
    throw e;
  }
};

const envFromFile = readEnvFile();
const getEnv = (key: string, fallback?: string) =>
  Deno.env.get(key) ?? envFromFile[key] ?? fallback ?? "";

const llmBaseUrl = getEnv("LLM_BASE_URL", "https://openrouter.ai/api/v1");
const llmApiKey = getEnv("LLM_API_KEY");
const llmModel = getEnv("LLM_MODEL", "openai/gpt-4o-mini");

// Warn when targeting a remote LLM provider without an API key
const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(llmBaseUrl);
if (!llmApiKey && !isLocalhost) {
  console.warn(
    `[playwright] LLM_API_KEY is empty while LLM_BASE_URL points to a remote provider (${llmBaseUrl}). ` +
    "LLM calls will likely fail with 401. Set LLM_API_KEY in .env or environment.",
  );
}
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: "list",
  outputDir: "test-results",
  use: {
    baseURL: "http://127.0.0.1:8000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "deno run -A src/server/main.ts",
    url: "http://127.0.0.1:8000",
    reuseExistingServer: !Deno.env.get("CI"),
    timeout: 120_000,
    env: {
      ...Deno.env.toObject(),
      LLM_BASE_URL: llmBaseUrl,
      LLM_API_KEY: llmApiKey,
      LLM_MODEL: llmModel,
      POLL_ENABLED: "false",
      EVAL_REPLICATES: "1",
      OPT_CONCURRENCY: "3",
      OPT_ITERATIONS: "1",
      OPT_PATCH_CANDIDATES: "1",
      EPICS_LIMIT: "1",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

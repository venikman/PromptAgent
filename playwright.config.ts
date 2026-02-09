import { defineConfig, devices } from "@playwright/test";

const readEnvFile = () => {
  try {
    const raw = Deno.readTextFileSync(".env");
    const entries: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      entries[key] = value;
    }
    return entries;
  } catch {
    return {};
  }
};

const envFromFile = readEnvFile();
const getEnv = (key: string, fallback?: string) =>
  Deno.env.get(key) ?? envFromFile[key] ?? fallback ?? "";

const llmBaseUrl = getEnv("LLM_BASE_URL", "https://openrouter.ai/api/v1");
const llmApiKey = getEnv("LLM_API_KEY");
const llmModel = getEnv("LLM_MODEL", "openai/gpt-4o-mini");

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

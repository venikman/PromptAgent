import process from "node:process";
import { defineConfig, devices } from "@playwright/test";

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
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      LMSTUDIO_BASE_URL: "http://127.0.0.1:1234/v1",
      LMSTUDIO_API_KEY: "lm-studio",
      LMSTUDIO_MODEL: "gpt-oss-120b",
      LMSTUDIO_JUDGE_MODEL: "gpt-oss-120b",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

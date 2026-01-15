import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const srcDir = path.join(rootDir, "src");

const apiPrefixes = [
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, "");
  const apiPort = Number.parseInt(
    env.PROMPTAGENT_API_PORT ?? env.VITE_API_PORT ?? "8000",
    10,
  );
  const apiOrigin = env.PROMPTAGENT_API_ORIGIN ??
    env.VITE_API_ORIGIN ??
    `http://localhost:${Number.isFinite(apiPort) ? apiPort : 8000}`;
  const proxy = Object.fromEntries(
    apiPrefixes.map((prefix) => [prefix, { target: apiOrigin }]),
  );

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": srcDir,
      },
    },
    server: {
      port: 5173,
      proxy,
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});

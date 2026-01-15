import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vite";
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

const proxy = Object.fromEntries(
  apiPrefixes.map((prefix) => [prefix, { target: "http://localhost:8000" }]),
);

export default defineConfig({
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
});

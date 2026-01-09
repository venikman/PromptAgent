import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: "/",
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    proxy: {
      "/health": "http://localhost:8000",
      "/epics": "http://localhost:8000",
      "/champion": "http://localhost:8000",
      "/generate": "http://localhost:8000",
      "/generate-story": "http://localhost:8000",
      "/evaluate": "http://localhost:8000",
      "/mine-pairs": "http://localhost:8000",
      "/generate-patches": "http://localhost:8000",
      "/run-tournament": "http://localhost:8000",
      "/tournament": "http://localhost:8000",
      // V2 endpoints
      "/v2": "http://localhost:8000",
      // V3 endpoints (streaming optimization)
      "/v3": "http://localhost:8000",
    },
  },
});

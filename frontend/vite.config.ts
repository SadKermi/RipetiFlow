import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The API runs on :8000 (make dev-backend). Same-origin /api in dev and in production (D-02):
// FastAPI serves the built SPA, so no CORS anywhere.
const API_TARGET = process.env.RF_API_TARGET ?? "http://localhost:8000";
const proxy = { "/api": { target: API_TARGET, changeOrigin: false } };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { port: 5173, strictPort: true, proxy },
  preview: { port: 4173, strictPort: true, proxy },
  build: { outDir: "dist", sourcemap: false },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    // A timezone far from Europe/Rome: dates must never depend on the machine's zone.
    env: { TZ: "Pacific/Kiritimati" },
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
  },
});

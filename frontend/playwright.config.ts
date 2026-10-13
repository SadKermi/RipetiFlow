import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against the real backend in demo mode (D-30) and the Vite dev server.
// Both servers are started here on dedicated ports, so a running `make dev-backend` /
// `make dev-frontend` is not disturbed. The database must exist (shim + migrations):
// `make e2e` creates a fresh one; with `npm run e2e` run `make db-reset` once first.
const API_PORT = Number(process.env.E2E_API_PORT ?? 8010);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5180);
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql://postgres@localhost:54329/ripetiflow";
const API_URL = `http://localhost:${String(API_PORT)}`;
const WEB_URL = `http://localhost:${String(WEB_PORT)}`;

// @playwright/test is pinned to the Chromium build installed in PLAYWRIGHT_BROWSERS_PATH; another
// browser binary can be forced with PLAYWRIGHT_CHROMIUM_EXECUTABLE.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: false, // one demo tutor, one database: tests share state
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: WEB_URL,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `uv run uvicorn app.main:create_app --factory --port ${String(API_PORT)}`,
      cwd: "../backend",
      url: `${API_URL}/api/health`,
      env: {
        APP_ENV: "development",
        DEV_AUTH: "1",
        DATABASE_URL,
        ASSISTANT_PROVIDER: "none",
        CALENDAR_WORKER_ENABLED: "0",
        PUBLIC_APP_URL: WEB_URL,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: `npm run dev -- --port ${String(WEB_PORT)} --strictPort`,
      url: WEB_URL,
      env: { RF_API_TARGET: API_URL },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});

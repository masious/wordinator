import { defineConfig, devices } from "@playwright/test";

// E2E_API_PORT and E2E_WEB_PORT let several checkouts (such as git worktrees) run browser tests side by side; each checkout keeps
// its own database under its own `.wrangler/e2e`.
const apiPort = Number(process.env.E2E_API_PORT) || 8788;
const webPort = Number(process.env.E2E_WEB_PORT) || 5174;

export default defineConfig({
  testDir: "./e2e",
  // Tests share one local worker and database, so each creates its own courses and tags its data with `uniqueTag`; tests that
  // read the viewer's own growing lists register their own account. E2E_WORKERS overrides the worker count.
  fullyParallel: true,
  workers: Number(process.env.E2E_WORKERS) || (process.env.CI ? 2 : 4),
  use: { baseURL: `http://127.0.0.1:${webPort}`, trace: "on-first-retry" },
  webServer: [
    {
      command: "pnpm exec tsx e2e/start-api.ts",
      url: `http://127.0.0.1:${apiPort}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `WORDINATOR_API_ORIGIN=http://127.0.0.1:${apiPort} pnpm exec vite --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    { name: "chromium", testIgnore: /mobile-.*\.spec\.ts/, use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "webkit", testIgnore: /mobile-.*\.spec\.ts/, use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chromium", testMatch: /mobile-.*\.spec\.ts/, use: { ...devices["Pixel 7"], channel: "chrome" } },
    { name: "mobile-narrow", testMatch: /mobile-.*\.spec\.ts/, use: { ...devices["Pixel 7"], channel: "chrome", viewport: { width: 360, height: 740 } } },
    { name: "mobile-webkit", testMatch: /mobile-.*\.spec\.ts/, use: { ...devices["iPhone 13"] } }
  ]
});

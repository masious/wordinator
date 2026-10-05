import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: "http://127.0.0.1:5174", trace: "on-first-retry" },
  webServer: [
    {
      command: "pnpm --dir ../.. --filter @wordinator/api exec wrangler dev --persist-to ../../.wrangler/e2e --port 8788",
      url: "http://127.0.0.1:8788/api/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "WORDINATOR_API_ORIGIN=http://127.0.0.1:8788 pnpm exec vite --host 127.0.0.1 --port 5174 --strictPort",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } }
  ]
});

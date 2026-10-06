import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5174", trace: "on-first-retry" },
  webServer: [
    {
      command: "pnpm exec tsx e2e/start-api.ts",
      url: "http://127.0.0.1:8788/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "WORDINATOR_API_ORIGIN=http://127.0.0.1:8788 pnpm exec vite --host 127.0.0.1 --port 5174 --strictPort",
      url: "http://127.0.0.1:5174",
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

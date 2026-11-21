import { defineConfig, devices } from "@playwright/test";
import { E2E, baseURL } from "./e2e/support/env";

// Needs dev infra up (npm run dev:infra) and infra/dev/.dev-credentials.local. See e2e/global-setup.ts.
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1, // one simulator account, one scratch database
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx vite --port ${E2E.webPort} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      API_PORT: String(E2E.apiPort),
      MAIN_ROUTE: E2E.mainRoute,
      VITE_API_BASE_URL: "/api",
      VITE_FF_CIMCMS: "true",
    },
  },
});

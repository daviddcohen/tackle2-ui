/* global process, require, module */
/**
 * Playwright specs for the agentic prototype (MOCK=stub), in ./e2e.
 * Upstream's end-to-end suite is Cypress (./cypress); these specs cover the
 * prototype's flows only.
 *
 *   npm run test:e2e:prototype
 *
 * starts the mock-backed dev server on port 9000 (or reuses one already
 * running there). To test another server, point PLAYWRIGHT_BASE_URL at it:
 *
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:7013 npm run test:e2e:prototype
 */
const { defineConfig, devices } = require("@playwright/test");

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.PW_BASE ??
  "http://localhost:9000";
const useExternalServer =
  process.env.PLAYWRIGHT_BASE_URL != null || process.env.PW_BASE != null;

module.exports = defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  expect: { timeout: 8000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  outputDir: "./test-results/playwright",
  use: {
    baseURL,
    headless: true,
    // Specs are written against a desktop layout (filter toolbars expanded).
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: useExternalServer
    ? undefined
    : {
        command:
          "MOCK=stub AUTH_REQUIRED=false npm run start:dev -w client -- --port 9000",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180000,
      },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});

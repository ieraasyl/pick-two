import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/journey",
  outputDir: "./test-results-journey",
  timeout: 60_000,
  workers: 2,
  use: { trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
});

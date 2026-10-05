import { defineConfig, devices } from "@playwright/test";

// Runs against a production build in fake-data mode: npm run build && npm run test:e2e
// (the build must NOT have NEXT_PUBLIC_DATA_LAYER set).
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "test-output/pw",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 3,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-output/e2e-results.json" }]],
  use: {
    baseURL: "http://localhost:3100",
    acceptDownloads: true,
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  },
  webServer: {
    command: "./node_modules/.bin/next start -p 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: "desktop", testIgnore: /\.phone\.spec\.ts$/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } },
    { name: "phone", testMatch: /\.phone\.spec\.ts$/, use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 } },
  ],
});

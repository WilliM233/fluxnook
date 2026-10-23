import { defineConfig, devices } from "@playwright/test";

// In CI the app is a production build (`npm run start`), built by its own
// step first; locally it is `npm run dev`, reused if already running.
const ci = !!process.env.CI;
// Chromium by default; PLAYWRIGHT_ALL_BROWSERS=1 adds Firefox and WebKit,
// which the nightly sets.
const allBrowsers = !!process.env.PLAYWRIGHT_ALL_BROWSERS;

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: ci,
  // A test that needs a retry is a finding, not a pass.
  retries: 0,
  // Three browsers on one local stack would interleave specs that change the
  // shared database (pg_graphql in the exposure test), so they take turns.
  workers: allBrowsers ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ...(allBrowsers
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"] } },
          { name: "webkit", use: { ...devices["Desktop Safari"] } },
        ]
      : []),
  ],
  webServer: {
    command: ci ? "npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !ci,
  },
});

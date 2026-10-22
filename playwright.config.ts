import { defineConfig, devices } from "@playwright/test";

// In CI the app is a production build (`npm run start`), built by its own
// step first; locally it is `npm run dev`, reused if already running.
const ci = !!process.env.CI;

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: ci,
  // A test that needs a retry is a finding, not a pass.
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: ci ? "npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !ci,
  },
});

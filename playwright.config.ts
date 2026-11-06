import { defineConfig, devices } from "@playwright/test";
import { COMICVINE_STUB_ORIGIN } from "./tests/e2e/harness/comicvine-stub";
import { OPENLIBRARY_STUB_ORIGIN } from "./tests/e2e/harness/openlibrary-stub";
import { TMDB_STUB_ORIGIN } from "./tests/e2e/harness/tmdb-stub";

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
  // Locally, two: `next dev` compiles each page on first hit, and ten workers
  // at once starved it on the dev box until every page load timed out (Ch 1.2).
  workers: allBrowsers ? 1 : ci ? undefined : 2,
  reporter: [["list"], ["html", { open: "never" }]],
  // The TMDB, Open Library and Comic Vine stubs (tests/stub/) for the whole
  // run; the app reaches them through webServer.env, which wins over
  // .env.local in Next.
  globalSetup: "./tests/e2e/global-setup.ts",
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
    env: {
      TMDB_API_KEY: "stub",
      TMDB_BASE_URL: `${TMDB_STUB_ORIGIN}/3`,
      TMDB_IMAGE_BASE_URL: `${TMDB_STUB_ORIGIN}/t/p`,
      OPENLIBRARY_BASE_URL: OPENLIBRARY_STUB_ORIGIN,
      OPENLIBRARY_COVERS_BASE_URL: OPENLIBRARY_STUB_ORIGIN,
      COMICVINE_API_KEY: "stub",
      COMICVINE_BASE_URL: `${COMICVINE_STUB_ORIGIN}/api`,
    },
  },
});

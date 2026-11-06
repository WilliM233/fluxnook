import { afterEach, describe, expect, it, vi } from "vitest";

// Rummage R11 (ch 0.3). Under CI the e2e suite runs a production server,
// refuses a stray test.only and never retries: a test that needs a retry is a
// finding. `retries: ci ? 2 : 0` to quiet a flaky test is the edit this
// catches.

async function loadConfig(ci: boolean) {
  vi.resetModules();
  vi.stubEnv("CI", ci ? "1" : "");
  return (await import("../../playwright.config")).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

// A cold import of the config pulls in @playwright/test; under a full run's
// worker pool on the dev box it outlasted vitest's 5 s on 3 of 5 runs.
describe("playwright.config.ts", { timeout: 20_000 }, () => {
  it("under CI: forbidOnly, no retries, npm run start, no server reuse", async () => {
    const config = await loadConfig(true);
    expect(config.forbidOnly).toBe(true);
    expect(config.retries).toBe(0);
    expect(config.webServer).toMatchObject({
      command: "npm run start",
      reuseExistingServer: false,
    });
  });

  it("locally: no retries, npm run dev, reused if already running", async () => {
    const config = await loadConfig(false);
    expect(config.forbidOnly).toBe(false);
    expect(config.retries).toBe(0);
    expect(config.webServer).toMatchObject({
      command: "npm run dev",
      reuseExistingServer: true,
    });
  });
});

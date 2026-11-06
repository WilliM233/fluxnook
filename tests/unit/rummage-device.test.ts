import { afterEach, describe, expect, it, vi } from "vitest";
import { DEVICE_DATA_NAME, DEVICE_USER_ID } from "../../device/db";

// The Raccoon's list for 2.1.1 (plan section 4b). Both of these are green today
// and turn red on the mutant the plan names: what a later chapter can do to a
// phone with one tidy edit.

describe("the device's identity", () => {
  // Either one changed is a wipe with no error: a renamed store opens empty, and
  // a new person's `listShelves` reads none of the old person's rows (A5).
  it("R10 the data name and the device person never move", () => {
    expect(DEVICE_DATA_NAME).toBe("idb://fluxnook");
    expect(DEVICE_USER_ID).toBe("00000000-0000-4000-8000-000000000001");
  });
});

async function loadConfig(ci: boolean) {
  vi.resetModules();
  vi.stubEnv("CI", ci ? "1" : "");
  return (await import("../../playwright.config")).default;
}

describe("playwright.config.ts", { timeout: 20_000 }, () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Ch 0.3's own R11 now pins only the app's entry. In CI a reused stub is a stale
  // build, the same reason the app's entry refuses one.
  it("R11 in CI every server is started fresh, the stub's too", async () => {
    const { webServer } = await loadConfig(true);
    const servers = [webServer].flat();

    expect(servers.map((server) => server?.url)).toContain(
      "http://localhost:4173",
    );
    for (const server of servers) {
      expect(server?.reuseExistingServer).toBe(false);
    }
  });
});

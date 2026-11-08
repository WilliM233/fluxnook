import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import viteConfig from "../../device/vite.config";

// What the shell ships around the device page (Ch 2.1.2). Read from the files
// themselves, so a hand edit to one can't leave the other behind.
const shell = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const policy: string = shell.app.security.csp;

function directive(name: string): string[] {
  const found = policy
    .split(";")
    .map((part) => part.trim().split(/\s+/))
    .find(([head]) => head === name);
  return found ? found.slice(1) : [];
}

describe("the shell's config", () => {
  it("the preview serves exactly the policy the shell injects", () => {
    expect(policy).toEqual(expect.any(String));
    expect(viteConfig.preview?.headers).toEqual({
      "Content-Security-Policy": policy,
    });
  });

  // An inline script is what a policy is there to stop; PGlite needs only the
  // wasm compile, which `'wasm-unsafe-eval'` allows on its own.
  it("the policy's script-src allows no inline script", () => {
    expect(directive("script-src")).toContain("'wasm-unsafe-eval'");
    expect(directive("script-src")).not.toContain("'unsafe-inline'");
  });

  // The identifier names the app's data on the phone and on Windows, and the
  // scheme is the origin the store is keyed by: either one moved is a phone
  // that opens empty with no error (A5). The scheme was decided on the probe's
  // table (plan section 5) and is written out, so a Tauri whose default moved
  // can't move the origin under a phone's rows.
  it("the identifier and the scheme never move", () => {
    expect(shell.identifier).toBe("app.fluxnook");
    const main = shell.app.windows.find(
      (window: { label?: string }) => window.label === "main",
    );
    expect(main).toHaveProperty("useHttpsScheme", false);
  });

  it("the shell ships the stub and the version the page prints", () => {
    expect(shell.version).toBe("../package.json");
    expect(shell.build.frontendDist).toBe("../device/dist");
  });
});

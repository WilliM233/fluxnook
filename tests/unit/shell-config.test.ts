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

  it("the shell ships the stub and the version the page prints", () => {
    expect(shell.version).toBe("../package.json");
    expect(shell.build.frontendDist).toBe("../device/dist");
  });
});

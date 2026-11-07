import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { versionCode } from "../../scripts/version-code.mjs";

// The apk's versionCode rises with every newer build, so Android refuses an older
// build over a newer one instead of letting it open a newer store (Ch 2.1.2, the
// Nookkeeper at plan review). The walk's P9 is the same rule on the phone.

describe("versionCode", () => {
  it("gives the worked values the plan states", () => {
    expect(versionCode("0.2.0-ch.1.1")).toBe(1_990_101);
    expect(versionCode("0.2.0-ch.1.2")).toBe(1_990_102);
    expect(versionCode("0.2.0")).toBe(2_000_000);
    expect(versionCode("0.2.1")).toBe(2_010_000);
    expect(versionCode("0.3.0-ch.1.1")).toBe(2_990_101);
    expect(versionCode("1.0.0")).toBe(100_000_000);
  });

  it("rises strictly through versions in release order", () => {
    const inOrder = [
      "0.2.0-ch.1.1",
      "0.2.0-ch.1.2",
      "0.2.0-ch.2.1",
      "0.2.0-ch.10.1",
      "0.2.0",
      "0.2.1",
      "0.3.0-ch.1.1",
      "0.3.0",
      "1.0.0",
    ];
    const codes = inOrder.map(versionCode);
    for (let i = 1; i < codes.length; i += 1) {
      expect(codes[i]).toBeGreaterThan(codes[i - 1]);
    }
  });

  it("refuses a shape outside the rule, in words", () => {
    expect(() => versionCode("0.2.0-rc.1")).toThrow(/neither/);
    expect(() => versionCode("0.2.0-ch.100.1")).toThrow(/chapter up to 99/);
    expect(() => versionCode("0.2.0-ch.1.0")).toThrow(/count from 1/);
    expect(() => versionCode("21.0.0")).toThrow(/major up to 20/);
  });

  it("stays under the 2100000000 Tauri and the Play Store allow", () => {
    expect(versionCode("20.99.99")).toBeLessThan(2_100_000_000);
  });

  it("gives package.json's own version a code", () => {
    const { version } = JSON.parse(readFileSync("package.json", "utf8"));
    expect(versionCode(version)).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import { starText } from "@/lib/journal/stars";

// The star text (Ch 1.6 A9): one decimal, a trailing .0 dropped.

describe("starText", () => {
  it("a half step keeps its half", () => {
    expect(starText(4.5)).toBe("★ 4.5");
    expect(starText(0.5)).toBe("★ 0.5");
  });

  it("a whole number drops the .0", () => {
    expect(starText(5)).toBe("★ 5");
    expect(starText(5.0)).toBe("★ 5");
    expect(starText(4)).toBe("★ 4");
  });

  it("a shelf's tenths print as given", () => {
    expect(starText(4.8)).toBe("★ 4.8");
    expect(starText(4.4)).toBe("★ 4.4");
  });
});

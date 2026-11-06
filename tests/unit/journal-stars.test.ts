import { describe, expect, it } from "vitest";
import { halfFor, meanStars, starText, stepStars } from "@/lib/journal/stars";

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

// The star control's arithmetic (A6): arrows a half step, a star's left half
// its half.

describe("stepStars", () => {
  it("from unrated, up is half a star and down stays unrated", () => {
    expect(stepStars(null, 1)).toBe(0.5);
    expect(stepStars(null, -1)).toBeNull();
  });

  it("stops at half a star and at five", () => {
    expect(stepStars(0.5, -1)).toBe(0.5);
    expect(stepStars(5, 1)).toBe(5);
  });

  it("moves a half step either way", () => {
    expect(stepStars(4, 1)).toBe(4.5);
    expect(stepStars(4.5, -1)).toBe(4);
  });
});

describe("halfFor", () => {
  it("the right half is the whole star, the left half its half", () => {
    expect(halfFor(4, "right")).toBe(4);
    expect(halfFor(5, "left")).toBe(4.5);
    expect(halfFor(1, "left")).toBe(0.5);
  });
});

describe("meanStars", () => {
  it("none rated is no mean", () => {
    expect(meanStars([])).toBeNull();
  });

  it("one work is its own stars", () => {
    expect(meanStars([4.5])).toBe(4.5);
    expect(meanStars([5])).toBe(5);
    expect(starText(meanStars([5]) as number)).toBe("★ 5");
  });

  it("4.75 rounds half up to 4.8", () => {
    expect(meanStars([4.5, 5])).toBe(4.8);
    expect(starText(meanStars([4.5, 5]) as number)).toBe("★ 4.8");
  });

  it("ten works summing 43.5 are 4.4, where toFixed reads 4.3 (census C2)", () => {
    const ten = [...Array(9).fill(4.5), 3];
    expect(ten.reduce((a, b) => a + b, 0)).toBe(43.5);
    expect((4.35).toFixed(1)).toBe("4.3");
    expect(meanStars(ten)).toBe(4.4);
  });

  it("a mean in thirds goes to the nearest tenth, up or down", () => {
    expect(meanStars([0.5, 0.5, 1])).toBe(0.7);
    expect(meanStars([4.5, 4.5, 3.5])).toBe(4.2);
    expect(meanStars([5, 4, 4])).toBe(4.3);
  });
});

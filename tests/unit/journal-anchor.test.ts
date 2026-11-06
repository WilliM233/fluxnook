import { describe, expect, it } from "vitest";
import { anchorKindLabel, anchorLabel } from "@/lib/journal/anchor";

// The anchor pill (Ch 1.6 A2): one formatter for every page that prints it.

describe("anchorLabel", () => {
  it("prints each kind with its value", () => {
    expect(anchorLabel("page", "112")).toBe("p. 112");
    expect(anchorLabel("chapter", "7")).toBe("Ch. 7");
    expect(anchorLabel("issue", "7")).toBe("#7");
  });

  it("an episode prints as typed", () => {
    expect(anchorLabel("episode", "S02E03")).toBe("S02E03");
    expect(anchorLabel("episode", "2x03")).toBe("2x03");
  });
});

describe("anchorKindLabel", () => {
  it("the select's word for each kind", () => {
    expect(anchorKindLabel("page")).toBe("Page");
    expect(anchorKindLabel("chapter")).toBe("Chapter");
    expect(anchorKindLabel("episode")).toBe("Episode");
    expect(anchorKindLabel("issue")).toBe("Issue");
  });
});

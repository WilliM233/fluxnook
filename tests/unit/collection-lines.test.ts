import { describe, expect, it } from "vitest";
import {
  copyLine,
  editionsHeading,
  ownedViaText,
  yoursViaText,
} from "@/lib/collection/lines";

// A5's and A6's words, as text.

describe("the via lines", () => {
  it("name the work and the format", () => {
    expect(ownedViaText("Ultimate Collection 1", "hardcover")).toBe(
      "Owned via Ultimate Collection 1 (Hardcover)",
    );
    expect(ownedViaText("A Trade", "tpb")).toBe(
      "Owned via A Trade (Trade paperback)",
    );
    expect(yoursViaText("All is Revealed", "hardcover")).toBe(
      "Yours via All is Revealed (Hardcover)",
    );
  });
});

describe("copyLine", () => {
  it("prints either part, both, or nothing", () => {
    expect(copyLine({ condition: "good", acquiredOn: "2019-03-12" })).toBe(
      "Good · since 12 March 2019",
    );
    expect(copyLine({ condition: "good", acquiredOn: null })).toBe("Good");
    expect(copyLine({ condition: null, acquiredOn: "2019-03-12" })).toBe(
      "since 12 March 2019",
    );
    expect(copyLine({ condition: null, acquiredOn: null })).toBe("");
  });
});

describe("editionsHeading", () => {
  it("counts the printings and the copies", () => {
    expect(editionsHeading(1, 0)).toBe("1 in the catalog · none yours");
    expect(editionsHeading(2, 2)).toBe("2 in the catalog · you hold 2");
    expect(editionsHeading(1, 3)).toBe("1 in the catalog · you hold 3");
  });

  it("has no line at no printing", () => {
    expect(editionsHeading(0, 0)).toBeNull();
  });
});

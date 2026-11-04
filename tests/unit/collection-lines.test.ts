import { describe, expect, it } from "vitest";
import {
  copyLine,
  editionsHeading,
  ownedViaText,
  removeSentence,
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

describe("removeSentence", () => {
  const KEEPS = "The printing stays in the catalog.";
  const said = (quoted: string) => `"${quoted}" goes with it. ${KEEPS}`;

  it("quotes the note's first line, or says only what stays", () => {
    expect(removeSentence("Sealed.\nNever opened.")).toBe(said("Sealed."));
    expect(removeSentence("Sealed.\r\nNever opened.")).toBe(said("Sealed."));
    expect(removeSentence("")).toBe(KEEPS);
  });

  it("leaves 80 characters whole", () => {
    expect(removeSentence("x".repeat(80))).toBe(said("x".repeat(80)));
  });

  it("cuts a longer first line at 80, with an ellipsis", () => {
    expect(removeSentence("x".repeat(81))).toBe(said(`${"x".repeat(80)}…`));
    expect(removeSentence("x".repeat(2_000))).toBe(said(`${"x".repeat(80)}…`));
  });

  it("measures the first line alone", () => {
    expect(removeSentence(`Short.\n${"x".repeat(100)}`)).toBe(said("Short."));
  });

  it("leaves no space before the ellipsis", () => {
    expect(removeSentence(`${"x".repeat(79)} ${"y".repeat(20)}`)).toBe(
      said(`${"x".repeat(79)}…`),
    );
  });

  it("never splits an emoji at the cut", () => {
    expect(removeSentence(`${"x".repeat(79)}${"📕".repeat(2)}`)).toBe(
      said(`${"x".repeat(79)}📕…`),
    );
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

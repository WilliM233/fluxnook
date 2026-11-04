import { describe, expect, it } from "vitest";
import {
  copyLine,
  editionsHeading,
  ownedViaText,
  removeSentence,
  seriesHolding,
  shelfMark,
  tickLabel,
  tileVia,
  untickSentence,
  yoursViaText,
} from "@/lib/collection/lines";

// A5's, A6's, A8's and A12's words, as text.

describe("tickLabel", () => {
  it("says what the box holds", () => {
    expect(tickLabel(0)).toBe("Owned");
    expect(tickLabel(1)).toBe("Owned · Floppy");
    expect(tickLabel(2)).toBe("Owned · 2 floppies");
  });
});

describe("tileVia", () => {
  it("reads also off a tick above it", () => {
    expect(tileVia("Ultimate Collection 1", false)).toBe(
      "via Ultimate Collection 1",
    );
    expect(tileVia("Ultimate Collection 1", true)).toBe(
      "also via Ultimate Collection 1",
    );
  });
});

describe("seriesHolding", () => {
  const via = (title: string) => ({ held: false, via: title });
  const held = { held: true, via: null };
  const neither = { held: false, via: null };

  it("counts held or via, and the via ones", () => {
    expect(seriesHolding([via("a"), via("a"), neither])).toBe(
      "· you hold 2, 2 of them via a collection",
    );
    expect(seriesHolding([via("a"), held])).toBe(
      "· you hold 2, 1 of them via a collection",
    );
  });

  it("counts an issue held and via once", () => {
    expect(seriesHolding([{ held: true, via: "a" }, neither])).toBe(
      "· you hold 1, 1 of them via a collection",
    );
  });

  it("has no via clause at none, and no line at no holding", () => {
    expect(seriesHolding([held, held, neither])).toBe("· you hold 2");
    expect(seriesHolding([neither])).toBeNull();
    expect(seriesHolding([])).toBeNull();
  });
});

describe("shelfMark", () => {
  it("prints what the work is, or nothing", () => {
    expect(shelfMark(true, null)).toBe("owned");
    expect(shelfMark(false, "X")).toBe("via X");
    expect(shelfMark(true, "X")).toBe("owned · via X");
    expect(shelfMark(false, null)).toBeNull();
  });
});

describe("untickSentence", () => {
  it("names what goes with the floppy, the note first", () => {
    expect(untickSentence({ note: "Signed." })).toBe("Its note goes with it.");
    expect(untickSentence({ note: "" })).toBe("Its condition goes with it.");
  });
});

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

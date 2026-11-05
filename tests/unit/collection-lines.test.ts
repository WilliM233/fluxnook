import { describe, expect, it } from "vitest";
import {
  backupsLine,
  collectionLede,
  copyLine,
  copyRowLine,
  copyThirdLine,
  editionsHeading,
  ownedViaText,
  removeSentence,
  seriesHolding,
  shelfMark,
  shoppingLabel,
  shoppingLede,
  tickLabel,
  tileVia,
  toFindLine,
  untickSentence,
  yoursViaText,
} from "@/lib/collection/lines";

// A5's, A6's, A8's, A10's, A11's and A12's words, as text.

describe("collectionLede", () => {
  it("reads A13's line on the fixture", () => {
    expect(collectionLede({ copies: 5, works: 5, via: 38 })).toBe(
      "5 copies of 5 works, newest first. 38 more works are yours through what they collect.",
    );
  });

  it("drops the second sentence at no via", () => {
    expect(collectionLede({ copies: 2, works: 2, via: 0 })).toBe(
      "2 copies of 2 works, newest first.",
    );
  });

  it("says how to start with no copies", () => {
    expect(collectionLede({ copies: 0, works: 0, via: 0 })).toBe(
      "Nothing held yet. Own a copy from a work's page, or tick a run on its series page.",
    );
  });

  it("keeps its singulars", () => {
    expect(collectionLede({ copies: 1, works: 1, via: 1 })).toBe(
      "1 copy of 1 work, newest first. 1 more work is yours through what they collect.",
    );
  });
});

describe("copyRowLine", () => {
  const blank = { contents: 0, publisher: null, released_on: null };

  it("a printing with contents says what it covers", () => {
    const work = { type: "comic", released_on: null, series: null };
    expect(
      copyRowLine({ ...blank, format: "hardcover", contents: 8, work }),
    ).toBe("Hardcover · covers 8 issues");
    expect(
      copyRowLine({ ...blank, format: "hardcover", contents: 1, work }),
    ).toBe("Hardcover · covers 1 issue");
  });

  it("a publisher and the printing's year, not the work's", () => {
    expect(
      copyRowLine({
        ...blank,
        format: "paperback",
        publisher: "Anchor Books",
        released_on: "2011-04-05",
        work: { type: "book", released_on: "1974-04-05", author: "King" },
      }),
    ).toBe("Paperback · Anchor Books · 2011");
  });

  it("a publisher with no date", () => {
    expect(
      copyRowLine({
        ...blank,
        format: "paperback",
        publisher: "Signet",
        work: { type: "book", released_on: "1974-04-05" },
      }),
    ).toBe("Paperback · Signet");
  });

  it("the work's own line with no publisher", () => {
    expect(
      copyRowLine({
        ...blank,
        format: "floppy",
        work: {
          type: "comic",
          released_on: "1984-05-01",
          series: "Teenage Mutant Ninja Turtles (Mirage) Vol. 1",
          number: 1,
        },
      }),
    ).toBe("Floppy · 1984 · Teenage Mutant Ninja Turtles (Mirage) Vol. 1 · #1");
    expect(
      copyRowLine({
        ...blank,
        format: "blu-ray",
        work: { type: "film", released_on: "1976-11-03" },
      }),
    ).toBe("Blu-ray · 1976");
  });

  it("the label alone when nothing else is known", () => {
    expect(
      copyRowLine({
        ...blank,
        format: "dvd",
        work: { type: "film", released_on: null },
      }),
    ).toBe("DVD");
  });
});

describe("copyThirdLine", () => {
  const none = { condition: null, acquiredOn: null, note: "" };

  it("all three parts", () => {
    expect(
      copyThirdLine({
        condition: "good",
        acquiredOn: "2019-03-12",
        note: "The one with the Sissy Spacek cover.",
      }),
    ).toBe("Good · since 12 March 2019 · The one with the Sissy Spacek cover.");
  });

  it("each alone", () => {
    expect(copyThirdLine({ ...none, condition: "fine" })).toBe("Fine");
    expect(copyThirdLine({ ...none, acquiredOn: "2019-03-12" })).toBe(
      "since 12 March 2019",
    );
    expect(copyThirdLine({ ...none, note: "The Arrow disc." })).toBe(
      "The Arrow disc.",
    );
  });

  it("no line at none", () => {
    expect(copyThirdLine(none)).toBeNull();
  });
});

describe("Shopping's words", () => {
  it("the lede", () => {
    expect(shoppingLede({ total: 314, shelves: 3 })).toBe(
      "314 works on your shelves you don't hold a copy of, by shelf. A work on two shelves is listed once, under the first.",
    );
    expect(shoppingLede({ total: 1, shelves: 3 })).toBe(
      "1 work on your shelves you don't hold a copy of, by shelf. A work on two shelves is listed once, under the first.",
    );
    expect(shoppingLede({ total: 0, shelves: 3 })).toBe(
      "Nothing to find. Every work on your shelves is yours.",
    );
    expect(shoppingLede({ total: 0, shelves: 0 })).toBe(
      "No shelves yet, so nothing to find.",
    );
  });

  it("the button, the heading and the backups", () => {
    expect(shoppingLabel(314)).toBe("Shopping · 314 to find");
    expect(toFindLine(242, 326)).toBe("242 of 326 to find");
    expect(backupsLine(47)).toBe(
      "47 backups left out: you'd buy what they're printed in.",
    );
    expect(backupsLine(1)).toBe(
      "1 backup left out: you'd buy what it's printed in.",
    );
    expect(backupsLine(0)).toBeNull();
  });
});

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

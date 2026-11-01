import { describe, expect, it } from "vitest";
import { countsLine, nookLine } from "@/lib/shelves/lines";

// The counts a card, the shelf page and a section heading print (A6, A7,
// census C4), and the nook's own line.

describe("countsLine", () => {
  it("every part when none is zero", () => {
    expect(countsLine({ works: 12, done: 5, skipped: 1, sections: 3 })).toBe(
      "12 works · 5 done · 1 skipped · 3 sections",
    );
  });

  it("the works always, the rest left out at zero", () => {
    expect(countsLine({ works: 0, done: 0, skipped: 0, sections: 0 })).toBe(
      "0 works",
    );
    expect(countsLine({ works: 326, done: 0, skipped: 0, sections: 14 })).toBe(
      "326 works · 14 sections",
    );
  });

  it("a section's line has no sections part", () => {
    expect(countsLine({ works: 4, done: 2, skipped: 1 })).toBe(
      "4 works · 2 done · 1 skipped",
    );
  });

  it("one work, one section", () => {
    expect(countsLine({ works: 1, done: 0, skipped: 0, sections: 1 })).toBe(
      "1 work · 1 section",
    );
  });
});

describe("nookLine", () => {
  it("shelves and works, done left out at zero", () => {
    expect(nookLine({ shelves: 3, works: 398, done: 0 })).toBe(
      "3 shelves · 398 works on them",
    );
  });

  it("every part", () => {
    expect(nookLine({ shelves: 5, works: 473, done: 5 })).toBe(
      "5 shelves · 473 works on them · 5 done",
    );
  });

  it("one empty shelf", () => {
    expect(nookLine({ shelves: 1, works: 0, done: 0 })).toBe("1 shelf");
  });

  it("no shelves: the empty sentence", () => {
    expect(nookLine({ shelves: 0, works: 0, done: 0 })).toBe(
      "No shelves yet. Make one and it stops being quiet.",
    );
  });
});

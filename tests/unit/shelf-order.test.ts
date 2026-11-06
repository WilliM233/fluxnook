import { describe, expect, it } from "vitest";
import {
  compactSections,
  displayOrder,
  type EntryRow,
  foldSection,
  isNumbered,
  moveEntry,
  moveSection,
  type Placed,
  renumber,
  type SectionRow,
} from "@/lib/shelves/order";

// A2's one rule, on lists in memory: 1..n across the shelf in display order,
// whatever the write.

const entry = (id: string, section: string | null, position: number) => ({
  id,
  section,
  position,
});

/** The ids in order with their section, the shape a shelf reads in. */
const read = (placed: Placed[]) =>
  placed.map((p) => `${p.position}:${p.id}${p.section ? `@${p.section}` : ""}`);

// Two sections numbered as the old loader wrote them, restarting in each.
const sections: SectionRow[] = [
  { id: "B", position: 2 },
  { id: "A", position: 1 },
];
const sectioned: EntryRow[] = [
  entry("b1", "B", 1),
  entry("a2", "A", 2),
  entry("a1", "A", 1),
  entry("b2", "B", 2),
  entry("a3", "A", 3),
];

describe("renumber", () => {
  it("flat only: 1, 5, 9 become 1, 2, 3 in that order", () => {
    const flat = [
      entry("z", null, 9),
      entry("x", null, 1),
      entry("y", null, 5),
    ];
    expect(read(renumber([], flat))).toEqual(["1:x", "2:y", "3:z"]);
  });

  it("sections only: restarting numbers become one count through the sections", () => {
    expect(read(renumber(sections, sectioned))).toEqual([
      "1:a1@A",
      "2:a2@A",
      "3:a3@A",
      "4:b1@B",
      "5:b2@B",
    ]);
  });

  it("unsectioned entries come before the first section", () => {
    const shelf = [...sectioned, entry("u", null, 100)];
    expect(read(renumber(sections, shelf))[0]).toBe("1:u");
  });

  it("is the identity on a shelf already numbered in display order", () => {
    const numbered = renumber(sections, sectioned);
    expect(renumber(sections, numbered)).toEqual(numbered);
  });

  it("refuses an entry in a section the shelf doesn't have", () => {
    expect(() => renumber(sections, [entry("x", "C", 1)])).toThrow(RangeError);
  });

  it("mutates none of its inputs", () => {
    const before = structuredClone({ sections, sectioned });
    renumber(sections, sectioned);
    moveEntry(sections, sectioned, { id: "b2", section: null, index: 0 });
    foldSection(sections, sectioned, "A");
    moveSection(sections, { id: "B", position: 1 });
    expect({ sections, sectioned }).toEqual(before);
  });
});

describe("moveEntry", () => {
  it("into an empty section: its only entry, the shelf still 1..n", () => {
    const withEmpty = [...sections, { id: "C", position: 3 }];
    const placed = moveEntry(withEmpty, sectioned, {
      id: "a1",
      section: "C",
      index: 0,
    });
    expect(read(placed)).toEqual([
      "1:a2@A",
      "2:a3@A",
      "3:b1@B",
      "4:b2@B",
      "5:a1@C",
    ]);
    expect(isNumbered(placed)).toBe(true);
  });

  it("above the first section at index 0: number 1, everything after shifts", () => {
    const placed = moveEntry(sections, sectioned, {
      id: "b2",
      section: null,
      index: 0,
    });
    expect(read(placed)).toEqual([
      "1:b2",
      "2:a1@A",
      "3:a2@A",
      "4:a3@A",
      "5:b1@B",
    ]);
  });

  it("an index past the end means last in that section", () => {
    const placed = moveEntry(sections, sectioned, {
      id: "a1",
      section: "A",
      index: 99,
    });
    expect(read(placed).slice(0, 3)).toEqual(["1:a2@A", "2:a3@A", "3:a1@A"]);
  });

  it("within a section, forward and back again", () => {
    const forward = moveEntry(sections, sectioned, {
      id: "a1",
      section: "A",
      index: 2,
    });
    expect(read(forward).slice(0, 3)).toEqual(["1:a2@A", "2:a3@A", "3:a1@A"]);
    const back = moveEntry(sections, forward, {
      id: "a1",
      section: "A",
      index: 0,
    });
    expect(back).toEqual(renumber(sections, sectioned));
  });

  it("across a section boundary, into the next section's head", () => {
    const placed = moveEntry(sections, sectioned, {
      id: "a3",
      section: "B",
      index: 0,
    });
    expect(read(placed)).toEqual([
      "1:a1@A",
      "2:a2@A",
      "3:a3@B",
      "4:b1@B",
      "5:b2@B",
    ]);
  });

  it("refuses an entry or a section the shelf doesn't have", () => {
    expect(() =>
      moveEntry(sections, sectioned, { id: "nope", section: "A", index: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      moveEntry(sections, sectioned, { id: "a1", section: "C", index: 0 }),
    ).toThrow(RangeError);
  });
});

describe("foldSection", () => {
  it("moves a section's entries after the unsectioned ones, in their own order", () => {
    const shelf = [entry("u2", null, 2), entry("u1", null, 1), ...sectioned];
    const placed = foldSection(sections, shelf, "A");
    expect(read(placed)).toEqual([
      "1:u1",
      "2:u2",
      "3:a1",
      "4:a2",
      "5:a3",
      "6:b1@B",
      "7:b2@B",
    ]);
  });

  it("on a shelf with no unsectioned entry, the folded ones are 1..k", () => {
    expect(read(foldSection(sections, sectioned, "B")).slice(0, 2)).toEqual([
      "1:b1",
      "2:b2",
    ]);
  });

  it("refuses a section the shelf doesn't have", () => {
    expect(() => foldSection(sections, sectioned, "C")).toThrow(RangeError);
  });
});

describe("moveSection", () => {
  it("a section to position 1: the sections renumber 1..m, then the entries follow", () => {
    const moved = moveSection(sections, { id: "B", position: 1 });
    expect(moved).toEqual([
      { id: "B", position: 1 },
      { id: "A", position: 2 },
    ]);
    expect(read(renumber(moved, sectioned))).toEqual([
      "1:b1@B",
      "2:b2@B",
      "3:a1@A",
      "4:a2@A",
      "5:a3@A",
    ]);
  });

  it("a position past the end means last", () => {
    expect(moveSection(sections, { id: "A", position: 9 })).toEqual([
      { id: "B", position: 1 },
      { id: "A", position: 2 },
    ]);
  });
});

describe("compactSections", () => {
  it("closes the gap a deleted section leaves, in their order", () => {
    expect(
      compactSections([
        { id: "C", position: 3 },
        { id: "A", position: 1 },
      ]),
    ).toEqual([
      { id: "A", position: 1 },
      { id: "C", position: 2 },
    ]);
  });
});

describe("displayOrder", () => {
  it("is renumber's order", () => {
    expect(displayOrder(sections, sectioned).map((e) => e.id)).toEqual(
      renumber(sections, sectioned).map((p) => p.id),
    );
  });
});

describe("isNumbered", () => {
  it("is true on 1..n in any order and on an empty shelf", () => {
    expect(isNumbered([{ position: 2 }, { position: 1 }])).toBe(true);
    expect(isNumbered([])).toBe(true);
  });

  it("is false on a repeat, a gap, a zero", () => {
    expect(isNumbered([{ position: 1 }, { position: 1 }])).toBe(false);
    expect(isNumbered([{ position: 1 }, { position: 3 }])).toBe(false);
    expect(isNumbered([{ position: 0 }, { position: 1 }])).toBe(false);
  });
});

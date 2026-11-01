import { describe, expect, it } from "vitest";
import {
  dragSequence,
  headingId,
  headingSection,
  moveInSequence,
  placeIn,
} from "@/lib/shelves/drop";

// A shelf: one work above the first section, A holding a1 and a2, B empty,
// C holding c1.
const sections = [{ id: "A" }, { id: "B" }, { id: "C" }];
const rows = [
  { id: "t1", section: null },
  { id: "a1", section: "A" },
  { id: "a2", section: "A" },
  { id: "c1", section: "C" },
];
const sequence = dragSequence(sections, rows);
const drop = (active: string, over: string) =>
  placeIn(moveInSequence(sequence, active, over), active);

describe("dragSequence", () => {
  it("is the works above the first section, then each heading and its works", () => {
    expect(sequence).toEqual([
      "t1",
      "heading:A",
      "a1",
      "a2",
      "heading:B",
      "heading:C",
      "c1",
    ]);
  });

  it("names its headings", () => {
    expect(headingId("A")).toBe("heading:A");
    expect(headingSection("heading:A")).toBe("A");
    expect(headingSection("a1")).toBeNull();
  });
});

describe("placeIn after a move", () => {
  it("leaves a work where it is when nothing moved", () => {
    expect(placeIn(sequence, "a2")).toEqual({ section: "A", index: 1 });
    expect(placeIn(sequence, "t1")).toEqual({ section: null, index: 0 });
  });

  it("one place down across a heading is the top of that section", () => {
    expect(drop("t1", "heading:A")).toEqual({ section: "A", index: 0 });
  });

  it("one place up across a heading is the end of the section above it", () => {
    expect(drop("c1", "heading:C")).toEqual({ section: "B", index: 0 });
    expect(drop("a1", "heading:A")).toEqual({ section: null, index: 1 });
  });

  it("an empty section is reached through its heading", () => {
    expect(drop("a2", "heading:B")).toEqual({ section: "B", index: 0 });
  });

  it("within a section, onto a neighbour, is that neighbour's place", () => {
    expect(drop("a1", "a2")).toEqual({ section: "A", index: 1 });
    expect(drop("a2", "a1")).toEqual({ section: "A", index: 0 });
  });

  it("a long way up lands above the first section", () => {
    expect(drop("c1", "t1")).toEqual({ section: null, index: 0 });
  });

  it("an id the sequence doesn't hold leaves it as it was", () => {
    expect(moveInSequence(sequence, "nope", "a1")).toBe(sequence);
    expect(() => placeIn(sequence, "nope")).toThrow(RangeError);
  });
});

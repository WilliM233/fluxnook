import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixture } from "@/fixtures/shape";

// A3's facts about the King list, so a builder change that still fits the
// shape can't quietly reorder, merge or rewrite the films.

const king = fixture.parse(
  JSON.parse(
    readFileSync(
      new URL("../../supabase/seed/fixtures/king-films.json", import.meta.url),
      "utf8",
    ),
  ),
);

describe("king-films.json", () => {
  it("holds 61 films", () => {
    expect(king.items).toHaveLength(61);
    expect(king.items.every((item) => item.type === "film")).toBe(true);
  });

  it("starts with Carrie, 1976", () => {
    expect(king.items[0]).toEqual({
      id: "letterboxd:20ZQ",
      providers: { letterboxd: "https://boxd.it/20ZQ" },
      source_note: "Novel: Carrie (1974)",
      title: "Carrie",
      type: "film",
      year: 1976,
    });
  });

  it("ends with The Running Man, 1987", () => {
    expect(king.items[60]).toMatchObject({
      id: "letterboxd:29q6",
      title: "The Running Man",
      year: 1987,
    });
  });

  it("keeps both lines of Chapelwaite's description", () => {
    expect(king.items[7].title).toBe("Chapelwaite");
    expect(king.items[7].source_note).toBe(
      "Novel: Salem's Lot (1975)\nShort Story: Jerusalem's Lot, Night Shift (1977)",
    );
  });

  it("keeps item 52's empty description", () => {
    expect(king.items[51].title).toBe("The Long Walk");
    expect(king.items[51].source_note).toBe("");
  });

  it("has the list as one shelf", () => {
    expect(king.shelves).toHaveLength(1);
    const [shelf] = king.shelves;
    expect(shelf.name).toBe("Stephen King Watch List");
    expect(shelf.date).toBe("2024-04-01");
    expect(shelf.url).toBe("https://boxd.it/upKRw");
    expect(
      shelf.description.startsWith(
        "Previously just a list of Night Shift adaptations.\n\n",
      ),
    ).toBe(true);
    expect(shelf.description.endsWith("publication order.")).toBe(true);
  });

  it("has 61 entries in list order, one per film", () => {
    const { entries } = king.shelves[0];
    expect(entries.map((entry) => entry.position)).toEqual(
      Array.from({ length: 61 }, (_, i) => i + 1),
    );
    expect(entries.map((entry) => entry.item)).toEqual(
      king.items.map((item) => item.id),
    );
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fixture } from "@/fixtures/shape";

// What king-books.json says about the King works (Ch 0.5 A3 to A6). The
// fresh-build test proves the file matches the raw notes; this one proves the
// notes were read the way the spec says.

const FIXTURES = fileURLToPath(
  new URL("../../supabase/seed/fixtures", import.meta.url),
);
const load = (name: string) =>
  fixture.parse(JSON.parse(readFileSync(join(FIXTURES, name), "utf8")));

const books = load("king-books.json");
const films = load("king-films.json");
const byId = new Map(books.items.map((item) => [item.id, item]));

function book(id: string) {
  const item = byId.get(id);
  if (item?.type !== "book") throw new Error(`${id} is not a book here`);
  return item;
}

const stories = books.items.filter(
  (item) => item.type === "book" && item.form === "story",
);
const ofType = (type: string) =>
  books.relations.filter((relation) => relation.type === type);

describe("king-books.json", () => {
  it("holds 27 books, none with a provider", () => {
    expect(books.items).toHaveLength(27);
    const forms: Record<string, number> = {};
    for (const item of books.items) {
      expect(item.type, item.id).toBe("book");
      expect(item.providers, item.id).toEqual({});
      if (item.type === "book") forms[item.form] = (forms[item.form] ?? 0) + 1;
    }
    expect(forms).toEqual({
      novel: 8,
      novella: 1,
      series: 1,
      story: 16,
      collection: 1,
    });
  });

  it("The Running Man is Richard Bachman's, everything else Stephen King's", () => {
    expect(book("manual:the-running-man-1981")).toMatchObject({
      author: "Richard Bachman",
      form: "novel",
    });
    const others = books.items.filter(
      (item) => item.id !== "manual:the-running-man-1981",
    );
    expect(others).toHaveLength(26);
    for (const { id } of others)
      expect(book(id).author, id).toBe("Stephen King");
  });

  it("keeps titles, years and ids as the notes have them", () => {
    expect(book("manual:carrie-1974")).toMatchObject({
      title: "Carrie",
      year: 1974,
    });
    expect(book("manual:quitters-inc-1977").title).toBe("Quitters, Inc");
    expect(book("manual:salems-lot-1975").title).toBe("Salem's Lot");
    expect(book("manual:i-am-the-doorway-1977").title).toBe("I am the Doorway");
    expect(book("manual:the-mist-1980").form).toBe("novella");
    expect(book("manual:the-dark-tower-1981").form).toBe("series");
    // Taken as is (Roadmap 2026-10-22), whatever the published dates.
    expect(book("manual:night-shift-1977").year).toBe(1977);
    expect(book("manual:firestarter-1979").year).toBe(1979);
    expect(book("manual:the-dark-tower-1981").year).toBe(1981);
    expect(book("manual:the-running-man-1981").year).toBe(1981);
  });

  it("Night Shift is a collection", () => {
    expect(book("manual:night-shift-1977")).toMatchObject({
      form: "collection",
      year: 1977,
      author: "Stephen King",
      source_note: "Short Story: Jerusalem's Lot, Night Shift (1977)",
    });
  });

  it("source_note is the first line that named the work", () => {
    expect(book("manual:carrie-1974").source_note).toBe("Novel: Carrie (1974)");
    expect(book("manual:children-of-the-corn-1977").source_note).toBe(
      "Short Story: Children of the Corn, Night Shift (1977)",
    );
    expect(book("manual:the-running-man-1981").source_note).toBe(
      "Bachman Novel: The Running Man (1981)",
    );
  });

  it("62 adaptation-of and 16 contained-in, nothing else", () => {
    expect(ofType("adaptation-of")).toHaveLength(62);
    expect(ofType("contained-in")).toHaveLength(16);
    expect(books.relations).toHaveLength(78);
    for (const { from, to } of ofType("adaptation-of")) {
      expect(from).toMatch(/^letterboxd:/);
      expect(to).toMatch(/^manual:/);
    }
    const distinct = new Set(
      books.relations.map(({ type, from, to }) => `${type} ${from} ${to}`),
    );
    expect(distinct.size).toBe(78);
  });

  it("one adaptation-of per note line", () => {
    const adapted = new Set(ofType("adaptation-of").map(({ from }) => from));
    for (const { id } of films.items) {
      if (id !== "letterboxd:mic8") expect(adapted.has(id), id).toBe(true);
    }
    const sources = (film: string) =>
      ofType("adaptation-of")
        .filter(({ from }) => from === film)
        .map(({ to }) => to);
    expect(sources("letterboxd:xQHw")).toEqual([
      "manual:salems-lot-1975",
      "manual:jerusalems-lot-1977",
    ]);
    expect(sources("letterboxd:1VYI")).toEqual([
      "manual:quitters-inc-1977",
      "manual:the-ledge-1977",
    ]);
    const corn = ofType("adaptation-of")
      .filter(({ to }) => to === "manual:children-of-the-corn-1977")
      .map(({ from }) => from);
    expect(corn).toHaveLength(12);
    expect(corn).toContain("letterboxd:1ViW");
  });

  it("every story is contained in Night Shift, once", () => {
    expect(stories).toHaveLength(16);
    for (const { id } of stories) {
      const parents = ofType("contained-in").filter(({ from }) => from === id);
      expect(
        parents.map(({ to }) => to),
        `${id} is contained in`,
      ).toEqual(["manual:night-shift-1977"]);
    }
    const storyIds = new Set(stories.map(({ id }) => id));
    for (const { from } of ofType("contained-in")) {
      expect(storyIds.has(from), from).toBe(true);
    }
  });

  it("records The Long Walk as a gap, not a relation", () => {
    expect(books.gaps).toEqual([
      { item: "letterboxd:mic8", reason: "no source note" },
    ]);
    expect(
      books.relations.some(
        ({ from, to }) =>
          from === "letterboxd:mic8" || to === "letterboxd:mic8",
      ),
    ).toBe(false);
  });

  it("has the publication-order shelf", () => {
    expect(books.shelves).toHaveLength(1);
    const [shelf] = books.shelves;
    expect(shelf).toMatchObject({
      name: "Stephen King, publication order",
      date: "2024-04-01",
      url: "https://boxd.it/upKRw",
    });
    // One sentence: a single full stop, at the end.
    expect(shelf.description.split(".")).toHaveLength(2);
    expect(shelf.description.endsWith(".")).toBe(true);
    expect((shelf.entries ?? []).map(({ position }) => position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    expect((shelf.entries ?? []).map(({ item }) => item)).toEqual([
      "manual:carrie-1974",
      "manual:salems-lot-1975",
      "manual:the-shining-1977",
      "manual:night-shift-1977",
      "manual:the-stand-1978",
      "manual:the-dead-zone-1979",
      "manual:firestarter-1979",
      "manual:the-mist-1980",
      "manual:cujo-1981",
      "manual:the-dark-tower-1981",
      "manual:the-running-man-1981",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import {
  groupShopping,
  parseType,
  type ShoppingEntry,
} from "@/lib/collection/shopping";

// A11's grouping and A10's chip, over a list.

const SHELVES = [
  { id: "s1", name: "First" },
  { id: "s2", name: "Second" },
  { id: "s3", name: "Third" },
];

function entry(
  shelfId: string,
  workId: string,
  over: Partial<ShoppingEntry> = {},
): ShoppingEntry {
  return {
    shelfId,
    section: null,
    work: {
      id: workId,
      title: workId,
      type: "book",
      form: "novel",
      cover_path: null,
      released_on: null,
    },
    printings: [],
    toFind: true,
    backup: false,
    backupHeld: false,
    ...over,
  };
}

const shelf = (result: ReturnType<typeof groupShopping>, id: string) => {
  const found = result.shelves.find((s) => s.id === id);
  if (!found) throw new Error(`no shelf ${id}`);
  return found;
};

const titles = (s: ReturnType<typeof shelf>) =>
  s.groups.flatMap((g) => g.rows.map((r) => r.work.id));

describe("groupShopping", () => {
  it("lists one work on two shelves once, under the first, with Also on", () => {
    const result = groupShopping(SHELVES, [
      entry("s1", "carrie"),
      entry("s2", "carrie"),
    ]);
    expect(result.total).toBe(1);
    expect(titles(shelf(result, "s1"))).toEqual(["carrie"]);
    expect(titles(shelf(result, "s2"))).toEqual([]);
    expect(shelf(result, "s1").groups[0].rows[0].alsoOn).toEqual(["Second"]);
  });

  it("names only later shelves in Also on, in the nook's order", () => {
    const result = groupShopping(SHELVES, [
      entry("s2", "carrie"),
      entry("s3", "carrie"),
      entry("s1", "other"),
    ]);
    expect(titles(shelf(result, "s2"))).toEqual(["carrie"]);
    expect(shelf(result, "s2").groups[0].rows[0].alsoOn).toEqual(["Third"]);

    const all = groupShopping(SHELVES, [
      entry("s1", "carrie"),
      entry("s2", "carrie"),
      entry("s3", "carrie"),
    ]);
    expect(shelf(all, "s1").groups[0].rows[0].alsoOn).toEqual([
      "Second",
      "Third",
    ]);
  });

  it("keeps a work in a later shelf's count, so the counts can sum past the total", () => {
    const result = groupShopping(SHELVES, [
      entry("s1", "carrie"),
      entry("s2", "carrie"),
      entry("s2", "it"),
    ]);
    expect(result.total).toBe(2);
    expect(shelf(result, "s1").toFind).toBe(1);
    expect(shelf(result, "s2").toFind).toBe(2);
  });

  it("leaves a backup out and counts it, and the shelf's works hold it", () => {
    const result = groupShopping(SHELVES, [
      entry("s1", "issue"),
      entry("s1", "story", { toFind: false, backup: true }),
    ]);
    const s1 = shelf(result, "s1");
    expect(titles(s1)).toEqual(["issue"]);
    expect(s1).toMatchObject({ toFind: 1, works: 2, backups: 1, note: null });
    expect(result.total).toBe(1);
  });

  it("leaves an owned work out, and the shelf's works hold it", () => {
    const result = groupShopping(SHELVES, [
      entry("s1", "held", { toFind: false }),
      entry("s1", "wanted"),
    ]);
    expect(titles(shelf(result, "s1"))).toEqual(["wanted"]);
    expect(shelf(result, "s1")).toMatchObject({ toFind: 1, works: 2 });
  });

  it("keeps a skipped entry: skipped is the shelf's reading word", () => {
    // `status` isn't an input: nothing here can drop a skipped entry.
    const result = groupShopping(SHELVES, [entry("s1", "skipped")]);
    expect(titles(shelf(result, "s1"))).toEqual(["skipped"]);
  });

  it("puts the unsectioned first, and a section's label only with rows", () => {
    const one = { id: "x1", name: "One" };
    const two = { id: "x2", name: "Two" };
    const result = groupShopping(SHELVES, [
      entry("s1", "a", { section: one }),
      entry("s1", "gone", { section: two, toFind: false }),
      entry("s1", "b"),
      entry("s1", "c", { section: one }),
    ]);
    expect(
      shelf(result, "s1").groups.map((g) => [
        g.section,
        g.rows.map((r) => r.work.id),
      ]),
    ).toEqual([
      [null, ["b"]],
      ["One", ["a", "c"]],
    ]);
  });

  it("says Everything here is yours at nothing to find and no backups", () => {
    const result = groupShopping(SHELVES, [
      entry("s1", "held", { toFind: false }),
    ]);
    expect(shelf(result, "s1").note).toBe("Everything here is yours.");
  });

  it("says nothing of the kind when backups are left out: they aren't all yours", () => {
    const result = groupShopping(SHELVES, [
      entry("s1", "story", { toFind: false, backup: true }),
    ]);
    expect(shelf(result, "s1")).toMatchObject({ note: null, backups: 1 });
  });

  it("says Everything here is yours when the only backup is held, and no buying line", async () => {
    const result = groupShopping(SHELVES, [
      entry("s1", "host", { toFind: false }),
      entry("s1", "story", { toFind: false, backup: true, backupHeld: true }),
    ]);
    expect(shelf(result, "s1")).toMatchObject({
      note: "Everything here is yours.",
      backups: 0,
      works: 2,
    });
  });

  it("keeps the whole count while a backup is still to buy", () => {
    const result = groupShopping(SHELVES, [
      entry("s1", "held", { toFind: false, backup: true, backupHeld: true }),
      entry("s1", "unheld", { toFind: false, backup: true }),
    ]);
    expect(shelf(result, "s1")).toMatchObject({ note: null, backups: 2 });
  });

  it("says Listed under when every row sits under an earlier shelf", () => {
    const result = groupShopping(SHELVES, [
      entry("s1", "carrie"),
      entry("s2", "carrie"),
    ]);
    expect(shelf(result, "s2").note).toBe("Listed under First.");
    expect(shelf(result, "s1").note).toBeNull();
  });

  it("says Nothing on this shelf yet with no works", () => {
    const result = groupShopping(SHELVES, []);
    expect(shelf(result, "s3").note).toBe("Nothing on this shelf yet.");
    expect(result.total).toBe(0);
  });

  it("keeps the shelves in the order it was given", () => {
    const result = groupShopping(SHELVES, [entry("s3", "x")]);
    expect(result.shelves.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });
});

describe("parseType", () => {
  it("reads no value as All", () => {
    expect(parseType(undefined)).toBe("all");
  });

  it("reads the four chips", () => {
    for (const type of ["book", "comic", "film", "tv"]) {
      expect(parseType(type)).toBe(type);
    }
  });

  it("refuses anything else, a repeated one included", () => {
    expect(parseType("game")).toBeNull();
    expect(parseType("")).toBeNull();
    expect(parseType("all")).toBeNull();
    expect(parseType(["book", "film"])).toBeNull();
  });
});

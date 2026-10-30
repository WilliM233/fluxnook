import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { workLine } from "@/lib/catalog/work-line";
import { addEntries, setEntryStatus } from "@/lib/shelves/entries";
import { loadNook } from "@/lib/shelves/nook-page";
import { createSection } from "@/lib/shelves/sections";
import { loadShelfPage } from "@/lib/shelves/shelf-page";
import { createShelf } from "@/lib/shelves/shelves";
import { itemFor, required, signUpWithFixtures } from "./harness";

// The two reads the pages make (A6, A7), on one account holding the fixtures.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
let user: { email: string; id: string };
const shelf = { tmnt: "", watch: "", books: "" };

// A fixture load waits its turn behind every other file's (the loader's lock).
beforeAll(async () => {
  user = await signUpWithFixtures(sql);
  const rows = await sql`select id, name from shelves where owner = ${user.id}`;
  const named = (name: string) => rows.find((r) => r.name === name)?.id;
  shelf.tmnt = named("TMNT, the Mirage run");
  shelf.watch = named("Stephen King Watch List");
  shelf.books = named("Stephen King, publication order");
}, 60_000);

afterAll(async () => {
  await sql`delete from shelves where owner = ${user.id}`;
  await close();
  await sql.end();
});

describe("loadNook", () => {
  it("lists the three in the order TMNT, Watch List, publication order with their counts and a five-slot strip each", async () => {
    const nook = await loadNook(db, user.id);
    expect(
      nook.shelves.map((s) => [
        s.name,
        s.works,
        s.sections,
        s.done,
        s.skipped,
        s.sourceUrl !== null,
      ]),
    ).toEqual([
      ["TMNT, the Mirage run", 326, 14, 0, 0, false],
      ["Stephen King Watch List", 61, 0, 0, 0, true],
      ["Stephen King, publication order", 11, 0, 0, 0, true],
    ]);
    // Five slots each; whether a slot holds a cover isn't asserted, since
    // the catalog is shared and the Comic Vine files attach covers to the
    // fixture's comics while this runs. The Browse sees the dashed boxes.
    for (const s of nook.shelves) expect(s.covers).toHaveLength(5);
    expect(nook.shelves[0].covers[0].type).toBe("comic");
    expect(nook.shelves[1].covers[0].type).toBe("film");
    expect(nook.totals).toEqual({ shelves: 3, works: 398, done: 0 });
  });

  it("a write to the Watch List brings it first", async () => {
    const [first] = await sql`
      select id from shelf_entries where shelf = ${shelf.watch} and position = 1`;
    await setEntryStatus(db, {
      shelfId: shelf.watch,
      userId: user.id,
      entryId: first.id,
      status: "done",
    });
    const nook = await loadNook(db, user.id);
    expect(nook.shelves[0]).toMatchObject({
      name: "Stephen King Watch List",
      done: 1,
    });
    expect(nook.totals.done).toBe(1);
    await setEntryStatus(db, {
      shelfId: shelf.watch,
      userId: user.id,
      entryId: first.id,
      status: "unmarked",
    });
  });

  it("a nook with no shelves is empty with totals 0", async () => {
    expect(await loadNook(db, crypto.randomUUID())).toEqual({
      shelves: [],
      totals: { shelves: 0, works: 0, done: 0 },
    });
  });
});

describe("loadShelfPage", () => {
  it("the TMNT shelf: 14 sections in file order, 326 rows numbered through, no unsectioned row", async () => {
    const page = await loadShelfPage(db, { id: shelf.tmnt, userId: user.id });
    if (!page) throw new Error("no page");
    expect(page.shelf.name).toBe("TMNT, the Mirage run");
    expect(page.counts).toEqual({
      works: 326,
      done: 0,
      skipped: 0,
      sections: 14,
    });
    expect(page.unsectioned).toEqual([]);
    expect(page.sections).toHaveLength(14);
    const [main] = page.sections;
    expect(main).toMatchObject({
      name: "Volume 1 · Main Series",
      works: 62,
      position: 1,
    });
    expect(main.rows.map((r) => r.position)).toEqual(
      Array.from({ length: 62 }, (_, i) => i + 1),
    );
    const last = page.sections.at(-1);
    expect(last?.name).toBe("Volume 4 · Movie tie-ins");
    expect(last?.rows.at(-1)?.position).toBe(326);

    const first = main.rows[0];
    expect(first.item.id).toBe(
      await itemFor(sql, "manual", "tmnt-mirage-v1-1"),
    );
    expect(first.item.title).toBe("The Turtles' Origin is Told");
    expect(workLine(first.item)).toBe(
      "1984 · Teenage Mutant Ninja Turtles (Mirage) Vol. 1 · #1",
    );
  });

  it("the Watch List: 61 unsectioned rows, no section, Carrie (1976)'s line its year alone", async () => {
    const page = await loadShelfPage(db, { id: shelf.watch, userId: user.id });
    if (!page) throw new Error("no page");
    expect(page.sections).toEqual([]);
    expect(page.unsectioned).toHaveLength(61);
    const carrie = await itemFor(sql, "letterboxd", "20ZQ");
    const row = page.unsectioned.find((r) => r.item.id === carrie);
    expect(row?.item.runtime_minutes).toBeNull();
    expect(row && workLine(row.item)).toBe("1976");
  });

  it("the publication-order shelf's first row is a book with its form and author", async () => {
    const page = await loadShelfPage(db, { id: shelf.books, userId: user.id });
    const [first] = page?.unsectioned ?? [];
    expect(first.item).toMatchObject({ type: "book", title: "Carrie" });
    expect(workLine(first.item)).toBe("1974 · Novel · Stephen King");
  });

  it("a shelf with an unsectioned work and a section reads the unsectioned first, the section's counts its own", async () => {
    const { id } = await createShelf(db, {
      userId: user.id,
      name: "Mixed",
      description: "",
    });
    const key = { shelfId: id, userId: user.id };
    const { id: s } = await createSection(db, { ...key, name: "Carrie" });
    const films = (
      await sql`select item from shelf_entries where shelf = ${shelf.watch}
        order by position limit 3`
    ).map((r) => r.item as string);
    await addEntries(db, { ...key, items: films.slice(1), section: s });
    await addEntries(db, { ...key, items: [films[0]] });
    const page = await loadShelfPage(db, { id, userId: user.id });
    expect(page?.unsectioned.map((r) => [r.item.id, r.position])).toEqual([
      [films[0], 1],
    ]);
    expect(page?.sections[0]).toMatchObject({ name: "Carrie", works: 2 });
    expect(page?.sections[0].rows.map((r) => r.position)).toEqual([2, 3]);
    expect(page?.counts).toEqual({
      works: 3,
      done: 0,
      skipped: 0,
      sections: 1,
    });
  });

  it("is null for a uuid that is no shelf, and for the caller's shelf under another owner id", async () => {
    expect(
      await loadShelfPage(db, { id: crypto.randomUUID(), userId: user.id }),
    ).toBeNull();
    expect(
      await loadShelfPage(db, { id: shelf.tmnt, userId: crypto.randomUUID() }),
    ).toBeNull();
  });
});

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb } from "@/db/client";
import { normalizeName } from "@/lib/catalog/normalize";
import { loadPickerWorks, matchesFind } from "@/lib/catalog/picker-works";
import { workLine } from "@/lib/catalog/work-line";
import { addEntries, setEntryStatus } from "@/lib/shelves/entries";
import { listShelves, type ShelfListed } from "@/lib/shelves/list";
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

  it("is one statement, so its sections and rows share one snapshot", async () => {
    const execute = vi.spyOn(db, "execute");
    try {
      await loadShelfPage(db, { id: shelf.tmnt, userId: user.id });
      expect(execute).toHaveBeenCalledTimes(1);
    } finally {
      execute.mockRestore();
    }
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

describe("loadPickerWorks", () => {
  // The catalog is shared with every other db file, so what's asserted is
  // the fixture's own rows: one load wrote them, so they share a created_at.
  async function loaded() {
    const carrie = await itemFor(sql, "manual", "carrie-1974");
    const rows = await sql`select id from items where created_at =
      (select created_at from items where id = ${carrie})`;
    return { carrie, ids: new Set(rows.map((r) => r.id as string)) };
  }

  it("lists the loaded catalog in year order, and the fold finds the Browse's rows in that order", async () => {
    const { ids } = await loaded();
    expect(ids.size).toBe(454);
    const works = (await loadPickerWorks(db)).filter((w) => ids.has(w.id));
    expect(works).toHaveLength(454);
    const years = works.map((w) => w.released_on ?? "9999");
    expect(years).toEqual([...years].sort());

    const found = (box: string) =>
      works
        .filter((w) => matchesFind(w, normalizeName(box)))
        .map((w) => `${w.title} ${w.released_on?.slice(0, 4)}`);
    expect(found("carrie")).toEqual([
      "Carrie 1974",
      "Carrie 1976",
      "The Rage: Carrie 2 1999",
      "Carrie 2002",
      "Carrie 2013",
    ]);
    expect(found("salem")).toEqual([
      "Salem's Lot 1975",
      "Jerusalem's Lot 1977",
      "Salem's Lot 1979",
      "A Return to Salem's Lot 1987",
      "Salem's Lot 2004",
      "Salem's Lot 2024",
    ]);
    expect(found("the shining")).toEqual([
      "The Shining 1977",
      "The Shining 1980",
      "The Shining 1997",
    ]);
    expect(found("night shift")).toEqual(["Night Shift 1977"]);
  });

  it("puts a work made after the load before the loaded ones", async () => {
    const { carrie } = await loaded();
    const [{ id }] = await sql`
      insert into items (type, title, source_note)
      values ('film', 'Picker probe', 'shelf-pages picker probe') returning id`;
    try {
      const works = await loadPickerWorks(db);
      const probe = works.findIndex((w) => w.id === id);
      expect(probe).toBeGreaterThanOrEqual(0);
      expect(probe).toBeLessThan(works.findIndex((w) => w.id === carrie));
    } finally {
      await sql`delete from items where id = ${id}`;
    }
  });
});

// The tests above write to this account (a "Mixed" shelf, a status on the
// Watch List), so the order is asserted as the nook's own and the fixture
// shelves are read by id, not by place.
describe("listShelves", () => {
  const fixtures = (listed: ShelfListed[]) =>
    [shelf.tmnt, shelf.watch, shelf.books].map((id) => {
      const s = listed.find((x) => x.id === id);
      if (!s) throw new Error(`no shelf ${id}`);
      return s;
    });

  it("lists the caller's shelves in the nook's order", async () => {
    const listed = await listShelves(db, { userId: user.id, items: [] });
    const nook = await loadNook(db, user.id);
    expect(listed.map((s) => s.id)).toEqual(nook.shelves.map((s) => s.id));
  });

  it("the fixture shelves with their counts and sections, has 0 with nothing asked", async () => {
    const listed = await listShelves(db, { userId: user.id, items: [] });
    expect(
      fixtures(listed).map((s) => [s.name, s.count, s.sections.length, s.has]),
    ).toEqual([
      ["TMNT, the Mirage run", 326, 14, 0],
      ["Stephen King Watch List", 61, 0, 0],
      ["Stephen King, publication order", 11, 0, 0],
    ]);
    expect(listed.every((s) => s.has === 0)).toBe(true);
  });

  it("the TMNT shelf's sections are its fourteen in position order", async () => {
    const [tmnt] = fixtures(
      await listShelves(db, { userId: user.id, items: [] }),
    );
    expect(tmnt.sections[0].name).toBe("Volume 1 · Main Series");
    expect(tmnt.sections.at(-1)?.name).toBe("Volume 4 · Movie tie-ins");
    const ids = await sql`
      select id from shelf_sections where shelf = ${shelf.tmnt} order by position`;
    expect(tmnt.sections.map((x) => x.id)).toEqual(ids.map((r) => r.id));
  });

  it("has for Carrie (1976) is 1 on the Watch List and 0 elsewhere", async () => {
    const carrie = await itemFor(sql, "letterboxd", "20ZQ");
    const listed = await listShelves(db, { userId: user.id, items: [carrie] });
    expect(fixtures(listed).map((s) => s.has)).toEqual([0, 1, 0]);
  });

  it("has for the 62 Mirage Vol. 1 issues is 62 on the TMNT shelf and 0 elsewhere", async () => {
    const run = await sql`
      select item from item_sources where source = 'manual'
        and key in ${sql(Array.from({ length: 62 }, (_, i) => `tmnt-mirage-v1-${i + 1}`))}`;
    expect(run).toHaveLength(62);
    const listed = await listShelves(db, {
      userId: user.id,
      items: run.map((r) => r.item),
    });
    expect(fixtures(listed).map((s) => s.has)).toEqual([62, 0, 0]);
  });

  it("lists nothing for someone with no shelves", async () => {
    expect(
      await listShelves(db, { userId: crypto.randomUUID(), items: [] }),
    ).toEqual([]);
  });

  it("puts the shelf just written first (C1)", async () => {
    const [first] = await sql`
      select id from shelf_entries where shelf = ${shelf.books} and position = 1`;
    const key = { shelfId: shelf.books, userId: user.id, entryId: first.id };
    await setEntryStatus(db, { ...key, status: "done" });
    try {
      const [top] = await listShelves(db, { userId: user.id, items: [] });
      expect(top.name).toBe("Stephen King, publication order");
    } finally {
      await setEntryStatus(db, { ...key, status: "unmarked" });
    }
  });
});

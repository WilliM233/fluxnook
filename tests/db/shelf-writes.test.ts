import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { fixture } from "@/fixtures/shape";
import { ConflictError, NotFoundError } from "@/lib/catalog/import";
import {
  addEntries,
  BadItems,
  moveEntry,
  removeEntry,
  setEntryStatus,
} from "@/lib/shelves/entries";
import { isNumbered } from "@/lib/shelves/order";
import {
  createSection,
  deleteSection,
  updateSection,
} from "@/lib/shelves/sections";
import { createShelf, deleteShelf, updateShelf } from "@/lib/shelves/shelves";
import { required, signUpWithFixtures } from "./harness";

// The shelf writes on one account holding the fixtures (Ch 1.5.1): every
// write as the lib makes it, every refusal leaving the rows as they were, and
// A2's invariant read back after each. The TMNT shelf's delete is last, since
// the section and entry tests use it whole.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
const stranger = crypto.randomUUID();
const tag = `shelf-writes ${crypto.randomUUID()}`;

const fixtureItems = readdirSync("supabase/seed/fixtures")
  .filter((name) => name.endsWith(".json"))
  .flatMap(
    (name) =>
      fixture.parse(
        JSON.parse(
          readFileSync(path.join("supabase/seed/fixtures", name), "utf8"),
        ),
      ).items,
  )
  .map((item) => item.id);

let user: { email: string; id: string };
const shelf = { tmnt: "", watch: "", books: "" };

/** A2's invariant on the shelf as stored: positions exactly 1..n. */
async function numbered(shelfId: string) {
  const rows = await sql<{ position: number }[]>`
    select position from shelf_entries where shelf = ${shelfId}`;
  expect(isNumbered(rows)).toBe(true);
}

const count = async (table: "shelf_sections" | "shelf_entries", id: string) =>
  (
    await sql`select count(*)::int as n from ${sql(table)} where shelf = ${id}`
  )[0].n as number;

const updatedAt = async (id: string) =>
  (await sql`select updated_at from shelves where id = ${id}`)[0]
    .updated_at as Date;

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
  await sql`delete from items where source_note = ${tag}`;
  await close();
  await sql.end();
});

describe("createShelf and updateShelf", () => {
  it("createShelf makes a private shelf of the caller's with an empty description and no rows", async () => {
    const { id } = await createShelf(db, {
      userId: user.id,
      name: "Scratch",
      description: "",
    });
    const [row] = await sql`
      select owner, name, description, source_url, visibility from shelves where id = ${id}`;
    expect(row).toEqual({
      owner: user.id,
      name: "Scratch",
      description: "",
      source_url: null,
      visibility: "private",
    });
    expect(await count("shelf_sections", id)).toBe(0);
    expect(await count("shelf_entries", id)).toBe(0);
  });

  it("updateShelf renames, keeps the description, and touches updated_at", async () => {
    const before = await updatedAt(shelf.books);
    const row = await updateShelf(db, {
      shelfId: shelf.books,
      userId: user.id,
      name: "Stephen King, by year",
    });
    expect(row).toMatchObject({
      id: shelf.books,
      name: "Stephen King, by year",
    });
    expect(row.description).not.toBe("");
    expect((await updatedAt(shelf.books)).getTime()).toBeGreaterThan(
      before.getTime(),
    );
    await updateShelf(db, {
      shelfId: shelf.books,
      userId: user.id,
      name: "Stephen King, publication order",
    });
    await numbered(shelf.books);
  });

  it("updateShelf on a shelf that isn't the caller's is NotFoundError and the name unchanged", async () => {
    await expect(
      updateShelf(db, { shelfId: shelf.watch, userId: stranger, name: "Mine" }),
    ).rejects.toThrow(NotFoundError);
    const [{ name }] =
      await sql`select name from shelves where id = ${shelf.watch}`;
    expect(name).toBe("Stephen King Watch List");
  });

  it("updateShelf on a uuid that is no shelf is NotFoundError", async () => {
    await expect(
      updateShelf(db, {
        shelfId: crypto.randomUUID(),
        userId: user.id,
        name: "x",
      }),
    ).rejects.toThrow(NotFoundError);
  });
});

const sectionsOf = (shelfId: string) =>
  sql<{ id: string; name: string; position: number }[]>`
    select id, name, position from shelf_sections
    where shelf = ${shelfId} order by position`;

const entriesOf = (shelfId: string) =>
  sql<{ id: string; section: string | null; position: number }[]>`
    select id, section, position from shelf_entries
    where shelf = ${shelfId} order by position`;

const sectionNamed = async (shelfId: string, name: string) =>
  (
    await sql`select id from shelf_sections where shelf = ${shelfId} and name = ${name}`
  )[0].id as string;

describe("sections", () => {
  it("createSection appends at 15 and the entries stay 1..326; deleting it, empty, leaves 14", async () => {
    const { id } = await createSection(db, {
      shelfId: shelf.tmnt,
      userId: user.id,
      name: "Scratch",
    });
    const sections = await sectionsOf(shelf.tmnt);
    expect(sections.at(-1)).toEqual({ id, name: "Scratch", position: 15 });
    await numbered(shelf.tmnt);

    await deleteSection(db, {
      shelfId: shelf.tmnt,
      userId: user.id,
      sectionId: id,
    });
    expect(await count("shelf_sections", shelf.tmnt)).toBe(14);
    expect(await count("shelf_entries", shelf.tmnt)).toBe(326);
    await numbered(shelf.tmnt);
  });

  it("a section named as one the shelf has is ConflictError naming it, and the count stays 14", async () => {
    await expect(
      createSection(db, {
        shelfId: shelf.tmnt,
        userId: user.id,
        name: "Volume 1 · Main Series",
      }),
    ).rejects.toThrow(
      new ConflictError(
        "The shelf already has a section named Volume 1 · Main Series.",
      ),
    );
    expect(await count("shelf_sections", shelf.tmnt)).toBe(14);
  });

  it("the same name on another of the caller's shelves is fine", async () => {
    const { id } = await createSection(db, {
      shelfId: shelf.watch,
      userId: user.id,
      name: "Volume 1 · Main Series",
    });
    expect(await count("shelf_sections", shelf.watch)).toBe(1);
    await deleteSection(db, {
      shelfId: shelf.watch,
      userId: user.id,
      sectionId: id,
    });
    expect(await count("shelf_entries", shelf.watch)).toBe(61);
    await numbered(shelf.watch);
  });

  it("rename keeps the position; renaming onto a sibling's name is ConflictError", async () => {
    const tieIns = await sectionNamed(shelf.tmnt, "Volume 4 · Movie tie-ins");
    const key = { shelfId: shelf.tmnt, userId: user.id, sectionId: tieIns };
    expect(await updateSection(db, { ...key, name: "Movie tie-ins" })).toEqual({
      id: tieIns,
      name: "Movie tie-ins",
      position: 14,
    });
    await expect(
      updateSection(db, { ...key, name: "Volume 1 · Main Series" }),
    ).rejects.toThrow(ConflictError);
    await updateSection(db, { ...key, name: "Volume 4 · Movie tie-ins" });
    expect((await sectionsOf(shelf.tmnt))[13].name).toBe(
      "Volume 4 · Movie tie-ins",
    );
  });

  it("the renumbering made to throw mid-transaction leaves every entry in its section, 14 sections, 326 at 1..326", async () => {
    const before = await entriesOf(shelf.tmnt);
    const micro = await sectionNamed(shelf.tmnt, "Volume 1 · Micro Series");
    await expect(
      deleteSection(
        db,
        { shelfId: shelf.tmnt, userId: user.id, sectionId: micro },
        {
          renumber: () => {
            throw new Error("mid");
          },
        },
      ),
    ).rejects.toThrow("mid");
    expect(await count("shelf_sections", shelf.tmnt)).toBe(14);
    expect(await entriesOf(shelf.tmnt)).toEqual(before);
    expect(before.filter((e) => e.section === null)).toHaveLength(0);
    await numbered(shelf.tmnt);
  });

  it("a section moved to 1 takes its 9 entries to 1..9, everything else after; moved back, the shelf is as it was", async () => {
    const before = await entriesOf(shelf.tmnt);
    const tieIns = await sectionNamed(shelf.tmnt, "Volume 4 · Movie tie-ins");
    const key = { shelfId: shelf.tmnt, userId: user.id, sectionId: tieIns };

    expect(await updateSection(db, { ...key, position: 1 })).toMatchObject({
      position: 1,
    });
    const sections = await sectionsOf(shelf.tmnt);
    expect(sections.map((s) => s.position)).toEqual(
      Array.from({ length: 14 }, (_, i) => i + 1),
    );
    expect(sections[1].name).toBe("Volume 1 · Main Series");
    const moved = await entriesOf(shelf.tmnt);
    expect(moved.slice(0, 9).every((e) => e.section === tieIns)).toBe(true);
    expect(moved).toHaveLength(326);
    await numbered(shelf.tmnt);

    await updateSection(db, { ...key, position: 14 });
    expect(await entriesOf(shelf.tmnt)).toEqual(before);
  });

  it("deleting 'Volume 1 · Micro Series' moves its five above the first section at 1..5 in their own order; the Main Series reads 6..67", async () => {
    const micro = await sectionNamed(shelf.tmnt, "Volume 1 · Micro Series");
    const main = await sectionNamed(shelf.tmnt, "Volume 1 · Main Series");
    const before = await entriesOf(shelf.tmnt);
    const five = before.filter((e) => e.section === micro).map((e) => e.id);
    expect(five).toHaveLength(5);

    await deleteSection(db, {
      shelfId: shelf.tmnt,
      userId: user.id,
      sectionId: micro,
    });

    const after = await entriesOf(shelf.tmnt);
    expect(after.slice(0, 5)).toEqual(
      five.map((id, i) => ({ id, section: null, position: i + 1 })),
    );
    const mains = after.filter((e) => e.section === main);
    expect(mains.map((e) => e.position)).toEqual(
      Array.from({ length: 62 }, (_, i) => i + 6),
    );
    expect(after).toHaveLength(326);
    const sections = await sectionsOf(shelf.tmnt);
    expect(sections.map((s) => s.position)).toEqual(
      Array.from({ length: 13 }, (_, i) => i + 1),
    );
    await numbered(shelf.tmnt);
  });

  it("a section delete folds its works in after the unsectioned works already there", async () => {
    const { id } = await createShelf(db, {
      userId: user.id,
      name: "Fold",
      description: "",
    });
    const { id: section } = await createSection(db, {
      shelfId: id,
      userId: user.id,
      name: "S",
    });
    const items = (
      await sql`select item from shelf_entries where shelf = ${shelf.watch} order by position limit 5`
    ).map((r) => r.item);
    await sql`
      insert into shelf_entries (shelf, section, item, position) values
        (${id}, null, ${items[0]}, 1), (${id}, null, ${items[1]}, 2),
        (${id}, ${section}, ${items[2]}, 3), (${id}, ${section}, ${items[3]}, 4),
        (${id}, ${section}, ${items[4]}, 5)`;

    await deleteSection(db, {
      shelfId: id,
      userId: user.id,
      sectionId: section,
    });

    const after = await sql`
      select item, section, position from shelf_entries where shelf = ${id} order by position`;
    expect(after).toEqual(
      items.map((item, i) => ({ item, section: null, position: i + 1 })),
    );
    await deleteShelf(db, { shelfId: id, userId: user.id });
  });

  it("a section of another of the caller's shelves is NotFoundError on rename, move and delete, and nothing moved", async () => {
    const main = await sectionNamed(shelf.tmnt, "Volume 1 · Main Series");
    const key = { shelfId: shelf.watch, userId: user.id, sectionId: main };
    const before = await entriesOf(shelf.tmnt);
    await expect(updateSection(db, { ...key, name: "x" })).rejects.toThrow(
      new NotFoundError("No section by that id on this shelf."),
    );
    await expect(updateSection(db, { ...key, position: 1 })).rejects.toThrow(
      NotFoundError,
    );
    await expect(deleteSection(db, key)).rejects.toThrow(NotFoundError);
    expect(await entriesOf(shelf.tmnt)).toEqual(before);
  });

  it("the caller's shelf under another owner id is NotFoundError on all four, and nothing moved", async () => {
    const main = await sectionNamed(shelf.tmnt, "Volume 1 · Main Series");
    const key = { shelfId: shelf.tmnt, userId: stranger, sectionId: main };
    const before = await entriesOf(shelf.tmnt);
    await expect(
      createSection(db, { shelfId: shelf.tmnt, userId: stranger, name: "x" }),
    ).rejects.toThrow(new NotFoundError("No shelf by that id."));
    await expect(updateSection(db, { ...key, position: 9 })).rejects.toThrow(
      NotFoundError,
    );
    await expect(updateSection(db, { ...key, name: "x" })).rejects.toThrow(
      NotFoundError,
    );
    await expect(deleteSection(db, key)).rejects.toThrow(NotFoundError);
    expect(await entriesOf(shelf.tmnt)).toEqual(before);
    expect(await count("shelf_sections", shelf.tmnt)).toBe(13);
  });
});

const watchItems = async (from: number, n: number) =>
  (
    await sql`select item from shelf_entries where shelf = ${shelf.watch}
      order by position offset ${from - 1} limit ${n}`
  ).map((r) => r.item as string);

const rowsOf = (shelfId: string) =>
  sql<{ id: string; item: string; section: string | null; position: number }[]>`
    select id, item, section, position from shelf_entries
    where shelf = ${shelfId} order by position`;

/** A shelf of the caller's with sections A and B, two works each, and one unsectioned. */
async function smallShelf(name: string) {
  const { id } = await createShelf(db, {
    userId: user.id,
    name,
    description: "",
  });
  const key = { shelfId: id, userId: user.id };
  const { id: a } = await createSection(db, { ...key, name: "A" });
  const { id: b } = await createSection(db, { ...key, name: "B" });
  const works = await watchItems(10, 5);
  await addEntries(db, { ...key, items: [works[0]] });
  await addEntries(db, { ...key, items: works.slice(1, 3), section: a });
  await addEntries(db, { ...key, items: works.slice(3, 5), section: b });
  return { id, a, b, works };
}

describe("entries", () => {
  it("addEntries of three works onto the publication-order shelf lands them 12, 13, 14 in the order given", async () => {
    const films = await watchItems(1, 3);
    const order = [films[2], films[0], films[1]];
    expect(
      await addEntries(db, {
        shelfId: shelf.books,
        userId: user.id,
        items: order,
      }),
    ).toEqual({ added: 3, skipped: 0 });
    const rows = await rowsOf(shelf.books);
    expect(rows.slice(11).map((r) => [r.item, r.position])).toEqual([
      [order[0], 12],
      [order[1], 13],
      [order[2], 14],
    ]);
    await numbered(shelf.books);
  });

  it("adding two of them again with a new one answers added 1, skipped 2, and the two stay where they were", async () => {
    const films = await watchItems(1, 4);
    const before = await rowsOf(shelf.books);
    expect(
      await addEntries(db, {
        shelfId: shelf.books,
        userId: user.id,
        items: [films[0], films[3], films[1]],
      }),
    ).toEqual({ added: 1, skipped: 2 });
    const after = await rowsOf(shelf.books);
    expect(after.slice(0, 14)).toEqual(before);
    expect(after[14]).toMatchObject({ item: films[3], position: 15 });
  });

  it("adding into a section lands after that section's last work and before the next section's first; removing it closes the gap", async () => {
    const main = await sectionNamed(shelf.tmnt, "Volume 1 · Main Series");
    const [film] = await watchItems(20, 1);
    const before = await rowsOf(shelf.tmnt);
    await addEntries(db, {
      shelfId: shelf.tmnt,
      userId: user.id,
      items: [film],
      section: main,
    });
    const after = await rowsOf(shelf.tmnt);
    const at = after.findIndex((r) => r.item === film);
    expect(after[at - 1].section).toBe(main);
    expect(after[at + 1].section).not.toBe(main);
    expect(after).toHaveLength(327);
    await numbered(shelf.tmnt);

    await removeEntry(db, {
      shelfId: shelf.tmnt,
      userId: user.id,
      entryId: after[at].id,
    });
    expect(await rowsOf(shelf.tmnt)).toEqual(before);
    await numbered(shelf.tmnt);
  });

  it("500 works in one call are all added in order", async () => {
    const fixture = (
      await sql`select distinct item from item_sources
        where source || ':' || key = any(${sql.array(fixtureItems)})`
    ).map((r) => r.item as string);
    expect(fixture).toHaveLength(454);
    const made = (
      await sql`
        insert into items (type, title, source_note)
        select 'film', ${tag} || ' ' || n, ${tag} from generate_series(1, 46) n
        returning id`
    ).map((r) => r.id as string);
    const all = [...fixture, ...made];
    const { id } = await createShelf(db, {
      userId: user.id,
      name: "Five hundred",
      description: "",
    });
    expect(
      await addEntries(db, { shelfId: id, userId: user.id, items: all }),
    ).toEqual({ added: 500, skipped: 0 });
    expect((await rowsOf(id)).map((r) => r.item)).toEqual(all);
    await numbered(id);
    await deleteShelf(db, { shelfId: id, userId: user.id });
  });

  it("a film's id beside an unknown uuid is BadItems and nothing is added", async () => {
    const [carrie] = await sql`
      select item from item_sources where source = 'letterboxd' and key = '20ZQ'`;
    const before = await rowsOf(shelf.books);
    await expect(
      addEntries(db, {
        shelfId: shelf.books,
        userId: user.id,
        items: [carrie.item, crypto.randomUUID()],
      }),
    ).rejects.toThrow(new BadItems("Every work must be in the catalog."));
    expect(await rowsOf(shelf.books)).toEqual(before);
  });

  it("a section of another shelf is NotFoundError and nothing is added", async () => {
    const main = await sectionNamed(shelf.tmnt, "Volume 1 · Main Series");
    const before = await rowsOf(shelf.books);
    await expect(
      addEntries(db, {
        shelfId: shelf.books,
        userId: user.id,
        items: await watchItems(30, 1),
        section: main,
      }),
    ).rejects.toThrow(
      new NotFoundError("No section by that id on this shelf."),
    );
    expect(await rowsOf(shelf.books)).toEqual(before);
  });

  it("setEntryStatus round-trips done, skipped, unmarked, moves nothing and touches updated_at", async () => {
    const [first] = await rowsOf(shelf.watch);
    const key = { shelfId: shelf.watch, userId: user.id, entryId: first.id };
    const before = await updatedAt(shelf.watch);
    for (const status of ["done", "skipped", "unmarked"] as const) {
      expect(await setEntryStatus(db, { ...key, status })).toEqual({
        id: first.id,
        item: first.item,
        section: null,
        position: 1,
        status,
      });
    }
    expect((await updatedAt(shelf.watch)).getTime()).toBeGreaterThan(
      before.getTime(),
    );
    expect((await rowsOf(shelf.watch))[0]).toEqual(first);
  });

  it("status for an entry under another owner id, or on another shelf, is NotFoundError and the status stays", async () => {
    const [first] = await rowsOf(shelf.watch);
    await expect(
      setEntryStatus(db, {
        shelfId: shelf.watch,
        userId: stranger,
        entryId: first.id,
        status: "done",
      }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      setEntryStatus(db, {
        shelfId: shelf.books,
        userId: user.id,
        entryId: first.id,
        status: "done",
      }),
    ).rejects.toThrow(new NotFoundError("No entry by that id on this shelf."));
    const [{ status }] =
      await sql`select status from shelf_entries where id = ${first.id}`;
    expect(status).toBe("unmarked");
  });

  it("moveEntry into a section at 0, above the first section, and past the end; the answer is the table", async () => {
    const small = await smallShelf("Moves");
    const key = { shelfId: small.id, userId: user.id };
    const rows = await rowsOf(small.id);
    // 1 unsectioned, A at 2..3, B at 4..5
    const last = rows[4];

    const intoA = await moveEntry(db, {
      ...key,
      entryId: last.id,
      section: small.a,
      index: 0,
    });
    const table = async () =>
      (await rowsOf(small.id)).map(({ id, position }) => ({ id, position }));
    expect(intoA.positions).toEqual(await table());
    expect((await rowsOf(small.id))[1]).toMatchObject({
      id: last.id,
      section: small.a,
      position: 2,
    });

    await moveEntry(db, { ...key, entryId: last.id, section: null, index: 0 });
    expect((await rowsOf(small.id))[0]).toMatchObject({
      id: last.id,
      section: null,
      position: 1,
    });

    const end = await moveEntry(db, {
      ...key,
      entryId: last.id,
      section: small.b,
      index: 99,
    });
    expect(end.positions.at(-1)).toEqual({ id: last.id, position: 5 });
    expect(end.positions).toEqual(await table());
    await numbered(small.id);
    await deleteShelf(db, key);
  });

  it("a move with a section from another shelf is NotFoundError and the positions stay", async () => {
    const main = await sectionNamed(shelf.tmnt, "Volume 1 · Main Series");
    const before = await rowsOf(shelf.watch);
    await expect(
      moveEntry(db, {
        shelfId: shelf.watch,
        userId: user.id,
        entryId: before[0].id,
        section: main,
        index: 0,
      }),
    ).rejects.toThrow(
      new NotFoundError("No section by that id on this shelf."),
    );
    expect(await rowsOf(shelf.watch)).toEqual(before);
  });

  it("removeEntry of an entry not on the shelf is NotFoundError", async () => {
    const [first] = await rowsOf(shelf.watch);
    await expect(
      removeEntry(db, {
        shelfId: shelf.books,
        userId: user.id,
        entryId: first.id,
      }),
    ).rejects.toThrow(NotFoundError);
    expect(await count("shelf_entries", shelf.watch)).toBe(61);
  });

  it("an unchanged write leaves updated_at alone, so the nook's order doesn't move (Rummage R2)", async () => {
    const small = await smallShelf("Unchanged");
    const key = { shelfId: small.id, userId: user.id };
    const [first] = await rowsOf(small.id);
    const [{ name, description }] =
      await sql`select name, description from shelves where id = ${small.id}`;
    const before = await updatedAt(small.id);
    await updateShelf(db, { ...key, name, description });
    await setEntryStatus(db, { ...key, entryId: first.id, status: "unmarked" });
    await moveEntry(db, { ...key, entryId: first.id, section: null, index: 0 });
    await updateSection(db, {
      ...key,
      sectionId: small.a,
      name: "A",
      position: 1,
    });
    expect((await updatedAt(small.id)).getTime()).toBe(before.getTime());
    await deleteShelf(db, key);
  });

  it("an id in upper case names the same row everywhere, never a throw (Rummage R4)", async () => {
    const small = await smallShelf("Upper");
    const key = { shelfId: small.id, userId: user.id };
    const last = (await rowsOf(small.id))[4];
    const expected = await moveEntry(db, {
      ...key,
      entryId: last.id,
      section: small.a,
      index: 0,
    });
    await moveEntry(db, { ...key, entryId: last.id, section: small.b, index: 99 });
    const upper = await moveEntry(db, {
      ...key,
      entryId: last.id.toUpperCase(),
      section: small.a.toUpperCase(),
      index: 0,
    });
    expect(upper.positions).toEqual(expected.positions);
    expect(
      await updateSection(db, {
        ...key,
        sectionId: small.b.toUpperCase(),
        position: 1,
      }),
    ).toMatchObject({ position: 1 });
    await deleteSection(db, { ...key, sectionId: small.b.toUpperCase() });
    expect(await count("shelf_sections", small.id)).toBe(1);
    await numbered(small.id);
    await deleteShelf(db, key);
  });

  it("a section named as one the shelf has in another case is ConflictError (Rummage R5)", async () => {
    const small = await smallShelf("Cased");
    const key = { shelfId: small.id, userId: user.id };
    await expect(createSection(db, { ...key, name: "a" })).rejects.toThrow(
      ConflictError,
    );
    await expect(
      updateSection(db, { ...key, sectionId: small.b, name: "A " }),
    ).rejects.toThrow(ConflictError);
    expect(await count("shelf_sections", small.id)).toBe(2);
    await deleteShelf(db, key);
  });

  it("two moves at once end with the shelf 1..n", async () => {
    const small = await smallShelf("Race");
    const rows = await rowsOf(small.id);
    const other = createDb();
    try {
      await Promise.all([
        moveEntry(db, {
          shelfId: small.id,
          userId: user.id,
          entryId: rows[0].id,
          section: small.b,
          index: 99,
        }),
        moveEntry(other.db, {
          shelfId: small.id,
          userId: user.id,
          entryId: rows[4].id,
          section: null,
          index: 0,
        }),
      ]);
    } finally {
      await other.close();
    }
    const after = await rowsOf(small.id);
    expect(after).toHaveLength(5);
    await numbered(small.id);
    await deleteShelf(db, { shelfId: small.id, userId: user.id });
  });
});

// Last: the section and entry tests above need the TMNT shelf whole.
describe("deleteShelf", () => {
  it("deleteShelf of another owner's id is NotFoundError and the shelf stays", async () => {
    await expect(
      deleteShelf(db, { shelfId: shelf.watch, userId: stranger }),
    ).rejects.toThrow(NotFoundError);
    expect(await count("shelf_entries", shelf.watch)).toBe(61);
  });

  // By here the section tests left the TMNT shelf 13 sections and the entry
  // tests left the publication-order shelf 15 works.
  it("deleteShelf on the TMNT shelf takes its 13 sections and 326 entries, and leaves the catalog's 454 and the other two shelves", async () => {
    const catalog = async () =>
      (
        await sql`
          select count(distinct item)::int as n from item_sources
          where source || ':' || key = any(${sql.array(fixtureItems)})`
      )[0].n;
    expect(await catalog()).toBe(454);
    const held = (
      await sql`select item from shelf_entries where shelf = ${shelf.tmnt}`
    ).map((r) => r.item);
    expect(held).toHaveLength(326);
    expect(await count("shelf_sections", shelf.tmnt)).toBe(13);

    await deleteShelf(db, { shelfId: shelf.tmnt, userId: user.id });

    expect(await count("shelf_sections", shelf.tmnt)).toBe(0);
    expect(await count("shelf_entries", shelf.tmnt)).toBe(0);
    expect(
      (
        await sql`select count(*)::int as n from items where id = any(${sql.array(held)}::uuid[])`
      )[0].n,
    ).toBe(326);
    expect(await catalog()).toBe(454);
    expect(await count("shelf_entries", shelf.watch)).toBe(61);
    expect(await count("shelf_entries", shelf.books)).toBe(15);
  });

  it("deleteShelf twice is NotFoundError the second time", async () => {
    await expect(
      deleteShelf(db, { shelfId: shelf.tmnt, userId: user.id }),
    ).rejects.toThrow(NotFoundError);
  });
});

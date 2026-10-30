import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { fixture } from "@/fixtures/shape";
import { ConflictError, NotFoundError } from "@/lib/catalog/import";
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

beforeAll(async () => {
  user = await signUpWithFixtures(sql);
  const rows = await sql`select id, name from shelves where owner = ${user.id}`;
  const named = (name: string) => rows.find((r) => r.name === name)?.id;
  shelf.tmnt = named("TMNT, the Mirage run");
  shelf.watch = named("Stephen King Watch List");
  shelf.books = named("Stephen King, publication order");
});

afterAll(async () => {
  await sql`delete from shelves where owner = ${user.id}`;
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

// Last: the section and entry tests above need the TMNT shelf whole.
describe("deleteShelf", () => {
  it("deleteShelf of another owner's id is NotFoundError and the shelf stays", async () => {
    await expect(
      deleteShelf(db, { shelfId: shelf.watch, userId: stranger }),
    ).rejects.toThrow(NotFoundError);
    expect(await count("shelf_entries", shelf.watch)).toBe(61);
  });

  it("deleteShelf on the TMNT shelf takes its 14 sections and 326 entries, and leaves the catalog's 454 and the other two shelves", async () => {
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
    expect(await count("shelf_entries", shelf.books)).toBe(11);
  });

  it("deleteShelf twice is NotFoundError the second time", async () => {
    await expect(
      deleteShelf(db, { shelfId: shelf.tmnt, userId: user.id }),
    ).rejects.toThrow(NotFoundError);
  });
});

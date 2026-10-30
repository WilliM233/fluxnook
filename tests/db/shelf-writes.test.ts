import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { fixture } from "@/fixtures/shape";
import { NotFoundError } from "@/lib/catalog/import";
import { isNumbered } from "@/lib/shelves/order";
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

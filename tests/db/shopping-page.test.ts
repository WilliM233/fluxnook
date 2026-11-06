import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { loadCollectionPage } from "@/lib/collection/collection-page";
import { loadShopping } from "@/lib/collection/shopping-page";
import { itemFor, required, signUp, signUpWithFixtures } from "./harness";

// Shopping's read (Ch 1.7 A11, A13, A16) on one account holding the fixtures,
// and on throwaway accounts with shelves and works of their own, tagged, so a
// printing never lands on a fixture row another file counts.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
const tag = `shopping ${crypto.randomUUID()}`;
let owner: string;

const work = async (over: { type?: string; form?: string | null } = {}) => {
  const type = over.type ?? "book";
  const form =
    over.form === undefined ? (type === "book" ? "novel" : null) : over.form;
  const [row] = await sql`
    insert into items (type, title, form, source_note)
    values (${type}, ${tag}, ${form}, ${tag}) returning id`;
  return row.id as string;
};

const printing = async (item: string, format = "paperback") => {
  const [row] = await sql`
    insert into editions (item, format) values (${item}, ${format}) returning id`;
  return row.id as string;
};

/** A shelf of the user's, its order in the nook by `at`, holding these works. */
const shelfOf = async (
  user: string,
  name: string,
  at: string,
  works: string[],
  status = "unmarked",
) => {
  const [{ id }] = await sql`
    insert into shelves (owner, name, created_at, updated_at)
    values (${user}, ${name}, ${at}, ${at}) returning id`;
  let position = 0;
  for (const item of works) {
    position += 1;
    await sql`insert into shelf_entries (shelf, item, position, status)
      values (${id}, ${item}, ${position}, ${status})`;
  }
  return id as string;
};

const OLDER = "2020-01-01T00:00:00Z";
const NEWER = "2021-01-01T00:00:00Z";

const rowsOf = (shopping: Awaited<ReturnType<typeof loadShopping>>) =>
  shopping.shelves.flatMap((s) => s.groups.flatMap((g) => g.rows));

beforeAll(async () => {
  ({ id: owner } = await signUpWithFixtures(sql));
});

afterAll(async () => {
  await sql`delete from copies where edition in (
    select e.id from editions e join items i on i.id = e.item
    where i.source_note = ${tag})`;
  await sql`delete from shelf_entries where item in (
    select id from items where source_note = ${tag})`;
  await sql`delete from editions where item in (
    select id from items where source_note = ${tag})`;
  await sql`delete from items where source_note = ${tag}`;
  await close();
  await sql.end();
});

describe("the fixture", () => {
  it("314; TMNT 242 of 326 with 47 backups; the Watch List 61 of 61; King 11 of 11; in the nook's order", async () => {
    const shopping = await loadShopping(db, owner);
    expect(shopping.total).toBe(314);
    expect(
      shopping.shelves.map((s) => [s.name, s.toFind, s.works, s.backups]),
    ).toEqual([
      ["TMNT, the Mirage run", 242, 326, 47],
      ["Stephen King Watch List", 61, 61, 0],
      ["Stephen King, publication order", 11, 11, 0],
    ]);
    expect(rowsOf(shopping)).toHaveLength(314);
    expect(shopping.shelves.every((s) => s.note === null)).toBe(true);
  });

  it("keeps a film's null form", async () => {
    const shopping = await loadShopping(db, owner);
    const watch = shopping.shelves[1];
    const rows = watch.groups.flatMap((g) => g.rows);
    expect(rows).toHaveLength(61);
    expect(rows.every((r) => r.work.type === "film")).toBe(true);
    expect(rows.every((r) => r.work.form === null)).toBe(true);
  });

  it("a held work leaves; a via work leaves; the hop's backup is counted in the 47 and not listed", async () => {
    const shopping = await loadShopping(db, owner);
    const listed = new Set(rowsOf(shopping).map((r) => r.work.id));
    expect(listed.has(await itemFor(sql, "manual", "tmnt-mirage-v1-1"))).toBe(
      false,
    );
    expect(
      listed.has(
        await itemFor(sql, "manual", "tmnt-mirage-backup-you-had-to-be-there"),
      ),
    ).toBe(false);
    // Vol. 1 #33 is in no Ultimate Collection, so it's still to find.
    expect(listed.has(await itemFor(sql, "manual", "tmnt-mirage-v1-33"))).toBe(
      true,
    );
    expect(shopping.shelves[0].backups).toBe(47);
  });

  it("groups the TMNT shelf by its sections, in order, a label only where rows are", async () => {
    const { shelves } = await loadShopping(db, owner);
    const [tmnt] = shelves;
    expect(tmnt.groups).toHaveLength(13);
    expect(tmnt.groups[0].section).toBe("Volume 1 · Main Series");
    expect(tmnt.groups[0].rows).toHaveLength(29);
    expect(tmnt.groups[1].section).toBe("Volume 1 · Micro Series");
    expect(tmnt.groups[1].rows).toHaveLength(1);
    expect(tmnt.groups.reduce((n, g) => n + g.rows.length, 0)).toBe(242);
  });
});

describe("shelves of a probe's own", () => {
  it("lists one work on two shelves once, under the first in the nook's order, with Also on", async () => {
    const { id: user } = await signUp(sql);
    const both = await work();
    await shelfOf(user, "Older shelf", OLDER, [both]);
    await shelfOf(user, "Newer shelf", NEWER, [both]);
    const shopping = await loadShopping(db, user);
    expect(shopping.total).toBe(1);
    expect(shopping.shelves.map((s) => s.name)).toEqual([
      "Newer shelf",
      "Older shelf",
    ]);
    const [first, second] = shopping.shelves;
    expect(first.groups[0].rows[0].alsoOn).toEqual(["Older shelf"]);
    expect(second.groups).toEqual([]);
    expect(second.toFind).toBe(1);
    expect(second.note).toBe("Listed under Newer shelf.");
  });

  it("keeps a skipped entry on the list", async () => {
    const { id: user } = await signUp(sql);
    const skipped = await work();
    await shelfOf(user, "Skipped", OLDER, [skipped], "skipped");
    const shopping = await loadShopping(db, user);
    expect(rowsOf(shopping).map((r) => r.work.id)).toEqual([skipped]);
  });

  it("a shelf with no works, and a shelf with everything held, say so", async () => {
    const { id: user } = await signUp(sql);
    const held = await work();
    const edition = await printing(held);
    await sql`insert into copies (owner, edition) values (${user}, ${edition})`;
    await shelfOf(user, "Empty", NEWER, []);
    await shelfOf(user, "All mine", OLDER, [held]);
    const shopping = await loadShopping(db, user);
    expect(shopping.total).toBe(0);
    expect(shopping.shelves.map((s) => [s.name, s.note])).toEqual([
      ["Empty", "Nothing on this shelf yet."],
      ["All mine", "Everything here is yours."],
    ]);
  });

  it("a row carries the work's printings, oldest first; a work with none carries none", async () => {
    const { id: user } = await signUp(sql);
    const printed = await work();
    const bare = await work();
    const [{ id: later }] = await sql`
      insert into editions (item, format, publisher, released_on, released_precision)
      values (${printed}, 'hardcover', 'Later', '2016-01-01', 'day') returning id`;
    const [{ id: earlier }] = await sql`
      insert into editions (item, format, publisher, released_on, released_precision)
      values (${printed}, 'paperback', 'Earlier', '2011-01-01', 'day') returning id`;
    const noDate = await printing(printed, "ebook");
    await shelfOf(user, "Printed", OLDER, [printed, bare]);
    const rows = rowsOf(await loadShopping(db, user));
    expect(rows[0].printings.map((p) => p.id)).toEqual([
      earlier,
      later,
      noDate,
    ]);
    expect(rows[0].printings[0]).toEqual({
      id: earlier,
      format: "paperback",
      title: null,
      publisher: "Earlier",
      released_on: "2011-01-01",
    });
    expect(rows[1].printings).toEqual([]);
  });
});

describe("the owner rule", () => {
  it("another person's copy moves nothing, and another person's shelves don't list", async () => {
    const { id: mine } = await signUp(sql);
    const { id: theirs } = await signUp(sql);
    const wanted = await work();
    const edition = await printing(wanted);
    await shelfOf(mine, "Mine", OLDER, [wanted]);
    await shelfOf(theirs, "Theirs", OLDER, [wanted]);
    await sql`insert into copies (owner, edition) values (${theirs}, ${edition})`;

    const shopping = await loadShopping(db, mine);
    expect(shopping.shelves.map((s) => s.name)).toEqual(["Mine"]);
    expect(rowsOf(shopping).map((r) => r.work.id)).toEqual([wanted]);

    const other = await loadShopping(db, theirs);
    expect(other.total).toBe(0);
    expect(other.shelves.map((s) => s.name)).toEqual(["Theirs"]);
  });
});

describe("s agrees", () => {
  it("Collection's number is Shopping's total, before and after a copy", async () => {
    const { id: user } = await signUp(sql);
    const a = await work();
    const b = await work({ type: "film" });
    const edition = await printing(a);
    await shelfOf(user, "First", NEWER, [a, b]);
    await shelfOf(user, "Second", OLDER, [a]);

    expect((await loadShopping(db, user)).total).toBe(2);
    expect((await loadCollectionPage(db, { userId: user })).toFind).toBe(2);

    await sql`insert into copies (owner, edition) values (${user}, ${edition})`;
    expect((await loadShopping(db, user)).total).toBe(1);
    expect((await loadCollectionPage(db, { userId: user })).toFind).toBe(1);
  });

  it("on the fixture", async () => {
    expect((await loadCollectionPage(db, { userId: owner })).toFind).toBe(
      (await loadShopping(db, owner)).total,
    );
  });
});

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { loadCollectionPage } from "@/lib/collection/collection-page";
import { createCopy } from "@/lib/collection/copies";
import type { Cursor } from "@/lib/journal/cursor";
import { required, signUp, signUpWithFixtures } from "./harness";

// Collection's read (Ch 1.7 A10, A13, A16) on one account holding the fixtures
// and on throwaway accounts with rows of their own.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
let owner: string;
let stranger: string;

// Probe rows live under one tag, so nothing here touches the fixture's.
const TAG = `Collection probe ${crypto.randomUUID()}`;
const probeItems: string[] = [];

async function probeWork(
  type = "book",
  form: string | null = type === "book" ? "novel" : null,
) {
  const [{ id }] = await sql`
    insert into items (type, title, form, source_note)
    values (${type}, ${TAG}, ${form}, ${TAG}) returning id`;
  probeItems.push(id);
  return id as string;
}

async function probePrinting(item: string, format = "paperback") {
  const [{ id }] = await sql`
    insert into editions (item, format) values (${item}, ${format}) returning id`;
  return id as string;
}

beforeAll(async () => {
  ({ id: owner } = await signUpWithFixtures(sql));
  ({ id: stranger } = await signUp(sql));
});

afterAll(async () => {
  await sql`delete from copies where edition in (
    select id from editions where item = any(${probeItems}))`;
  await sql`delete from edition_contents where edition in (
    select id from editions where item = any(${probeItems}))`;
  await sql`delete from editions where item = any(${probeItems})`;
  await sql`delete from items where id = any(${probeItems})`;
  await close();
  await sql.end();
});

describe("the fixture", () => {
  it("5 copies, 5 works, 38 more; five rows covering 8, 8, 7, 7, 7 in any order; no older", async () => {
    const page = await loadCollectionPage(db, { userId: owner });
    expect(page.totals).toEqual({ copies: 5, works: 5, via: 38 });
    expect(page.toFind).toBe(314);
    expect(page.older).toBeNull();
    expect(page.rows.map((r) => r.printing.contents).sort()).toEqual([
      7, 7, 7, 8, 8,
    ]);
    for (const row of page.rows) {
      expect(row.printing.format).toBe("hardcover");
      expect(row.work.type).toBe("comic");
    }
  });
});

describe("the totals", () => {
  // On rows of its own: a copy by the item door leaves its printing behind (A3),
  // and a printing on a fixture row moves another file's count.
  it("a held work that's also via counts in m and in k", async () => {
    const { id: user } = await signUp(sql);
    const issue = await probeWork("comic", "issue");
    const trade = await probeWork("comic", "collected");
    const floppy = await probePrinting(issue, "floppy");
    const hardcover = await probePrinting(trade, "hardcover");
    await sql`insert into edition_contents (edition, item, position)
      values (${hardcover}, ${issue}, 1)`;
    await sql`insert into copies (owner, edition)
      values (${user}, ${floppy}), (${user}, ${hardcover})`;
    const page = await loadCollectionPage(db, { userId: user });
    expect(page.totals).toEqual({ copies: 2, works: 2, via: 1 });
  });
});

describe("a row", () => {
  it("carries the printing's format, publisher, year and contents, and the copy's condition, day and note", async () => {
    const { id: user } = await signUp(sql);
    const work = await probeWork();
    const [{ id: edition }] = await sql`
      insert into editions (item, format, publisher, released_on, released_precision)
      values (${work}, 'paperback', 'Anchor Books', '2011-04-05', 'day') returning id`;
    await createCopy(db, {
      userId: user,
      edition,
      condition: "good",
      acquiredOn: "2019-03-12",
      note: "The one with the Sissy Spacek cover.",
    });
    const { rows } = await loadCollectionPage(db, { userId: user });
    expect(rows).toHaveLength(1);
    expect(rows[0].printing).toEqual({
      format: "paperback",
      publisher: "Anchor Books",
      released_on: "2011-04-05",
      contents: 0,
    });
    expect(rows[0].copy).toMatchObject({
      condition: "good",
      acquiredOn: "2019-03-12",
      note: "The one with the Sissy Spacek cover.",
    });
    expect(rows[0].copy.createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/,
    );
    expect(rows[0].work).toMatchObject({ id: work, type: "book", title: TAG });
  });
});

describe("the keyset", () => {
  it("51 copies page at 50, then 1, none repeated, and no older on the last", async () => {
    const { id: user } = await signUp(sql);
    const edition = await probePrinting(await probeWork());
    for (let k = 0; k < 51; k++) {
      await sql`insert into copies (owner, edition, created_at, updated_at)
        values (${user}, ${edition},
          ${new Date(2020, 0, 1, 0, k).toISOString()},
          ${new Date(2020, 0, 1, 0, k).toISOString()})`;
    }
    const first = await loadCollectionPage(db, { userId: user });
    expect(first.totals.copies).toBe(51);
    expect(first.rows).toHaveLength(50);
    expect(first.older).not.toBeNull();
    const second = await loadCollectionPage(db, {
      userId: user,
      before: first.older as Cursor,
    });
    expect(second.rows).toHaveLength(1);
    expect(second.older).toBeNull();
    expect(second.totals.copies).toBe(51);
    const ids = [...first.rows, ...second.rows].map((r) => r.copy.id);
    expect(new Set(ids).size).toBe(51);
  });

  it("51 copies written at one instant page by id", async () => {
    const { id: user } = await signUp(sql);
    const edition = await probePrinting(await probeWork());
    await sql`insert into copies (owner, edition)
      select ${user}, ${edition} from generate_series(1, 51)`;
    const first = await loadCollectionPage(db, { userId: user });
    const second = await loadCollectionPage(db, {
      userId: user,
      before: first.older as Cursor,
    });
    const ids = [...first.rows, ...second.rows].map((r) => r.copy.id);
    expect(ids).toHaveLength(51);
    expect(new Set(ids).size).toBe(51);
    expect(ids).toEqual([...ids].sort().reverse());
  });
});

describe("a chip", () => {
  it("filters the rows, keeps the totals, and pages under the filter", async () => {
    const { id: user } = await signUp(sql);
    const book = await probePrinting(await probeWork("book"));
    const film = await probePrinting(await probeWork("film"), "blu-ray");
    await sql`insert into copies (owner, edition)
      select ${user}, ${book} from generate_series(1, 51)`;
    await sql`insert into copies (owner, edition) values (${user}, ${film})`;

    const all = await loadCollectionPage(db, { userId: user });
    expect(all.totals).toEqual({ copies: 52, works: 2, via: 0 });

    const films = await loadCollectionPage(db, { userId: user, type: "film" });
    expect(films.rows).toHaveLength(1);
    expect(films.older).toBeNull();
    expect(films.totals).toEqual({ copies: 52, works: 2, via: 0 });

    const tv = await loadCollectionPage(db, { userId: user, type: "tv" });
    expect(tv.rows).toHaveLength(0);
    expect(tv.totals.copies).toBe(52);

    const books = await loadCollectionPage(db, { userId: user, type: "book" });
    expect(books.rows).toHaveLength(50);
    const rest = await loadCollectionPage(db, {
      userId: user,
      type: "book",
      before: books.older as Cursor,
    });
    expect(rest.rows).toHaveLength(1);
    expect(rest.rows[0].work.type).toBe("book");
  });
});

describe("the owner rule", () => {
  it("a stranger lists none of it, with the fixture's owner beside them", async () => {
    const page = await loadCollectionPage(db, { userId: stranger });
    expect(page).toEqual({
      totals: { copies: 0, works: 0, via: 0 },
      toFind: 0,
      rows: [],
      older: null,
    });
    const theirs = await loadCollectionPage(db, { userId: owner });
    expect(theirs.rows).toHaveLength(5);
  });
});

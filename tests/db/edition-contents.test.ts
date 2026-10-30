import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { BadContents, replaceEditionContents } from "@/lib/catalog/contents";
import { ConflictError, NotFoundError } from "@/lib/catalog/import";
import { required } from "./harness";

// A6's write on rows of its own (Ch 1.4.3): a replace in the order given,
// the empty list, every refusal leaving the contents as they were, and two
// saves at once ending with one list whole.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
const tag = `edition-contents ${crypto.randomUUID()}`;
let hardcover: string;
let collected: string;
let paperback: string;
let a: string;
let b: string;
let c: string;
let film: string;

async function item(type: string, form: string | null, title = tag) {
  const [{ id }] = await sql`
    insert into items (type, title, form, source_note)
    values (${type}, ${title}, ${form}, ${tag}) returning id`;
  return id as string;
}

const contents = async (edition = hardcover) =>
  (
    await sql`select item, position from edition_contents
      where edition = ${edition} order by position`
  ).map((r) => [r.item, r.position]);

const replace = (itemIds: string[], editionId = hardcover) =>
  replaceEditionContents(db, { editionId, itemIds });

beforeAll(async () => {
  collected = await item("comic", "collected");
  a = await item("comic", "issue", `${tag} a`);
  b = await item("comic", "issue", `${tag} b`);
  c = await item("comic", "one-shot", `${tag} c`);
  film = await item("film", null);
  const book = await item("book", "novel");
  [{ id: hardcover }] = await sql`
    insert into editions (item, format) values (${collected}, 'hardcover') returning id`;
  [{ id: paperback }] = await sql`
    insert into editions (item, format) values (${book}, 'paperback') returning id`;
});

afterAll(async () => {
  await sql`delete from items where source_note = ${tag}`;
  await close();
  await sql.end();
});

describe("replaceEditionContents", () => {
  it("replaces: [c, a, b] gives positions 1, 2, 3 in that order; a second put of [b] leaves one row", async () => {
    expect(await replace([c, a, b])).toEqual({ count: 3 });
    expect(await contents()).toEqual([
      [c, 1],
      [a, 2],
      [b, 3],
    ]);
    expect(await replace([b])).toEqual({ count: 1 });
    expect(await contents()).toEqual([[b, 1]]);
  });

  it("an empty list clears and answers 0", async () => {
    await replace([a, b]);
    expect(await replace([])).toEqual({ count: 0 });
    expect(await contents()).toEqual([]);
  });

  it("a film's id is BadContents and the contents are unchanged (A13's fifth red)", async () => {
    await replace([a, b]);
    await expect(replace([a, film])).rejects.toBeInstanceOf(BadContents);
    expect(await contents()).toEqual([
      [a, 1],
      [b, 2],
    ]);
  });

  it("an unknown uuid is BadContents, unchanged", async () => {
    await replace([a]);
    await expect(replace([crypto.randomUUID()])).rejects.toBeInstanceOf(
      BadContents,
    );
    expect(await contents()).toEqual([[a, 1]]);
  });

  it("the edition's own item is BadContents, unchanged", async () => {
    await replace([a]);
    await expect(replace([collected])).rejects.toBeInstanceOf(BadContents);
    expect(await contents()).toEqual([[a, 1]]);
  });

  it("a repeated id is BadContents, unchanged", async () => {
    await replace([a]);
    await expect(replace([b, b])).rejects.toBeInstanceOf(BadContents);
    expect(await contents()).toEqual([[a, 1]]);
  });

  it("one bad id among good ones writes nothing", async () => {
    await replace([a]);
    await expect(replace([b, c, film])).rejects.toBeInstanceOf(BadContents);
    expect(await contents()).toEqual([[a, 1]]);
  });

  it("an unknown edition is NotFoundError", async () => {
    await expect(replace([a], crypto.randomUUID())).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("a book's paperback is ConflictError, and gains nothing", async () => {
    await expect(replace([a], paperback)).rejects.toBeInstanceOf(ConflictError);
    expect(await contents(paperback)).toEqual([]);
  });

  it("two puts at once end with exactly one list, whole", async () => {
    const two = createDb();
    try {
      await Promise.all([
        replace([a]),
        replaceEditionContents(two.db, {
          editionId: hardcover,
          itemIds: [b, c],
        }),
      ]);
    } finally {
      await two.close();
    }
    expect([
      JSON.stringify([[a, 1]]),
      JSON.stringify([
        [b, 1],
        [c, 2],
      ]),
    ]).toContain(JSON.stringify(await contents()));
  });
});

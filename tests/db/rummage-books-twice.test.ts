import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { importEditionFromOpenLibrary } from "@/lib/catalog/editions";
import { importFromOpenLibrary } from "@/lib/catalog/import";
import { isbn13CheckDigit } from "@/lib/isbn";
import {
  createOpenLibrary,
  type OpenLibrary,
} from "@/lib/providers/openlibrary";
import {
  type OpenLibraryStub,
  startOpenLibraryStub,
} from "../stub/openlibrary";
import { required } from "./harness";

// Rummage R4 and R5 (Ch 1.3), on the local stack with the stub over copies
// of the recordings under keys of their own (OL62…), titles carrying a tag.
//
// R4: two tabs press Same on the same Carrie at once. Both imports read the
// key as unknown, both fetch the work, both enter `attach`; the second waits
// on the first's `for update`, then finds the Open Library source the first
// just wrote and answers 409 "already has Open Library source" for the very
// key it was asked to add. A6 says a key already in the catalog is a 200 with
// its item; that holds whether the other import finished a second ago or a
// millisecond ago.
//
// R5: a printing titled as its work carries no title of its own. When the
// work is already held, the edition's title is compared with the catalog's
// title as typed, so 'Salem's Lot (Open Library) against Salem's Lot (the
// fixture) is read as the edition's own title and shows on the Editions row.
// When the work is fetched instead, the comparison is against Open Library's
// title and the same printing has none. The one fold the catalog uses for
// "same title" is what should decide it, on both paths.

const RECORDINGS = join(process.cwd(), "tests/fixtures/openlibrary");
// biome-ignore lint/suspicious/noExplicitAny: raw Open Library JSON
const recorded = (name: string): any =>
  JSON.parse(readFileSync(join(RECORDINGS, name), "utf8"));

const tag = crypto.randomUUID().slice(0, 8);
const works = { carrie: "works/OL6200001W", lot: "works/OL6200002W" };
const books = { lot: "books/OL6200002M" };
const first12 = `979${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
const lotIsbn = first12 + isbn13CheckDigit(first12);
const titles = { carrie: `Carrie ${tag}`, lot: `Salem's Lot ${tag}` };

const sql = postgres(required("DATABASE_URL"), { max: 2, onnotice: () => {} });
const { db, close } = createDb();
let dir: string;
let stub: OpenLibraryStub;
let ol: OpenLibrary;
let carrie: string;
let lot: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "rummage-books-twice-"));
  const copy = (key: string, body: object) =>
    writeFileSync(
      join(dir, `${key.replace("/", "-")}.json`),
      JSON.stringify(body),
    );
  copy(works.carrie, {
    ...recorded("works-OL81626W.json"),
    title: titles.carrie,
    covers: [],
  });
  copy(works.lot, {
    ...recorded("works-OL81626W.json"),
    title: `'${titles.lot}`,
    covers: [],
  });
  copy("authors/OL19981A", recorded("authors-OL19981A.json"));
  copy(books.lot, {
    ...recorded("books-OL32864645M.json"),
    key: `/${books.lot}`,
    works: [{ key: `/${works.lot}` }],
    title: `'${titles.lot}`,
    isbn_13: [lotIsbn],
    isbn_10: [],
  });
  stub = await startOpenLibraryStub({ dir });
  ol = createOpenLibrary({
    baseUrl: stub.baseUrl,
    coversBaseUrl: stub.coversBaseUrl,
    userAgent: "test",
  });

  const held = async (title: string, year: string) => {
    const [{ id }] = await sql`
      insert into items (type, title, form, released_on, released_precision, source_note)
      values ('book', ${title}, 'novel', ${year}, 'year', ${tag})
      returning id`;
    await sql`insert into item_books (item, author) values (${id}, 'Stephen King')`;
    return id as string;
  };
  carrie = await held(titles.carrie, "1974-01-01");
  lot = await held(titles.lot, "1975-01-01");
  // 'Salem's Lot already holds its work, as it would after a Same on search.
  await sql`
    insert into item_sources (item, source, key, url)
    values (${lot}, 'openlibrary', ${works.lot}, ${`https://openlibrary.org/${works.lot}`})`;
});

afterAll(async () => {
  await sql`delete from items where source_note = ${tag}`;
  await sql`
    delete from items where id in (
      select item from item_sources where source = 'openlibrary'
      and key in (${works.carrie}, ${works.lot}))`;
  await stub.close();
  rmSync(dir, { recursive: true, force: true });
  await close();
  await sql.end();
});

it("R4: two Sames at once on the same book both answer with it, and one source row", async () => {
  // Hold Carrie's row so both imports reach `attach` before either can write;
  // the pair is awaited only after this transaction has let go.
  const same = () =>
    importFromOpenLibrary(db, ol, null, {
      key: works.carrie,
      attachTo: carrie,
    });
  let pair: Promise<PromiseSettledResult<Awaited<ReturnType<typeof same>>>[]>;
  await sql.begin(async (tx) => {
    await tx`select id from items where id = ${carrie} for update`;
    pair = Promise.allSettled([same(), same()]);
    await new Promise((resolve) => setTimeout(resolve, 500));
  });
  // biome-ignore lint/style/noNonNullAssertion: assigned inside the transaction above
  const results = await pair!;
  // A rejection is shown with its message, so the 409 reads in the red.
  expect(
    results.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : `rejected: ${(r.reason as Error).message}`,
    ),
  ).toEqual([
    { id: carrie, created: false },
    { id: carrie, created: false },
  ]);
  const [{ n }] = await sql`
    select count(*)::int as n from item_sources
    where item = ${carrie} and source = 'openlibrary'`;
  expect(n).toBe(1);
}, 20_000);

it("R5: a printing titled as its held work has no title of its own, apostrophe or not", async () => {
  const { id, itemId, created } = await importEditionFromOpenLibrary(
    db,
    ol,
    null,
    { key: books.lot, format: "paperback" },
  );
  expect(created).toBe(true);
  expect(itemId).toBe(lot);
  const [row] = await sql`select title from editions where id = ${id}`;
  expect(row.title).toBeNull();
});

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import {
  editionFor,
  importEditionFromOpenLibrary,
} from "@/lib/catalog/editions";
import { ConflictError, NotFoundError } from "@/lib/catalog/import";
import { coverStoreFromEnv } from "@/lib/covers";
import { isbn10to13, isbn13CheckDigit, isValidIsbn10 } from "@/lib/isbn";
import {
  createOpenLibrary,
  type EditionFormat,
  type OpenLibrary,
} from "@/lib/providers/openlibrary";
import {
  type OpenLibraryStub,
  startOpenLibraryStub,
} from "../stub/openlibrary";
import { required } from "./harness";

// A7 against the local stack. db files run side by side, so this one serves
// the recordings under its own keys (OL6…W, OL6…M), its own ISBNs (979, a
// random run, a real check digit) and titles carrying its tag, and attaches
// only to rows it made.

const RECORDINGS = join(process.cwd(), "tests/fixtures/openlibrary");
// biome-ignore lint/suspicious/noExplicitAny: raw Open Library JSON
const recorded = (name: string): any =>
  JSON.parse(readFileSync(join(RECORDINGS, name), "utf8"));

const itWork = recorded("works-OL81613W.json");
const carrieWork = recorded("works-OL81626W.json");
const itEdition = recorded("books-OL28838648M.json");
const carrieEdition = recorded("books-OL32864645M.json");

const tag = crypto.randomUUID().slice(0, 8);
const digits = () => String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
const isbn13 = () => {
  const first12 = `979${digits()}`;
  return first12 + isbn13CheckDigit(first12);
};
const isbn10 = () => {
  const first9 = digits();
  const check = [..."0123456789X"].find((c) => isValidIsbn10(first9 + c));
  return first9 + check;
};

const works = { it: "works/OL681613W", carrie: "works/OL681626W" };
const books = {
  it: "books/OL628838648M",
  carrie: "books/OL632864645M",
  carrieAgain: "books/OL6000001M",
  tenOnly: "books/OL6000002M",
  foreign: "books/OL6000004M",
  raced: "books/OL6000005M",
  absent: "books/OL6999999M",
};
const isbns = {
  it: isbn13(),
  carrie: isbn13(),
  tenOnly: isbn10(),
  foreign: isbn13(),
  raced: isbn13(),
};
const titles = { it: `It ${tag}`, carrie: `Carrie ${tag}` };

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
const covers = coverStoreFromEnv();
let dir: string;
let stub: OpenLibraryStub;
let ol: OpenLibrary;
const made: string[] = [];

async function run(
  key: string,
  attachTo?: string,
  format: EditionFormat = "paperback",
) {
  const result = await importEditionFromOpenLibrary(db, ol, covers, {
    key,
    format,
    attachTo,
  });
  made.push(result.itemId);
  return result;
}

async function heldCarrie() {
  const [{ id }] = await sql`
    insert into items (type, title, form, released_on, released_precision, source_note)
    values ('book', ${titles.carrie}, 'novel', '1974-01-01', 'year', ${tag})
    returning id`;
  await sql`insert into item_books (item, author) values (${id}, 'Stephen King')`;
  made.push(id);
  return id as string;
}

const editionCount = async () => {
  const [{ n }] = await sql`
    select count(distinct edition)::int as n from edition_sources
    where (source = 'openlibrary' and key like 'books/OL6%')
      or (source = 'isbn' and key = any(${[...Object.values(isbns), isbn10to13(isbns.tenOnly)]}))`;
  return n as number;
};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "editions-import-"));
  const copy = (key: string, body: object) =>
    writeFileSync(
      join(dir, `${key.replace("/", "-")}.json`),
      JSON.stringify(body),
    );
  const edition = (key: string, work: string, over: object) => ({
    ...itEdition,
    key: `/${key}`,
    works: [{ key: `/${work}` }],
    ...over,
  });
  copy(works.it, { ...itWork, title: titles.it, covers: [600000001] });
  copy(works.carrie, {
    ...carrieWork,
    title: titles.carrie,
    covers: [600000002],
  });
  copy("authors/OL19981A", recorded("authors-OL19981A.json"));
  copy(
    books.it,
    edition(books.it, works.it, { title: titles.it, isbn_13: [isbns.it] }),
  );
  copy(books.carrie, {
    ...carrieEdition,
    key: `/${books.carrie}`,
    works: [{ key: `/${works.carrie}` }],
    title: titles.carrie,
    isbn_13: [isbns.carrie],
    isbn_10: [],
  });
  copy(
    books.carrieAgain,
    edition(books.carrieAgain, works.carrie, { isbn_13: [isbns.carrie] }),
  );
  copy(
    books.tenOnly,
    edition(books.tenOnly, works.it, {
      title: titles.it,
      isbn_13: undefined,
      isbn_10: [isbns.tenOnly],
    }),
  );
  copy(
    books.foreign,
    edition(books.foreign, works.carrie, { isbn_13: [isbns.foreign] }),
  );
  copy(
    books.raced,
    edition(books.raced, works.it, {
      title: titles.it,
      isbn_13: [isbns.raced],
    }),
  );
  stub = await startOpenLibraryStub({ dir });
  ol = createOpenLibrary({
    baseUrl: stub.baseUrl,
    coversBaseUrl: stub.coversBaseUrl,
    userAgent: "test",
  });
});

afterAll(async () => {
  const paths = await sql`
    select cover_path from items where id = any(${made}) and cover_path is not null`;
  if (paths.length) await covers.remove(paths.map((p) => p.cover_path));
  await sql`delete from items where id = any(${made})`;
  await stub.close();
  rmSync(dir, { recursive: true, force: true });
  await close();
  await sql.end();
});

const editionRow = async (id: string) => {
  const [row] = await sql`
    select format, title, released_on::text as released_on, released_precision,
      publisher, pages
    from editions where id = ${id}`;
  return row;
};
const sourcesOf = async (id: string) =>
  (
    await sql`select source, key, url from edition_sources where edition = ${id} order by source`
  ).map((r) => ({ ...r }));

describe("importEditionFromOpenLibrary", () => {
  it("a new work and its printing: the book, the edition, its two sources", async () => {
    const { id, itemId, created } = await run(books.it);
    expect(created).toBe(true);
    const [item] = await sql`
      select i.type, i.form, i.title, b.author from items i
      join item_books b on b.item = i.id where i.id = ${itemId}`;
    expect({ ...item }).toEqual({
      type: "book",
      form: "novel",
      title: titles.it,
      author: "Stephen King",
    });
    expect(await editionRow(id)).toEqual({
      format: "paperback",
      title: null,
      released_on: `${itEdition.publish_date}-01-01`,
      released_precision: "year",
      publisher: itEdition.publishers[0],
      pages: itEdition.number_of_pages,
    });
    expect(await sourcesOf(id)).toEqual([
      { source: "isbn", key: isbns.it, url: null },
      {
        source: "openlibrary",
        key: books.it,
        url: `https://openlibrary.org/${books.it}`,
      },
    ]);
    expect(await editionFor(db, books.it, [])).toEqual({
      editionId: id,
      itemId,
    });
    expect(await editionFor(db, "books/OL0M", [isbns.it])).toEqual({
      editionId: id,
      itemId,
    });
  });

  it("under an attached work: the printing lands on the held book, which gains the work", async () => {
    const held = await heldCarrie();
    const { itemId, created } = await run(books.carrie, held);
    expect({ itemId, created }).toEqual({ itemId: held, created: true });
    const [item] = await sql`
      select cover_path, summary from items where id = ${held}`;
    expect(item.cover_path).toBe("openlibrary/600000002.jpg");
    expect(item.summary).toMatch(/^The story of misfit/);
    const [source] = await sql`
      select key from item_sources where item = ${held} and source = 'openlibrary'`;
    expect(source.key).toBe(works.carrie);
  });

  it("is idempotent by key, and by ISBN under another key", async () => {
    const first = await run(books.it);
    const before = await editionCount();
    expect(await run(books.it)).toEqual({ ...first, created: false });
    const carrie = await run(books.carrie);
    expect(await run(books.carrieAgain)).toEqual({
      ...carrie,
      created: false,
    });
    expect(await editionCount()).toBe(before);
  });

  it("is 409 when attachTo holds another work", async () => {
    const it1986 = await run(books.it);
    await expect(run(books.foreign, it1986.itemId)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(await editionFor(db, books.foreign, [])).toBeNull();
  });

  it("is not found for a key Open Library lacks", async () => {
    await expect(run(books.absent)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("an edition with only an ISBN-10 gets its 13 as the source", async () => {
    const { id } = await run(books.tenOnly);
    expect((await sourcesOf(id)).filter((s) => s.source === "isbn")).toEqual([
      { source: "isbn", key: isbn10to13(isbns.tenOnly), url: null },
    ]);
  });

  it("two imports of one printing at once leave one edition, both answering it", async () => {
    const before = await editionCount();
    const [a, b] = await Promise.all([run(books.raced), run(books.raced)]);
    expect(a.id).toBe(b.id);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(await editionCount()).toBe(before + 1);
  });
});

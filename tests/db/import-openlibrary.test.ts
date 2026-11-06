import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import {
  ConflictError,
  importFromOpenLibrary,
  NotFoundError,
} from "@/lib/catalog/import";
import { coverStoreFromEnv } from "@/lib/covers";
import {
  createOpenLibrary,
  type OpenLibrary,
} from "@/lib/providers/openlibrary";
import {
  type OpenLibraryStub,
  startOpenLibraryStub,
} from "../stub/openlibrary";
import { required } from "./harness";

// A6 against the local stack and real Storage. db files run side by side, so
// this one serves the recordings under its own work ids (OL7<id>W), its own
// cover ids, and titles carrying its tag, and attaches only to rows it made:
// no fixture row, and no row another file's matcher could pick up.

const RECORDINGS = join(process.cwd(), "tests/fixtures/openlibrary");
// biome-ignore lint/suspicious/noExplicitAny: raw Open Library JSON
const recorded = (name: string): any =>
  JSON.parse(readFileSync(join(RECORDINGS, name), "utf8"));

const it1986 = recorded("works-OL81613W.json");
const carrie = recorded("works-OL81626W.json");
const nightShift = recorded("works-OL81608W.json");
const author = recorded("authors-OL19981A.json");

const tag = crypto.randomUUID().slice(0, 8);
const titles = { carrie: `Carrie ${tag}`, nightShift: `Night Shift ${tag}` };
const keys = {
  it: "works/OL781613W",
  carrie: "works/OL781626W",
  nightShift: "works/OL781608W",
  nameless: "works/OL7000001W",
  noCover: "works/OL7000002W",
  absent: "works/OL7000003W",
  // A second Carrie no item holds yet: a known key answers with its item
  // before any attach is tried, so the refusals need a key that isn't in.
  otherCarrie: "works/OL7000004W",
};
const coverIds = { it: 700000001, carrie: 700000002, nightShift: 700000003 };

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
const covers = coverStoreFromEnv();
let dir: string;
let stub: OpenLibraryStub;
let ol: OpenLibrary;
const made: string[] = [];

async function held(
  type: "book" | "film",
  title: string,
  year: number,
  form: string | null,
  bookAuthor: string | null,
) {
  const [{ id }] = await sql`
    insert into items (type, title, form, released_on, released_precision, source_note)
    values (${type}, ${title}, ${form}, ${`${year}-01-01`}, 'year', ${tag})
    returning id`;
  if (bookAuthor) {
    await sql`insert into item_books (item, author) values (${id}, ${bookAuthor})`;
  }
  made.push(id);
  return id as string;
}

async function run(key: string, attachTo?: string) {
  const result = await importFromOpenLibrary(db, ol, covers, {
    key,
    attachTo,
  });
  made.push(result.id);
  return result;
}

async function itemRow(id: string) {
  const [row] = await sql`
    select i.type, i.form, i.title, i.released_on::text as released_on,
      i.released_precision, i.summary, i.created_by, i.cover_path, b.author
    from items i left join item_books b on b.item = i.id where i.id = ${id}`;
  return row;
}

const sourcesOf = async (id: string) =>
  (
    await sql`select source, key, url from item_sources where item = ${id} order by source`
  ).map((r) => ({ ...r }));

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "import-openlibrary-"));
  const copy = (key: string, body: object) =>
    writeFileSync(
      join(dir, `${key.replace("/", "-")}.json`),
      JSON.stringify(body),
    );
  copy(keys.it, { ...it1986, covers: [coverIds.it] });
  copy(keys.carrie, {
    ...carrie,
    title: titles.carrie,
    covers: [coverIds.carrie],
  });
  copy(keys.nightShift, {
    ...nightShift,
    title: titles.nightShift,
    covers: [coverIds.nightShift],
  });
  copy(keys.nameless, { title: `Nameless ${tag}`, authors: [] });
  copy(keys.otherCarrie, { ...carrie, title: titles.carrie, covers: [] });
  copy(keys.noCover, { ...it1986, title: `No cover ${tag}`, covers: [404] });
  copy("authors/OL19981A", author);
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

describe("importFromOpenLibrary", () => {
  it("a new book: the item, its author, its source and its cover", async () => {
    const { id, created } = await run(keys.it);
    expect(created).toBe(true);
    expect(await itemRow(id)).toMatchObject({
      type: "book",
      form: "novel",
      title: it1986.title,
      released_on: "1987-10-01",
      released_precision: "day",
      created_by: null,
      cover_path: `openlibrary/${coverIds.it}.jpg`,
      author: author.name,
    });
    expect((await itemRow(id)).summary).toMatch(/^"It" is a 1986 horror novel/);
    expect(await sourcesOf(id)).toEqual([
      {
        source: "openlibrary",
        key: keys.it,
        url: `https://openlibrary.org/${keys.it}`,
      },
    ]);
    const cover = await fetch(
      covers.publicUrl(`openlibrary/${coverIds.it}.jpg`),
    );
    expect(cover.status).toBe(200);
    expect(cover.headers.get("content-type")).toBe("image/jpeg");
  });

  it("the same key again is the same item, and nothing new", async () => {
    const first = await run(keys.it);
    const [{ n: before }] =
      await sql`select count(*)::int as n from items where id = any(${made})`;
    const again = await run(keys.it);
    expect(again).toEqual({ id: first.id, created: false });
    const [{ n: after }] =
      await sql`select count(*)::int as n from items where id = any(${made})`;
    expect(after).toBe(before);
  });

  it("attach onto a held Carrie: the source, the summary, the cover; title, form, author and year kept", async () => {
    const book = await held(
      "book",
      titles.carrie,
      1974,
      "novel",
      "Stephen King",
    );
    const { id, created } = await run(keys.carrie, book);
    expect({ id, created }).toEqual({ id: book, created: false });
    const row = await itemRow(book);
    expect(row).toMatchObject({
      title: titles.carrie,
      form: "novel",
      author: "Stephen King",
      released_on: "1974-01-01",
      released_precision: "year",
      cover_path: `openlibrary/${coverIds.carrie}.jpg`,
    });
    expect(row.summary).toMatch(/^The story of misfit high-school girl/);
    expect(row.summary).not.toMatch(/Also contained|https?:/);
    expect((await sourcesOf(book)).map((s) => s.source)).toEqual([
      "openlibrary",
    ]);
  });

  it("attach onto a held collection keeps its form and its 1977", async () => {
    const book = await held(
      "book",
      titles.nightShift,
      1977,
      "collection",
      "Stephen King",
    );
    await run(keys.nightShift, book);
    expect(await itemRow(book)).toMatchObject({
      form: "collection",
      released_on: "1977-01-01",
      released_precision: "year",
    });
  });

  it("refuses an attach onto a book with a source, a film, or another author's book, and changes nothing", async () => {
    const film = await held("film", titles.carrie, 1974, null, null);
    const other = await held(
      "book",
      titles.carrie,
      1974,
      "novel",
      "Someone Else",
    );
    const sourced = await held(
      "book",
      titles.carrie,
      1974,
      "novel",
      "Stephen King",
    );
    await sql`
      insert into item_sources (item, source, key)
      values (${sourced}, 'openlibrary', ${`works/OL7${Date.now()}W`})`;
    const before = await Promise.all([film, other, sourced].map(itemRow));
    for (const target of [sourced, film, other]) {
      await expect(run(keys.otherCarrie, target)).rejects.toBeInstanceOf(
        ConflictError,
      );
    }
    expect(await Promise.all([film, other, sourced].map(itemRow))).toEqual(
      before,
    );
  });

  it("a key Open Library lacks, or an attach target that isn't there, is not found", async () => {
    await expect(run(keys.absent)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      run(keys.nameless, crypto.randomUUID()),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a cover Open Library doesn't have leaves cover_path null", async () => {
    const { id, created } = await run(keys.noCover);
    expect(created).toBe(true);
    expect((await itemRow(id)).cover_path).toBeNull();
  });

  it("a work with no authors imports as Unknown", async () => {
    const { id } = await run(keys.nameless);
    expect((await itemRow(id)).author).toBe("Unknown");
  });
});

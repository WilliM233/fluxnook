import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { catalogStatuses } from "@/lib/catalog/match";
import {
  createOpenLibrary,
  type OpenLibraryWork,
} from "@/lib/providers/openlibrary";
import type { TmdbItem } from "@/lib/providers/tmdb";
import {
  type OpenLibraryStub,
  startOpenLibraryStub,
} from "../stub/openlibrary";
import { itemFor, required, signUpWithFixtures } from "./harness";

// A4's book rule against the loaded fixtures: a folded title and a folded
// author, never the year. The recordings' rows run under keys of this file's
// own (OL9<id>W), so a key another file or a by-hand import holds can't turn
// a match into `in`.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
let stub: OpenLibraryStub;
let carrieRows: OpenLibraryWork[];
let nightShiftRows: OpenLibraryWork[];
let user: { id: string };
let carrie: string;
let nightShift: string;
let runningMan: string;

const rekey = (row: OpenLibraryWork) => ({
  ...row,
  key: row.key.replace(/^works\/OL/, "works/OL9"),
});
const pick = (rows: OpenLibraryWork[], key: string) => {
  const found = rows.find((r) => r.key === key.replace("OL", "OL9"));
  if (!found) throw new Error(`no ${key} in the recording`);
  return found;
};
const made = (over: Partial<OpenLibraryWork>) => ({
  ...pick(carrieRows, "works/OL81626W"),
  key: `works/OL9${Math.floor(Math.random() * 1e9)}W`,
  ...over,
});

beforeAll(async () => {
  stub = await startOpenLibraryStub();
  const ol = createOpenLibrary({
    baseUrl: stub.baseUrl,
    coversBaseUrl: stub.coversBaseUrl,
    userAgent: "test",
  });
  carrieRows = (await ol.search("carrie")).results.map(rekey);
  nightShiftRows = (await ol.search("night shift")).results.map(rekey);
  user = await signUpWithFixtures(sql);
  carrie = await itemFor(sql, "manual", "carrie-1974");
  nightShift = await itemFor(sql, "manual", "night-shift-1977");
  runningMan = await itemFor(sql, "manual", "the-running-man-1981");
}, 60_000);

afterAll(async () => {
  await sql`delete from item_sources where source = 'openlibrary' and key like 'works/OL9%'`;
  await sql`delete from auth.users where id = ${user.id}`;
  await stub.close();
  await close();
  await sql.end();
});

const status = async (row: OpenLibraryWork | TmdbItem) =>
  (await catalogStatuses(db, { userId: user.id, rows: [row] }))[0];

describe("catalogStatuses for books", () => {
  it("Carrie matches the hand-added novel on title and author", async () => {
    expect(await status(pick(carrieRows, "works/OL81626W"))).toMatchObject({
      status: "match",
      itemId: carrie,
      title: "Carrie",
      year: 1974,
      author: "Stephen King",
      form: "novel",
      source: "manual",
      shelf: "Stephen King, publication order",
      shelfPosition: 1,
      contains: 0,
    });
  });

  it("Night Shift matches the 1977 collection despite Open Library's year", async () => {
    const row = pick(nightShiftRows, "works/OL81608W");
    expect(row.year).not.toBe(1977);
    expect(await status(row)).toMatchObject({
      status: "match",
      itemId: nightShift,
      year: 1977,
      form: "collection",
      shelfPosition: 4,
      contains: 16,
    });
  });

  it("the Works omnibus is new", async () => {
    expect(await status(pick(carrieRows, "works/OL14917547W"))).toEqual({
      status: "new",
    });
  });

  it("the same title by someone else is new", async () => {
    expect(await status(made({ authors: ["Someone Else"] }))).toEqual({
      status: "new",
    });
  });

  it("the author gates: The Running Man is Bachman's, not King's", async () => {
    const row = { title: "The Running Man", year: 1982 };
    expect(await status(made({ ...row, authors: ["Stephen King"] }))).toEqual({
      status: "new",
    });
    expect(
      await status(made({ ...row, authors: ["Richard Bachman"] })),
    ).toMatchObject({ status: "match", itemId: runningMan });
  });

  it("a row with no authors is new", async () => {
    expect(await status(made({ authors: [] }))).toEqual({ status: "new" });
  });

  it("a film titled Carrie in 1974 never matches the book", async () => {
    const film = {
      kind: "movie",
      key: "movie/999999990",
      title: "Carrie",
      year: 1974,
    } as TmdbItem;
    expect(await status(film)).not.toMatchObject({ itemId: carrie });
  });

  it("after an Open Library source on Carrie, Carrie is in", async () => {
    const row = pick(carrieRows, "works/OL81626W");
    await sql`
      insert into item_sources (item, source, key)
      values (${carrie}, 'openlibrary', ${row.key})`;
    expect(await status(row)).toEqual({ status: "in", itemId: carrie });
  });
});

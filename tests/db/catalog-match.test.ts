import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { catalogStatuses } from "@/lib/catalog/match";
import { createTmdb, type TmdbItem } from "@/lib/providers/tmdb";
import { startTmdbStub, type TmdbStub } from "../stub/tmdb";
import { itemFor, required, signUp, signUpWithFixtures } from "./harness";

// A4's three statuses for "carrie" against the loaded fixtures, after one
// attach of 1976 (a tmdb source on its Letterboxd row): 1976 in, 2013 match,
// The Carrie Diaries new.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
let stub: TmdbStub;
let rows: TmdbItem[];
let user: { id: string };
let bare: { id: string };
let carrie1976: string;
let carrie2013: string;
let rage: string;
let key1976: string;
const noteR7 = `rummage R7 ${crypto.randomUUID()}`;

const pick = (title: string, year: number) => {
  const found = rows.find((r) => r.title === title && r.year === year);
  if (!found) throw new Error(`no ${title} ${year} in the recording`);
  return found;
};
const made = (over: Partial<TmdbItem>) =>
  ({ ...pick("Carrie", 2013), ...over }) as TmdbItem;

beforeAll(async () => {
  stub = await startTmdbStub();
  const tmdb = createTmdb({
    apiKey: "stub",
    baseUrl: stub.baseUrl,
    imageBaseUrl: stub.imageBaseUrl,
  });
  // The recording's titles and years under keys of this file's own (800000000
  // + TMDB's id), so a key a by-hand import or another file holds can't
  // turn a match into `in`.
  rows = (await tmdb.search("carrie", 1)).results.map((row) => ({
    ...row,
    key: `${row.kind}/${800_000_000 + Number(row.key.split("/")[1])}`,
  }));
  user = await signUpWithFixtures(sql);
  bare = await signUp(sql);
  carrie1976 = await itemFor(sql, "letterboxd", "20ZQ");
  carrie2013 = await itemFor(sql, "letterboxd", "4kC2");
  rage = await itemFor(sql, "letterboxd", "20ZG");
  key1976 = pick("Carrie", 1976).key;
  await sql`
    insert into item_sources (item, source, key)
    values (${carrie1976}, 'tmdb', ${key1976})`;
}, 60_000);

afterAll(async () => {
  await sql`delete from items where title = '???' and source_note = ${noteR7}`;
  await sql`delete from item_sources where source = 'tmdb' and key = ${key1976}`;
  await sql`delete from auth.users where id in (${user.id}, ${bare.id})`;
  await stub.close();
  await close();
  await sql.end();
});

const status = async (row: TmdbItem, userId = user.id) =>
  (await catalogStatuses(db, { userId, rows: [row] }))[0];

describe("catalogStatuses for carrie", () => {
  it("1976, already attached, is in", async () => {
    expect(await status(pick("Carrie", 1976))).toEqual({
      status: "in",
      itemId: carrie1976,
    });
  });

  it("2013 matches the Letterboxd row, with its source and shelf", async () => {
    expect(await status(pick("Carrie", 2013))).toMatchObject({
      status: "match",
      itemId: carrie2013,
      title: "Carrie",
      year: 2013,
      source: "letterboxd",
      shelf: "Stephen King Watch List",
    });
  });

  it("The Rage: Carrie 2 matches its own row", async () => {
    expect(await status(pick("The Rage: Carrie 2", 1999))).toMatchObject({
      status: "match",
      itemId: rage,
    });
  });

  it("The Carrie Diaries is new: no tv item exists", async () => {
    expect(await status(pick("The Carrie Diaries", 2013))).toEqual({
      status: "new",
    });
  });

  it("a show never matches a film of the same title and year", async () => {
    expect(await status(made({ kind: "tv", key: "tv/999999999" }))).toEqual({
      status: "new",
    });
  });

  it("a year off by one matches; off by two does not", async () => {
    expect(
      await status(made({ key: "movie/999999998", year: 2014 })),
    ).toMatchObject({ status: "match", itemId: carrie2013 });
    expect(await status(made({ key: "movie/999999997", year: 2015 }))).toEqual({
      status: "new",
    });
  });

  it("two catalog rows in the window are both candidates", async () => {
    const result = await status(
      made({ key: "movie/999999996", title: "I Am the Doorway", year: 2017 }),
    );
    expect(result.status).toBe("match");
    if (result.status !== "match") return;
    expect(result.candidates.map((c) => c.year).sort()).toEqual([2017, 2018]);
  });

  // Rummage R7 (Raccoon N4): punctuation folds to nothing, and nothing is
  // not a title two items can share.
  it("a title that folds to nothing is new, even beside another such title", async () => {
    await sql`
      insert into items (type, title, released_on, released_precision, source_note)
      values ('film', '???', '2013-01-01', 'year', ${noteR7})`;
    expect(
      await status(made({ key: "movie/999999995", title: "...", year: 2013 })),
    ).toEqual({ status: "new" });
  });

  it("someone with no shelves sees the match with no shelf", async () => {
    expect(await status(pick("Carrie", 2013), bare.id)).toMatchObject({
      status: "match",
      itemId: carrie2013,
      shelf: null,
    });
  });
});

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { seriesStatuses } from "@/lib/catalog/match";
import {
  type ComicVineSeries,
  createComicVine,
} from "@/lib/providers/comicvine";
import { type ComicVineStub, startComicVineStub } from "../stub/comicvine";
import { required, signUp, signUpWithFixtures } from "./harness";

// A4's series rule against the loaded fixtures (Ch 1.4, with 1.4.1 Q1 and
// Q2, L): a folded name, a first year within 1 and the label's publisher for
// a series group; a title stem and the series of what the editions hold for
// a collected group. The recordings' rows run under keys of this file's own
// (volume/9<id>), so a key another file holds can't turn a match into `in`.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
const tag = `catalog-match-comics ${crypto.randomUUID()}`;
let stub: ComicVineStub;
let turtles: ComicVineSeries[];
let ultimate: ComicVineSeries[];
let tmntUltimate: ComicVineSeries[];
let user: { id: string };
let stranger: { id: string };

const rekey = (row: ComicVineSeries) => ({
  ...row,
  key: row.key.replace(/^volume\//, "volume/9"),
});
const pick = (rows: ComicVineSeries[], id: number) => {
  const found = rows.find((r) => r.key === `volume/9${id}`);
  if (!found) throw new Error(`no volume/${id} in the recording`);
  return found;
};

beforeAll(async () => {
  stub = await startComicVineStub();
  const cv = createComicVine({
    apiKey: "k",
    baseUrl: stub.baseUrl,
    userAgent: "test",
  });
  turtles = (await cv.search("teenage mutant ninja turtles")).map(rekey);
  ultimate = (await cv.search("ultimate collection")).map(rekey);
  tmntUltimate = (
    await cv.search("teenage mutant ninja turtles ultimate collection")
  ).map(rekey);
  user = await signUpWithFixtures(sql);
  stranger = await signUp(sql);
}, 60_000);

afterAll(async () => {
  await sql`delete from items where title like ${`${tag}%`}`;
  await sql`delete from series where name = ${tag}`;
  await sql`delete from auth.users where id in (${user.id}, ${stranger.id})`;
  await stub.close();
  await close();
  await sql.end();
});

const status = async (row: ComicVineSeries, userId = user.id) =>
  (await seriesStatuses(db, { userId, rows: [row] }))[0];

describe("seriesStatuses, the series arm", () => {
  it("1984 matches the Vol. 1 group of 62 on the Mirage shelf", async () => {
    expect(await status(pick(turtles, 20281))).toMatchObject({
      status: "match",
      group: "series",
      label: "Teenage Mutant Ninja Turtles (Mirage) Vol. 1",
      count: 62,
      earliest: 1984,
      shelf: "TMNT, the Mirage run",
    });
  });

  it("1993 Mirage matches the Vol. 2 group of 13", async () => {
    expect(await status(pick(turtles, 20295))).toMatchObject({
      status: "match",
      label: "Teenage Mutant Ninja Turtles (Mirage) Vol. 2",
      count: 13,
      earliest: 1993,
    });
  });

  it("1996 Image matches the Image Vol. 3 group of 23", async () => {
    expect(await status(pick(turtles, 11889))).toMatchObject({
      status: "match",
      label: "Teenage Mutant Ninja Turtles (Image) Vol. 3",
      count: 23,
      earliest: 1996,
    });
  });

  it("the IDW 2011 volume is new", async () => {
    expect(await status(pick(turtles, 42285))).toEqual({ status: "new" });
  });

  it("1993 TM-Semic is new: the label names Mirage (1.4.1 Q2)", async () => {
    expect(await status(pick(turtles, 166258))).toEqual({ status: "new" });
  });

  it("2003 Dreamwave is new: within a year of Vol. 4, but not Mirage (1.4.1 Q2)", async () => {
    expect(await status(pick(turtles, 35309))).toEqual({ status: "new" });
  });

  it("a volume whose publisher differs from the label's is new; with none, too", async () => {
    const row = pick(turtles, 20281);
    expect(await status({ ...row, publisher: "Image" })).toEqual({
      status: "new",
    });
    expect(await status({ ...row, publisher: null })).toEqual({
      status: "new",
    });
  });

  it("a label with no parenthetical matches whatever the publisher", async () => {
    const row = {
      ...pick(turtles, 20281),
      name: "Tales of the Teenage Mutant Ninja Turtles",
      year: 1987,
      publisher: "Anyone at all",
    };
    expect(await status(row)).toMatchObject({
      status: "match",
      label: "Tales of the Teenage Mutant Ninja Turtles",
      count: 7,
    });
  });

  it("a volume with no start year is new", async () => {
    expect(await status({ ...pick(turtles, 20281), year: null })).toEqual({
      status: "new",
    });
  });

  it("Teenage Mutant Ninja Turtles Adventures is new", async () => {
    expect(await status(pick(turtles, 30661))).toEqual({ status: "new" });
  });

  it("a 1985 start still matches 1984; a 1986 start doesn't", async () => {
    const row = pick(turtles, 20281);
    expect(await status({ ...row, year: 1985 })).toMatchObject({
      status: "match",
      count: 62,
    });
    expect(await status({ ...row, year: 1986 })).toEqual({ status: "new" });
  });

  it("another account sees the same match with no shelf", async () => {
    expect(await status(pick(turtles, 20281), stranger.id)).toMatchObject({
      status: "match",
      count: 62,
      shelf: null,
    });
  });
});

describe("seriesStatuses, the collected arm", () => {
  // The five are owned, not shelved: the fixture shelves the issues they hold.
  it("the TMNT Ultimate Collection matches the five by their stem", async () => {
    expect(await status(pick(tmntUltimate, 50804))).toMatchObject({
      status: "match",
      group: "collected",
      label: "Ultimate Collection",
      count: 5,
      earliest: null,
      shelf: null,
    });
  });

  it("New X-Men Ultimate Collection is new: nothing the five hold is X-Men (1.4.1 Q1)", async () => {
    expect(await status(pick(ultimate, 30219))).toEqual({ status: "new" });
  });

  it("no row of the 'ultimate collection' search matches the five", async () => {
    const statuses = await seriesStatuses(db, {
      userId: user.id,
      rows: ultimate,
    });
    expect(statuses.every((s) => s.status === "new")).toBe(true);
  });

  it("a collected group whose editions hold nothing never matches", async () => {
    await sql`
      insert into items (type, title, form)
      values ('comic', ${`${tag} Zebra Omnibus 1`}, 'collected')`;
    const row = {
      ...pick(turtles, 20281),
      name: `${tag} Zebra Omnibus`,
      year: null,
    };
    expect(await status(row)).toEqual({ status: "new" });
  });
});

describe("seriesStatuses, in", () => {
  it("a volume whose key is a series' source is in, with that series", async () => {
    const row = pick(turtles, 20281);
    const [{ id }] = await sql`
      insert into series (name) values (${tag}) returning id`;
    await sql`
      insert into series_sources (series, source, key)
      values (${id}, 'comicvine', ${row.key})`;
    expect(await status(row)).toEqual({ status: "in", seriesId: id });
  });

  it("answers a page in its order, whatever its size", async () => {
    const statuses = await seriesStatuses(db, {
      userId: user.id,
      rows: turtles,
    });
    expect(statuses).toHaveLength(turtles.length);
    expect(statuses[turtles.indexOf(pick(turtles, 42285))]).toEqual({
      status: "new",
    });
  });
});

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import {
  groupOptions,
  seriesGroups,
  seriesStatuses,
} from "@/lib/catalog/match";
import { importSeriesFromComicVine } from "@/lib/catalog/series";
import { coverStoreFromEnv } from "@/lib/covers";
import {
  type ComicVine,
  type ComicVineSeries,
  createComicVine,
} from "@/lib/providers/comicvine";
import { type ComicVineStub, startComicVineStub } from "../stub/comicvine";
import {
  itemFor,
  required,
  resetComicVine,
  signUp,
  signUpWithFixtures,
} from "./harness";

// A4's series rule against the loaded fixtures (Ch 1.4, with 1.4.1 Q1 and
// Q2, L): a folded name, a first year within 1 and the label's publisher for
// a series group; a title stem and the series of what the editions hold for
// a collected group. The recordings' rows run under keys of this file's own
// (volume/9<id>), so a key another file holds can't turn a match into `in`.
// Then the Browse's three imports run on the fixture rows under the real
// keys, last, since they turn those groups into series; this is the only
// file that holds the real keys, and it puts the rows back after.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
const tag = `catalog-match-comics ${crypto.randomUUID()}`;
let stub: ComicVineStub;
let cv: ComicVine;
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
  // A run left over from a crashed file would read as `in` below.
  await resetComicVine(sql);
  cv = createComicVine({
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
  await resetComicVine(sql);
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

  // Rummage R3 (1.4.1): a second collected group whose stem is one generic
  // word ("Collection") also sits inside the volume's name, and if one of
  // its editions holds a Mirage issue it passes Q1's gate too. Sorted by
  // label it comes first, so the row says "1 collected editions" and 1.4.2's
  // Same would attach the seven volumes onto it. The likeliest group leads:
  // the longer stem, then the larger count.
  it("the five lead a one-edition group with a shorter stem", async () => {
    const mirage1 = await itemFor(sql, "manual", "tmnt-mirage-v1-1");
    const [{ id: other }] = await sql`
      insert into items (type, title, form)
      values ('comic', 'Collection 1', 'collected') returning id`;
    try {
      const [{ id: edition }] = await sql`
        insert into editions (item, format) values (${other}, 'tpb') returning id`;
      await sql`
        insert into edition_contents (edition, item, position)
        values (${edition}, ${mirage1}, 1)`;
      const found = await status(pick(tmntUltimate, 50804));
      expect(found).toMatchObject({
        status: "match",
        group: "collected",
        label: "Ultimate Collection",
        count: 5,
      });
      expect(found.status === "match" && found.candidates).toHaveLength(2);
    } finally {
      await sql`delete from items where id = ${other}`;
    }
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

describe("seriesGroups, for the sheet's select", () => {
  // The fixture's own labels, read off the file: other db files add runs by
  // hand beside this one, so the check is on these, never a whole list.
  const mirage = JSON.parse(
    readFileSync(
      join(process.cwd(), "supabase/seed/fixtures/tmnt-mirage.json"),
      "utf8",
    ),
  ).items as { series?: string | null }[];
  const labels = new Set(
    mirage.map((item) => item.series).filter((s): s is string => Boolean(s)),
  );

  it("lists the fixture's 25 series groups and its one collected stem, by label", async () => {
    const options = groupOptions(await seriesGroups(db)).filter(
      (g) =>
        (g.group === "series" && labels.has(g.label)) ||
        (g.group === "collected" && g.label === "Ultimate Collection"),
    );
    expect(labels.size).toBe(25);
    expect(options.filter((g) => g.group === "series")).toHaveLength(25);
    expect(options).toContainEqual({
      group: "collected",
      label: "Ultimate Collection",
      count: 5,
    });
    expect(options).toContainEqual({
      group: "series",
      label: "Teenage Mutant Ninja Turtles (Mirage) Vol. 1",
      count: 62,
    });
    expect(options).toContainEqual({
      group: "series",
      label: "Tales of the Teenage Mutant Ninja Turtles Vol. 2",
      count: 70,
    });
    const sorted = [...options].sort((a, b) => a.label.localeCompare(b.label));
    expect(options).toEqual(sorted);
  });

  it("leaves out a group any of whose items carries a Comic Vine source, whole", async () => {
    const label = `${tag} part-attached`;
    const ids: string[] = [];
    for (const n of [1, 2]) {
      const [{ id }] = await sql`
        insert into items (type, form, title) values ('comic', 'issue', ${`${tag} pa ${n}`})
        returning id`;
      await sql`
        insert into item_comics (item, series, number) values (${id}, ${label}, ${n})`;
      ids.push(id);
    }
    const listed = async () =>
      (await seriesGroups(db)).filter((g) => g.label === label);
    expect(await listed()).toHaveLength(1);
    await sql`
      insert into item_sources (item, source, key)
      values (${ids[0]}, 'comicvine', ${`issue/9${Date.now()}`})`;
    expect(await listed()).toEqual([]);
  });
});

// The fixture's own ids, read off the files as fixtures-load.test.ts does,
// so the counts below are this walk's whatever other files write beside it.
const FIXTURES = join(process.cwd(), "supabase/seed/fixtures");
const fixtureIds = readdirSync(FIXTURES)
  .filter((name) => name.endsWith(".json"))
  .flatMap(
    (name) =>
      JSON.parse(readFileSync(join(FIXTURES, name), "utf8")).items as {
        id: string;
      }[],
  )
  .map((item) => item.id);

const imported = (
  key: string,
  attachTo: { series: string } | { collected: string },
  form: "issue" | "collected" = "issue",
) =>
  importSeriesFromComicVine(db, cv, coverStoreFromEnv(), {
    key,
    form,
    format: form === "collected" ? "hardcover" : undefined,
    attachTo,
  });

const fixtureItem = (key: string) => itemFor(sql, "manual", key);

// A5 and A14 on the loaded fixtures, in the Browse's order. Only this file
// imports the three real volumes, and it does so after every status test
// above has read the groups as the loader left them.
describe("the import on the fixtures", () => {
  let mirage: string;
  let tales: string;
  let ultimateSeries: string;

  it("attaches the Mirage run to the Vol. 1 group: 62 attached, none created, the held titles kept", async () => {
    const result = await imported("volume/20281", {
      series: "Teenage Mutant Ninja Turtles (Mirage) Vol. 1",
    });
    expect(result).toMatchObject({ created: 0, attached: 62, known: false });
    mirage = result.id;
    const run = await sql`
      select i.title, i.summary, i.cover_path, c.number,
        (select key from item_sources s where s.item = i.id and s.source = 'comicvine') as key
      from items i join item_comics c on c.item = i.id
      where c.series_id = ${mirage} order by c.number`;
    expect(run).toHaveLength(62);
    expect(run.every((row) => row.key?.startsWith("issue/"))).toBe(true);
    expect(run.slice(0, 3).map((row) => row.title)).toEqual([
      "The Turtles' Origin is Told",
      "TMNT vs. the Mousers",
      "The Great Chase",
    ]);
    expect(run[0].summary).toMatch(/^The Turtles are cornered/);
    expect(run[0].cover_path).toBe("comicvine/issue-121041.jpg");
    const [series] = await sql`select * from series where id = ${mirage}`;
    expect(series).toMatchObject({
      name: "Teenage Mutant Ninja Turtles",
      volume: 1,
      year_began: 1984,
      year_ended: 1993,
      publisher: "Mirage",
      summary: "Volume 1.",
      cover_path: "comicvine/volume-20281.jpg",
    });
  });

  it("says 1984 is in after that import, with that series (A4)", async () => {
    const [row] = (await cv.search("teenage mutant ninja turtles")).filter(
      (r) => r.key === "volume/20281",
    );
    expect(await status(row)).toEqual({ status: "in", seriesId: mirage });
  });

  it("attaches Tales of the TMNT to the picked Tales Vol. 2 group: 70 attached, #71 created", async () => {
    const label = "Tales of the Teenage Mutant Ninja Turtles Vol. 2";
    const result = await imported("volume/18785", { series: label });
    expect(result).toMatchObject({ created: 1, attached: 70 });
    tales = result.id;
    const [created] = await sql`
      select i.title, i.released_on::text, i.released_precision, c.series, c.number
      from items i join item_comics c on c.item = i.id
      where c.series_id = ${tales} and c.number = 71`;
    expect(created).toEqual({
      title: "The Paradox of Chudnovsky",
      released_on: "2011-06-01",
      released_precision: "month",
      series: label,
      number: 71,
    });
    const forty = await fixtureItem("tmnt-mirage-tales-v2-40");
    const [held] = await sql`
      select i.title, c.series_id from items i join item_comics c on c.item = i.id
      where i.id = ${forty}`;
    expect(held).toEqual({ title: "Silent Night", series_id: tales });
    const [series] = await sql`
      select volume, year_began, year_ended, publisher,
        (select count(*)::int from item_comics where series_id = ${tales}) as issues
      from series where id = ${tales}`;
    expect(series).toEqual({
      volume: 2,
      year_began: 2004,
      year_ended: 2011,
      publisher: "Mirage",
      issues: 71,
    });
  });

  it("attaches the Ultimate Collection to the stem as hardcovers: 5 attached, 2 created, the 37 contents untouched", async () => {
    const result = await imported(
      "volume/50804",
      { collected: "Ultimate Collection" },
      "collected",
    );
    expect(result).toMatchObject({ created: 2, attached: 5 });
    ultimateSeries = result.id;
    const editions = await sql`
      select i.title, e.released_on::text, e.released_precision, e.publisher,
        (select count(*)::int from edition_sources es
          where es.edition = e.id and es.source = 'comicvine') as comicvine,
        (select count(*)::int from edition_contents ec where ec.edition = e.id) as contents
      from editions e join items i on i.id = e.item
      join item_comics c on c.item = i.id
      where c.series_id = ${ultimateSeries} order by c.number`;
    expect(editions.map((e) => e.title)).toEqual([
      "Ultimate Collection 1",
      "Ultimate Collection 2",
      "Ultimate Collection 3",
      "Ultimate Collection 4",
      "Ultimate Collection 5",
      "Ultimate Collection 6",
      "Ultimate Collection 7",
    ]);
    expect(editions.every((e) => e.comicvine === 1)).toBe(true);
    expect(editions[0]).toMatchObject({
      released_on: "2011-08-01",
      released_precision: "month",
      publisher: "IDW Publishing",
    });
    expect(editions.reduce((n, e) => n + e.contents, 0)).toBe(37);
    expect(editions.slice(5).map((e) => e.contents)).toEqual([0, 0]);
  });

  it("answers a second post of volume/20281 as known, writing nothing", async () => {
    const before = await walkCounts();
    expect(
      await imported("volume/20281", {
        series: "Teenage Mutant Ninja Turtles (Mirage) Vol. 1",
      }),
    ).toEqual({ id: mirage, created: 0, attached: 0, known: true });
    expect(await walkCounts()).toEqual(before);
  });

  it("counts as the Browse does", async () => {
    // item_comics is 369, not section 0's 368: Tales #71 is a created comic
    // too, beside the two created collecteds (1.4.2 handoff).
    expect(await walkCounts()).toEqual({
      items: 457,
      item_sources: 594,
      series: 3,
      series_sources: 3,
      item_comics: 369,
      with_series: 140,
      editions: 7,
      edition_sources: 12,
      edition_contents: 37,
    });
  });

  /** The Browse's count block over the fixture's rows and this walk's three series. */
  async function walkCounts() {
    const mine = [mirage, tales, ultimateSeries];
    const scope = sql`
      select item from item_sources
        where source <> 'comicvine' and source || ':' || key = any(${fixtureIds})
      union select item from item_comics where series_id = any(${mine})`;
    const scopedEditions = sql`select id from editions where item in (${scope})`;
    const [counts] = await sql`
      select
        (select count(*)::int from items where id in (${scope})) as items,
        (select count(*)::int from item_sources where item in (${scope})) as item_sources,
        (select count(*)::int from series where id = any(${mine})) as series,
        (select count(*)::int from series_sources where series = any(${mine})) as series_sources,
        (select count(*)::int from item_comics where item in (${scope})) as item_comics,
        (select count(*)::int from item_comics where series_id = any(${mine})) as with_series,
        (select count(*)::int from editions where id in (${scopedEditions})) as editions,
        (select count(*)::int from edition_sources where edition in (${scopedEditions})) as edition_sources,
        (select count(*)::int from edition_contents where edition in (${scopedEditions})) as edition_contents`;
    return counts;
  }
});

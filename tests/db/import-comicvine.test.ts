import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb } from "@/db/client";
import { ConflictError, NotFoundError } from "@/lib/catalog/import";
import { importSeriesFromComicVine } from "@/lib/catalog/series";
import { coverStoreFromEnv } from "@/lib/covers";
import {
  type ComicVine,
  createComicVine,
  ProviderError,
} from "@/lib/providers/comicvine";
import { type ComicVineStub, startComicVineStub } from "../stub/comicvine";
import { required } from "./harness";

// A5 against the local stack and real Storage. db files run side by side, so
// this one serves copies of the recordings under ids of its own (volumes
// 7<id> and 730nn, issues prefixed 9 or 93n; the status file holds
// volume/9<id> and the real keys) and attaches only to rows it makes: no
// fixture row, and no key another file holds.

const RECORDINGS = join(process.cwd(), "tests/fixtures/comicvine");
// biome-ignore lint/suspicious/noExplicitAny: raw Comic Vine JSON
const recorded = (name: string): any =>
  JSON.parse(readFileSync(join(RECORDINGS, name), "utf8"));
// biome-ignore lint/suspicious/noExplicitAny: raw Comic Vine JSON
type RawIssue = any;

const THIS_YEAR = new Date().getUTCFullYear();
const ids = {
  mirage: 720281,
  ultimate: 750804,
  tales1987: 718790,
  oneShot: 730001,
  odd: 730002,
  thisYear: 730003,
  lostCover: 730004,
  race: 730005,
  attachRun: 730010,
  attachedElsewhere: 730011,
  omnibus: 730012,
  treasury: 730013,
  annual: 730014,
  attachRace: 730015,
  tradesRun: 730016,
};
// Letters and digits only, so its fold is itself: the stems and the series
// fold the collected rule reads are this file's own.
const tag = `T${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
const runLabel = `${tag} Run Vol. 3`;

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
const covers = coverStoreFromEnv();
let dir: string;
let stub: ComicVineStub;
let cv: ComicVine;

/**
 * A copy of a recorded volume and its issues under a new volume id, every
 * issue id prefixed so no key collides; `issues` and `volume` tweak the copy.
 */
function copy(
  from: number,
  to: number,
  prefix: string,
  {
    issues: tweakIssues = (rows: RawIssue[]) => rows,
    volume: tweakVolume = (v: RawIssue) => v,
    withIssues = true,
  }: {
    issues?: (rows: RawIssue[]) => RawIssue[];
    volume?: (v: RawIssue) => RawIssue;
    withIssues?: boolean;
  } = {},
) {
  const volume = recorded(`volume-${from}.json`);
  volume.results = tweakVolume({ ...volume.results, id: to });
  writeFileSync(join(dir, `volume-${to}.json`), JSON.stringify(volume));
  if (!withIssues) return;
  const list = recorded(`issues-${from}-o0.json`);
  list.results = tweakIssues(
    list.results.map((issue: RawIssue) => ({
      ...issue,
      id: Number(`${prefix}${issue.id}`),
    })),
  );
  list.number_of_total_results = list.results.length;
  list.number_of_page_results = list.results.length;
  writeFileSync(join(dir, `issues-${to}-o0.json`), JSON.stringify(list));
}

const counts = async () => {
  const [row] = await sql<{ series: number; items: number }[]>`
    select (select count(*)::int from series) as series,
      (select count(*)::int from items) as items`;
  return row;
};

const seriesRow = async (id: string) => {
  const [row] = await sql`select * from series where id = ${id}`;
  return row;
};

const run = (id: string) => sql`
  select i.id, i.title, i.form, i.summary, i.released_on::text, i.released_precision,
    i.cover_path, c.series, c.series_id, c.number, s.key, s.url
  from item_comics c
  join items i on i.id = c.item
  join item_sources s on s.item = i.id and s.source = 'comicvine'
  where c.series_id = ${id}
  order by i.released_on nulls last, c.number nulls last, i.title`;

const importVolume = (
  id: number,
  form: "issue" | "collected" = "issue",
  format?: "hardcover",
) =>
  importSeriesFromComicVine(db, cv, covers, {
    key: `volume/${id}`,
    form,
    format,
  });

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "import-comicvine-"));
  copy(20281, ids.mirage, "9");
  copy(50804, ids.ultimate, "9");
  copy(18790, ids.tales1987, "9", { withIssues: false });
  copy(20281, ids.oneShot, "931", {
    issues: (rows) => rows.slice(0, 1),
    volume: (v) => ({ ...v, count_of_issues: 1 }),
  });
  copy(20281, ids.odd, "932", {
    issues: (rows) => [
      rows[0],
      { ...rows[1], issue_number: "1.5" },
      { ...rows[2], cover_date: null },
    ],
  });
  copy(20281, ids.thisYear, "933", {
    issues: (rows) => [
      rows[0],
      { ...rows[1], cover_date: `${THIS_YEAR}-01-31` },
    ],
    volume: (v) => ({ ...v, count_of_issues: 2 }),
  });
  copy(20281, ids.lostCover, "934", {
    issues: (rows) => rows.slice(0, 2),
    volume: (v) => ({
      ...v,
      count_of_issues: 2,
      image: {
        ...v.image,
        original_url: v.image.original_url.replace(/[^/]+$/, "missing-$&"),
      },
    }),
  });
  copy(20281, ids.race, "935");
  const firstFour = (rows: RawIssue[]) =>
    ["1", "2", "3", "4"].map((n) => rows.find((row) => row.issue_number === n));
  copy(20281, ids.attachRun, "936", { issues: firstFour });
  copy(20281, ids.attachedElsewhere, "937", { issues: firstFour });
  const firstThree = (rows: RawIssue[]) => rows.slice(0, 3);
  copy(50804, ids.omnibus, "938", {
    issues: firstThree,
    volume: (v) => ({ ...v, name: `${tag} Run: The ${tag} Omnibus` }),
  });
  copy(50804, ids.treasury, "939", {
    issues: firstThree,
    volume: (v) => ({ ...v, name: `${tag} Run Treasury` }),
  });
  copy(50804, ids.annual, "940", {
    issues: firstThree,
    volume: (v) => ({ ...v, name: `${tag} Run ${tag} Annual` }),
  });
  copy(20281, ids.attachRace, "941", { issues: firstFour });
  copy(50804, ids.tradesRun, "943", { issues: (rows) => rows.slice(0, 2) });
  stub = await startComicVineStub({ dir });
  cv = createComicVine({ apiKey: "k", baseUrl: stub.baseUrl, userAgent: "t" });
});

afterAll(async () => {
  const keys = Object.values(ids).map((id) => `volume/${id}`);
  const mine = sql`
    select series from series_sources
    where source = 'comicvine' and key = any(${keys})`;
  // Only the covers this file's rows hold: another file's import of a real
  // key may share a prefix.
  const paths = await sql<{ path: string }[]>`
    select cover_path as path from series
      where id in (${mine}) and cover_path is not null
    union select i.cover_path from items i join item_comics c on c.item = i.id
      where c.series_id in (${mine}) and i.cover_path is not null`;
  await sql`
    delete from items where id in (
      select item from item_comics where series_id in (${mine}))`;
  await sql`delete from items where title like ${`${tag}%`}`;
  await sql`delete from series where id in (${mine})`;
  if (paths.length) await covers.remove(paths.map((p) => p.path));
  await stub.close();
  rmSync(dir, { recursive: true, force: true });
  await close();
  await sql.end();
});

describe("importSeriesFromComicVine, a new run", () => {
  let mirage: string;

  it("brings the 1984 run in: 62 created, the series named and dated, its source on Comic Vine's host", async () => {
    const result = await importVolume(ids.mirage);
    expect(result).toMatchObject({ created: 62, attached: 0, known: false });
    mirage = result.id;
    const row = await seriesRow(mirage);
    expect(row).toMatchObject({
      name: "Teenage Mutant Ninja Turtles",
      volume: null,
      year_began: 1984,
      year_ended: 1993,
      publisher: "Mirage",
      kind: null,
      summary: "Volume 1.",
    });
    const [source] = await sql`
      select url from series_sources where series = ${mirage}`;
    expect(source.url).toMatch(/^https:\/\/comicvine\.gamespot\.com\//);
    expect(await run(mirage)).toHaveLength(62);
  });

  it("titles a nameless issue '<series> #n' and keeps Comic Vine's names; dates at the cover month", async () => {
    const issues = await run(mirage);
    const [one, two] = issues;
    expect(one).toMatchObject({
      title: "Teenage Mutant Ninja Turtles #1",
      form: "issue",
      released_on: "1984-05-01",
      released_precision: "month",
      series: "Teenage Mutant Ninja Turtles",
      series_id: mirage,
      number: 1,
      key: "issue/9121041",
    });
    expect(one.summary).toMatch(/^The Turtles are cornered/);
    expect(two.title).toBe("TMNT vs. the Mousers");
    expect(issues.filter((i) => /#\d+$/.test(i.title))).toHaveLength(8);
  });

  it("caches the series' cover and #1's, both in Storage", async () => {
    const row = await seriesRow(mirage);
    expect(row.cover_path).toBe(`comicvine/volume-${ids.mirage}.jpg`);
    const [one] = await run(mirage);
    expect(one.cover_path).toBe("comicvine/issue-9121041.jpg");
    const objects = await sql`
      select name from storage.objects where bucket_id = 'covers'
        and name in (${row.cover_path}, ${one.cover_path})`;
    expect(objects).toHaveLength(2);
  });

  it("answers a second import of the same volume as known, writing nothing", async () => {
    const before = await counts();
    const again = await importVolume(ids.mirage);
    expect(again).toEqual({ id: mirage, created: 0, attached: 0, known: true });
    expect(await counts()).toEqual(before);
  });

  it("makes a one-issue volume a one-shot", async () => {
    const { id } = await importVolume(ids.oneShot);
    const issues = await run(id);
    expect(issues.map((i) => i.form)).toEqual(["one-shot"]);
  });

  it("keeps a non-integer number in the title and none in the column; no cover date, no date; a count that disagrees, no end year", async () => {
    const { id } = await importVolume(ids.odd);
    const issues = await run(id);
    const odd = issues.find((i) => i.key === "issue/932121062");
    expect(odd).toMatchObject({ title: "TMNT vs. the Mousers", number: null });
    const undated = issues.find((i) => i.released_on === null);
    expect(undated?.released_precision).toBeNull();
    expect((await seriesRow(id)).year_ended).toBeNull();
  });

  it("leaves the end year off a run whose last cover is this year", async () => {
    const { id } = await importVolume(ids.thisYear);
    expect((await seriesRow(id)).year_ended).toBeNull();
  });

  it("brings the Ultimate Collection in as collected: 7 items, each with one hardcover edition and its source", async () => {
    const { id, created } = await importVolume(
      ids.ultimate,
      "collected",
      "hardcover",
    );
    expect(created).toBe(7);
    const issues = await run(id);
    expect(issues.map((i) => i.title)).toEqual(
      [1, 2, 3, 4, 5, 6, 7].map(
        (n) =>
          `Teenage Mutant Ninja Turtles: The Ultimate Collection Vol. ${n}`,
      ),
    );
    expect(issues.map((i) => i.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(issues.map((i) => i.form))).toEqual(new Set(["collected"]));
    const editions = await sql`
      select e.item, e.format, e.released_on::text, e.released_precision,
        e.publisher, es.key
      from editions e join edition_sources es on es.edition = e.id
      where e.item = any(${issues.map((i) => i.id)}) and es.source = 'comicvine'
      order by e.released_on`;
    expect(editions).toHaveLength(7);
    expect(editions[0]).toMatchObject({
      format: "hardcover",
      released_on: "2011-08-01",
      released_precision: "month",
      publisher: "IDW Publishing",
    });
    expect((await seriesRow(id)).year_ended).toBe(2023);
  });

  it("ends two imports of the same volume at once with one series and 62 items", async () => {
    const before = await counts();
    const [a, b] = await Promise.all([
      importVolume(ids.race),
      importVolume(ids.race),
    ]);
    expect(a.id).toBe(b.id);
    expect([a.known, b.known].sort()).toEqual([false, true]);
    const after = await counts();
    expect(after.series - before.series).toBe(1);
    expect(after.items - before.items).toBe(62);
  });

  it("answers an unknown volume as NotFoundError, and an issue key too", async () => {
    await expect(importVolume(7000001)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      importSeriesFromComicVine(db, cv, covers, {
        key: "issue/121041",
        form: "issue",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws a ProviderError for a volume with no issues recording, and writes nothing", async () => {
    const said = vi.spyOn(console, "error").mockImplementation(() => {});
    const before = await counts();
    await expect(importVolume(ids.tales1987)).rejects.toBeInstanceOf(
      ProviderError,
    );
    expect(await counts()).toEqual(before);
    said.mockRestore();
  });

  it("outlives a volume cover that 404s: the series has none, the issues have theirs, one line names the key", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { id, created } = await importVolume(ids.lostCover);
    expect(created).toBe(2);
    expect((await seriesRow(id)).cover_path).toBeNull();
    const issues = await run(id);
    expect(issues.every((i) => i.cover_path !== null)).toBe(true);
    const lines = warned.mock.calls.map((call) => String(call[0]));
    expect(lines).toEqual([
      `import volume/${ids.lostCover}: cover not cached (cover answered 404)`,
    ]);
    expect(lines.join(" ")).not.toMatch(/http/);
    warned.mockRestore();
  });
});

/** A hand-entered comic the attach tests aim at, tagged for the cleanup. */
async function held(
  title: string,
  {
    form = "issue",
    series = null,
    number = null,
    year = null,
    summary = null,
    comicRow = true,
  }: {
    form?: "issue" | "collected";
    series?: string | null;
    number?: number | null;
    year?: number | null;
    summary?: string | null;
    comicRow?: boolean;
  } = {},
) {
  const [row] = await sql<{ id: string }[]>`
    insert into items (type, form, title, released_on, released_precision, summary)
    values ('comic', ${form}, ${title}, ${year ? `${year}-01-01` : null},
      ${year ? "year" : null}, ${summary})
    returning id`;
  if (comicRow) {
    await sql`
      insert into item_comics (item, series, number, series_kind)
      values (${row.id}, ${series}, ${number}, ${series ? "ongoing" : null})`;
  }
  return row.id;
}

/** A hardcover under a held collected, holding the given comics in order. */
async function hardcover(itemId: string, holds: string[] = []) {
  const [edition] = await sql<{ id: string }[]>`
    insert into editions (item, format) values (${itemId}, 'hardcover')
    returning id`;
  for (const [i, item] of holds.entries()) {
    await sql`
      insert into edition_contents (edition, item, position)
      values (${edition.id}, ${item}, ${i + 1})`;
  }
  return edition.id;
}

const comic = async (id: string) => {
  const [row] = await sql`
    select i.title, i.form, i.summary, i.released_on::text, i.released_precision,
      c.series, c.series_kind, c.series_id, c.number,
      (select key from item_sources s where s.item = i.id and s.source = 'comicvine') as key
    from items i left join item_comics c on c.item = i.id where i.id = ${id}`;
  return row;
};

const attachVolume = (
  id: number,
  attachTo: { series: string } | { collected: string },
  form: "issue" | "collected" = "issue",
) =>
  importSeriesFromComicVine(db, cv, covers, {
    key: `volume/${id}`,
    form,
    format: form === "collected" ? "hardcover" : undefined,
    attachTo,
  });

describe("importSeriesFromComicVine, onto a run added by hand", () => {
  const run: Record<number, string> = {};
  const omnibus: Record<number, string> = {};
  let omnibusEdition: string;

  beforeAll(async () => {
    run[1] = await held(`${tag} the first`, {
      series: runLabel,
      number: 1,
      year: 1984,
    });
    run[2] = await held(`${tag} the second`, {
      series: runLabel,
      number: 2,
      year: 1985,
      summary: "Held summary.",
    });
    run[4] = await held(`${tag} the fourth`, {
      series: runLabel,
      number: 4,
      year: 1990,
    });
    omnibus[1] = await held(`${tag} Omnibus 1`, { form: "collected" });
    omnibusEdition = await hardcover(omnibus[1], [run[1]]);
    omnibus[2] = await held(`${tag} Omnibus 2`, {
      form: "collected",
      comicRow: false,
    });
  });

  it("attaches by number and creates the rest: #1, #2 and #4 attached, #3 created under the label", async () => {
    const before = await Promise.all([1, 2, 4].map((n) => comic(run[n])));
    const result = await attachVolume(ids.attachRun, { series: runLabel });
    expect(result).toMatchObject({ created: 1, attached: 3, known: false });
    const after = await Promise.all([1, 2, 4].map((n) => comic(run[n])));
    for (const [i, row] of after.entries()) {
      expect(row.series_id).toBe(result.id);
      expect(row.key).toMatch(/^issue\/936/);
      // Never a title, a form, a series text or a kind.
      expect({
        title: row.title,
        form: row.form,
        series: row.series,
        series_kind: row.series_kind,
      }).toEqual({
        title: before[i].title,
        form: before[i].form,
        series: before[i].series,
        series_kind: before[i].series_kind,
      });
    }
    const [created] = await sql`
      select i.title, c.series, c.number from items i join item_comics c on c.item = i.id
      where c.series_id = ${result.id} and i.id <> all(${Object.values(run)})`;
    expect(created).toMatchObject({ series: runLabel, number: 3 });
  });

  it("refines a year to the cover month in that year, and keeps a date from another", async () => {
    expect(await comic(run[1])).toMatchObject({
      released_on: "1984-05-01",
      released_precision: "month",
    });
    expect(await comic(run[4])).toMatchObject({
      released_on: "1990-01-01",
      released_precision: "year",
    });
  });

  it("fills a missing summary and keeps a held one", async () => {
    expect((await comic(run[1])).summary).toMatch(/^The Turtles are cornered/);
    expect((await comic(run[2])).summary).toBe("Held summary.");
  });

  it("takes the label's Vol. n onto the series", async () => {
    const [row] = await sql`
      select s.volume from series s join item_comics c on c.series_id = s.id
      where c.item = ${run[1]}`;
    expect(row.volume).toBe(3);
  });

  it("answers a label no run has with a 409, before asking Comic Vine", async () => {
    const asked = stub.requests.length;
    await expect(
      attachVolume(ids.attachedElsewhere, { series: `${tag} Nothing` }),
    ).rejects.toThrow(`No run called ${tag} Nothing was added by hand.`);
    expect(stub.requests.length).toBe(asked);
  });

  it("answers a run already attached to another volume with a 409, writing nothing", async () => {
    const before = await counts();
    await expect(
      attachVolume(ids.attachedElsewhere, { series: runLabel }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await counts()).toEqual(before);
  });

  it("attaches a collected run to its stem: the held hardcover takes the source, date and publisher; Omnibus 2 a new one; Vol. 3 is created as the stem and its number", async () => {
    const result = await attachVolume(
      ids.omnibus,
      { collected: `${tag} Omnibus` },
      "collected",
    );
    expect(result).toMatchObject({ created: 1, attached: 2 });
    const [first] = await sql`
      select e.released_on::text, e.released_precision, e.publisher, es.key
      from editions e join edition_sources es on es.edition = e.id
      where e.id = ${omnibusEdition} and es.source = 'comicvine'`;
    expect(first).toMatchObject({
      released_on: "2011-08-01",
      released_precision: "month",
      publisher: "IDW Publishing",
    });
    const [contents] = await sql`
      select count(*)::int as n from edition_contents where edition = ${omnibusEdition}`;
    expect(contents.n).toBe(1);
    const second = await sql`
      select e.format, es.key from editions e
      join edition_sources es on es.edition = e.id where e.item = ${omnibus[2]}`;
    expect(second).toHaveLength(1);
    expect(second[0].format).toBe("hardcover");
    expect(await comic(omnibus[1])).toMatchObject({
      title: `${tag} Omnibus 1`,
      series_id: result.id,
      number: 1,
    });
    expect(await comic(omnibus[2])).toMatchObject({
      series_id: result.id,
      number: 2,
    });
    const [third] = await sql`
      select i.title, i.form, (select count(*)::int from editions e where e.item = i.id) as editions
      from items i join item_comics c on c.item = i.id
      where c.series_id = ${result.id} and c.number = 3`;
    expect(third).toEqual({
      title: `${tag} Omnibus 3`,
      form: "collected",
      editions: 1,
    });
  });

  it("answers a stem the volume's name doesn't hold with a 409 naming the rule", async () => {
    const digest = await held(`${tag} Digest 1`, { form: "collected" });
    await hardcover(digest, [run[2]]);
    await expect(
      attachVolume(ids.treasury, { collected: `${tag} Digest` }, "collected"),
    ).rejects.toThrow(
      /its name must hold their title and the run they collect/,
    );
  });

  it("answers a stem whose editions hold nothing with a 409 (Q1 a)", async () => {
    const annual = await held(`${tag} Annual 1`, { form: "collected" });
    await hardcover(annual);
    await expect(
      attachVolume(ids.annual, { collected: `${tag} Annual` }, "collected"),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("answers a stem no editions have with a 409", async () => {
    await expect(
      attachVolume(ids.annual, { collected: `${tag} Nothing` }, "collected"),
    ).rejects.toThrow(
      `No collected editions called ${tag} Nothing were added by hand.`,
    );
  });

  it("ends two attaches of one volume at once with one series and one source per comic", async () => {
    const label = `${tag} Race`;
    const pair = [
      await held(`${tag} race 1`, { series: label, number: 1 }),
      await held(`${tag} race 2`, { series: label, number: 2 }),
    ];
    const [a, b] = await Promise.all([
      attachVolume(ids.attachRace, { series: label }),
      attachVolume(ids.attachRace, { series: label }),
    ]);
    expect(a.id).toBe(b.id);
    expect([a.known, b.known].sort()).toEqual([false, true]);
    const [sources] = await sql`
      select count(*)::int as n from item_sources
      where source = 'comicvine' and item = any(${pair})`;
    expect(sources.n).toBe(2);
  });
});

describe("importSeriesFromComicVine, a run of trades entered with a series text", () => {
  // B1 stops a form the run doesn't hold; a run of trades that does hold
  // collected editions still takes a { series } pick (Rummage B1, the Raccoon).
  it("attaches collected editions to held trades by number, the held hardcover taking the source", async () => {
    const label = `${tag} Trades`;
    const first = await held(`${tag} trade one`, {
      form: "collected",
      series: label,
      number: 1,
    });
    const edition = await hardcover(first);
    const second = await held(`${tag} trade two`, {
      form: "collected",
      series: label,
      number: 2,
    });
    const result = await attachVolume(
      ids.tradesRun,
      { series: label },
      "collected",
    );
    expect(result).toMatchObject({ created: 0, attached: 2 });
    const [held1] = await sql`
      select count(*)::int as n from edition_sources
      where edition = ${edition} and source = 'comicvine'`;
    expect(held1.n).toBe(1);
    expect(await comic(second)).toMatchObject({ series_id: result.id });
  });
});

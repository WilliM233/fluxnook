import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDb } from "@/db/client";
import { NotFoundError } from "@/lib/catalog/import";
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
// this one serves copies of the recordings under volume and issue ids of its
// own (9<id>, 93<n><id> for the tweaked ones) and attaches only to rows it
// makes: no fixture row, and no key another file holds.

const RECORDINGS = join(process.cwd(), "tests/fixtures/comicvine");
// biome-ignore lint/suspicious/noExplicitAny: raw Comic Vine JSON
const recorded = (name: string): any =>
  JSON.parse(readFileSync(join(RECORDINGS, name), "utf8"));
// biome-ignore lint/suspicious/noExplicitAny: raw Comic Vine JSON
type RawIssue = any;

const THIS_YEAR = new Date().getUTCFullYear();
const ids = {
  mirage: 920281,
  ultimate: 950804,
  tales1987: 918790,
  oneShot: 930001,
  odd: 930002,
  thisYear: 930003,
  lostCover: 930004,
  race: 930005,
};

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
  stub = await startComicVineStub({ dir });
  cv = createComicVine({ apiKey: "k", baseUrl: stub.baseUrl, userAgent: "t" });
});

afterAll(async () => {
  const keys = Object.values(ids).map((id) => `volume/${id}`);
  const paths = await sql<{ name: string }[]>`
    select name from storage.objects where bucket_id = 'covers'
      and (name like 'comicvine/volume-9%' or name like 'comicvine/issue-9%')`;
  await sql`
    delete from items where id in (
      select c.item from item_comics c
      join series_sources s on s.series = c.series_id
      where s.source = 'comicvine' and s.key = any(${keys}))`;
  await sql`
    delete from series where id in (
      select series from series_sources
      where source = 'comicvine' and key = any(${keys}))`;
  if (paths.length) await covers.remove(paths.map((p) => p.name));
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
    await expect(importVolume(9000001)).rejects.toBeInstanceOf(NotFoundError);
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

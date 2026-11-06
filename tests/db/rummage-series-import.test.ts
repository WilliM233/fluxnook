import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { ConflictError } from "@/lib/catalog/import";
import { importSeriesFromComicVine } from "@/lib/catalog/series";
import { type ComicVine, createComicVine } from "@/lib/providers/comicvine";
import { type ComicVineStub, startComicVineStub } from "../stub/comicvine";
import { required } from "./harness";

// The Raccoon's Rummage on 1.4.2 (R1, R2, R6): the attach rules bent by a
// group whose items aren't the form the request names, and by a run that
// numbers two comics the same. Rows and keys of this file's own: volumes
// 7700nn, issues prefixed 77; nothing here touches a fixture row.

const RECORDINGS = join(process.cwd(), "tests/fixtures/comicvine");
// biome-ignore lint/suspicious/noExplicitAny: raw Comic Vine JSON
const recorded = (name: string): any =>
  JSON.parse(readFileSync(join(RECORDINGS, name), "utf8"));

const ids = {
  issuesAsCollected: 770001,
  tradesAsIssues: 770002,
  twice: 770003,
};
const tag = `R${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
let dir: string;
let stub: ComicVineStub;
let cv: ComicVine;

/** The 1984 run's first three issues under a volume id of this file's own. */
function copy(to: number) {
  const volume = recorded("volume-20281.json");
  volume.results = { ...volume.results, id: to, count_of_issues: 3 };
  writeFileSync(join(dir, `volume-${to}.json`), JSON.stringify(volume));
  const list = recorded("issues-20281-o0.json");
  list.results = ["1", "2", "3"].map((n: string) => {
    // biome-ignore lint/suspicious/noExplicitAny: raw Comic Vine JSON
    const issue = list.results.find((row: any) => row.issue_number === n);
    return { ...issue, id: Number(`77${issue.id}`) };
  });
  list.number_of_total_results = 3;
  list.number_of_page_results = 3;
  writeFileSync(join(dir, `issues-${to}-o0.json`), JSON.stringify(list));
}

async function held(
  title: string,
  form: "issue" | "collected",
  series: string,
  number: number,
) {
  const [row] = await sql<{ id: string }[]>`
    insert into items (type, form, title) values ('comic', ${form}, ${title})
    returning id`;
  await sql`
    insert into item_comics (item, series, number) values (${row.id}, ${series}, ${number})`;
  return row.id;
}

const attach = (
  id: number,
  attachTo: { series: string },
  form: "issue" | "collected",
) =>
  importSeriesFromComicVine(db, cv, null, {
    key: `volume/${id}`,
    form,
    format: form === "collected" ? "hardcover" : undefined,
    attachTo,
  });

const written = async (id: number) => {
  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n from series_sources where key = ${`volume/${id}`}`;
  return row.n;
};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "rummage-series-import-"));
  for (const id of Object.values(ids)) copy(id);
  stub = await startComicVineStub({ dir });
  cv = createComicVine({ apiKey: "k", baseUrl: stub.baseUrl, userAgent: "t" });
});

afterAll(async () => {
  const keys = Object.values(ids).map((id) => `volume/${id}`);
  const mine = sql`
    select series from series_sources where source = 'comicvine' and key = any(${keys})`;
  await sql`
    delete from items where id in (select item from item_comics where series_id in (${mine}))`;
  await sql`delete from items where title like ${`${tag}%`}`;
  await sql`delete from series where id in (${mine})`;
  await stub.close();
  rmSync(dir, { recursive: true, force: true });
  await close();
  await sql.end();
});

describe("Rummage: the attach rules on a group of the wrong form", () => {
  it("R1: Collected editions onto a run of single issues is a 409, and no issue grows an edition", async () => {
    const label = `${tag} Run`;
    const run = await Promise.all(
      [1, 2, 3].map((n) => held(`${tag} issue ${n}`, "issue", label, n)),
    );
    // A5: a collected volume attaches to a held `collected` comic. The 1984
    // row with Collected editions + Hardcover + Same is this request.
    await expect(
      attach(ids.issuesAsCollected, { series: label }, "collected"),
    ).rejects.toBeInstanceOf(ConflictError);
    const [editions] = await sql<{ n: number }[]>`
      select count(*)::int as n from editions where item = any(${run})`;
    expect(editions.n).toBe(0);
    const [sources] = await sql<{ n: number }[]>`
      select count(*)::int as n from item_sources
      where source = 'comicvine' and item = any(${run})`;
    expect(sources.n).toBe(0);
    expect(await written(ids.issuesAsCollected)).toBe(0);
  });

  it("R2: Single issues onto a run of collected editions is a 409, nothing written", async () => {
    const label = `${tag} Trades`;
    const trades = await Promise.all(
      [1, 2].map((n) => held(`${tag} trade ${n}`, "collected", label, n)),
    );
    // A5: an issue attaches to the group's item with the same number, form
    // `issue`; a trade isn't one.
    await expect(
      attach(ids.tradesAsIssues, { series: label }, "issue"),
    ).rejects.toBeInstanceOf(ConflictError);
    const [sources] = await sql<{ n: number }[]>`
      select count(*)::int as n from item_sources
      where source = 'comicvine' and item = any(${trades})`;
    expect(sources.n).toBe(0);
    expect(await written(ids.tradesAsIssues)).toBe(0);
  });

  it("R6: a run that numbers two comics the same is a 409 naming the number, not a half-attached group", async () => {
    const label = `${tag} Twice`;
    const pair = await Promise.all([
      held(`${tag} twice a`, "issue", label, 1),
      held(`${tag} twice b`, "issue", label, 1),
    ]);
    await held(`${tag} twice c`, "issue", label, 2);
    // Attaching the first #1 and leaving the second would put a Comic Vine
    // source on the group, so `seriesGroups` drops it from every later
    // sheet and the second #1 can never be reached. Refuse up front.
    await expect(attach(ids.twice, { series: label }, "issue")).rejects.toThrow(
      /#1/,
    );
    const [sources] = await sql<{ n: number }[]>`
      select count(*)::int as n from item_sources
      where source = 'comicvine' and item = any(${pair})`;
    expect(sources.n).toBe(0);
    expect(await written(ids.twice)).toBe(0);
  });
});

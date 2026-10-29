import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { loadItemPage, loadPickerComics } from "@/lib/catalog/item-page";
import { loadSeriesPage } from "@/lib/catalog/series-page";
import { required, signUp } from "./harness";

// Ch 1.4.3's reads: the Series fact with its neighbours, Collected in on
// both pages, an edition's contents as rows, and the picker's list. Rows of
// its own, tagged, under a series key no Browse volume uses.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
const tag = `item-comic-page ${crypto.randomUUID()}`;
const KEY = `volume/99${Math.floor(Math.random() * 1e7)}`;
const ids = {} as Record<
  | "series"
  | "one"
  | "two"
  | "four"
  | "shot"
  | "uc1"
  | "uc2"
  | "film"
  | "hc"
  | "tpb",
  string
>;
let userId: string;

async function item(type: string, title: string, form: string | null) {
  const [{ id }] = await sql`
    insert into items (type, title, form, source_note)
    values (${type}, ${title}, ${form}, ${tag}) returning id`;
  return id as string;
}

async function comic(
  title: string,
  form: string,
  comicRow: { number?: number; series?: string; series_id?: string },
) {
  const id = await item("comic", title, form);
  await sql`
    insert into item_comics (item, series, series_id, number)
    values (${id}, ${comicRow.series ?? null}, ${comicRow.series_id ?? null},
      ${comicRow.number ?? null})`;
  return id;
}

beforeAll(async () => {
  userId = (await signUp(sql)).id;
  const [s] = await sql`
    insert into series (name, volume, year_began) values (${`${tag} Run`}, 1, 1984)
    returning id`;
  ids.series = s.id;
  await sql`insert into series_sources (series, source, key) values (${s.id}, 'comicvine', ${KEY})`;
  const run = { series: `${tag} Run Vol. 1`, series_id: s.id };
  ids.one = await comic(`${tag} #1`, "issue", { ...run, number: 1 });
  ids.two = await comic(`${tag} #2`, "issue", { ...run, number: 2 });
  ids.four = await comic(`${tag} #4`, "issue", { ...run, number: 4 });
  ids.shot = await comic(`${tag} Micro: Me`, "one-shot", {});
  ids.uc1 = await comic(`${tag} Collection 1`, "collected", {});
  ids.uc2 = await comic(`${tag} Collection 2`, "collected", {});
  ids.film = await item("film", `${tag} film`, null);
  const [hc] = await sql`
    insert into editions (item, format) values (${ids.uc1}, 'hardcover') returning id`;
  const [tpb] = await sql`
    insert into editions (item, format) values (${ids.uc2}, 'tpb') returning id`;
  ids.hc = hc.id;
  ids.tpb = tpb.id;
  await sql`
    insert into edition_sources (edition, source, key, url)
    values (${hc.id}, 'comicvine', ${`issue/${KEY}`}, 'https://comicvine.gamespot.com/x/4000-1/')`;
  await sql`
    insert into edition_contents (edition, item, position) values
      (${hc.id}, ${ids.one}, 1), (${hc.id}, ${ids.two}, 2), (${hc.id}, ${ids.shot}, 3)`;
});

afterAll(async () => {
  await sql`delete from items where source_note = ${tag}`;
  await sql`delete from series where id = ${ids.series}`;
  await close();
  await sql.end();
});

const page = (id: string) => loadItemPage(db, { id, userId });

describe("the item page's comic reads", () => {
  it("#2's series fact: name, volume 1, count 3, previous #1, next #4 (the gap skipped)", async () => {
    const p = await page(ids.two);
    expect(p?.series).toEqual({
      id: ids.series,
      name: `${tag} Run`,
      volume: 1,
      count: 3,
      previous: { id: ids.one, number: 1 },
      next: { id: ids.four, number: 4 },
    });
  });

  it("#4 has no next; #1 no previous", async () => {
    expect((await page(ids.four))?.series?.next).toBeNull();
    expect((await page(ids.one))?.series?.previous).toBeNull();
  });

  it("a comic with no series_id has series null", async () => {
    expect((await page(ids.shot))?.series).toBeNull();
  });

  it("#1's collectedIn is the hardcover with its three contents in position order", async () => {
    const [row, ...rest] = (await page(ids.one))?.collectedIn ?? [];
    expect(rest).toEqual([]);
    expect(row).toMatchObject({
      editionId: ids.hc,
      itemId: ids.uc1,
      title: `${tag} Collection 1`,
      format: "hardcover",
    });
    expect(row.contents).toEqual([
      {
        itemId: ids.one,
        title: `${tag} #1`,
        number: 1,
        series: `${tag} Run Vol. 1`,
        seriesId: ids.series,
        position: 1,
      },
      {
        itemId: ids.two,
        title: `${tag} #2`,
        number: 2,
        series: `${tag} Run Vol. 1`,
        seriesId: ids.series,
        position: 2,
      },
      {
        itemId: ids.shot,
        title: `${tag} Micro: Me`,
        number: null,
        series: null,
        seriesId: null,
        position: 3,
      },
    ]);
  });

  it("the one-shot's collectedIn is the same edition", async () => {
    const rows = (await page(ids.shot))?.collectedIn ?? [];
    expect(rows.map((r) => r.editionId)).toEqual([ids.hc]);
  });

  it("the second collected's collectedIn is empty and its edition's contentsRows is []", async () => {
    const p = await page(ids.uc2);
    expect(p?.collectedIn).toEqual([]);
    expect(p?.editions.map((e) => [e.id, e.contents, e.contentsRows])).toEqual([
      [ids.tpb, 0, []],
    ]);
  });

  it("the collected item's editions carry comicvine_url when an edition source has one, else null", async () => {
    const [hc] = (await page(ids.uc1))?.editions ?? [];
    const [tpb] = (await page(ids.uc2))?.editions ?? [];
    expect(hc.comicvine_url).toBe("https://comicvine.gamespot.com/x/4000-1/");
    expect(hc.contentsRows.map((r) => r.itemId)).toEqual([
      ids.one,
      ids.two,
      ids.shot,
    ]);
    expect(tpb.comicvine_url).toBeNull();
  });
});

describe("the picker's list", () => {
  it("every comic but except, series groups before the rest, numbers in order, never the film", async () => {
    const all = await loadPickerComics(db, { except: ids.uc2 });
    const mine = all.filter((c) => c.title.startsWith(tag));
    expect(mine.map((c) => c.id)).toEqual([
      ids.one,
      ids.two,
      ids.four,
      ids.uc1,
      ids.shot,
    ]);
    expect(all.some((c) => c.id === ids.uc2 || c.id === ids.film)).toBe(false);
    const firstUnseries = all.findIndex((c) => c.series === null);
    expect(all.slice(firstUnseries).every((c) => c.series === null)).toBe(true);
  });
});

describe("the series page's collected-in read", () => {
  it("holds the hardcover once, with its contents, and the empty tpb not at all", async () => {
    const p = await loadSeriesPage(db, { id: ids.series });
    expect(p?.collectedIn.map((r) => [r.editionId, r.contents.length])).toEqual(
      [[ids.hc, 3]],
    );
  });
});

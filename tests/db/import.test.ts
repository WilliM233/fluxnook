import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import {
  ConflictError,
  importFromTmdb,
  NotFoundError,
} from "@/lib/catalog/import";
import { coverStoreFromEnv } from "@/lib/covers";
import { createTmdb, type Tmdb } from "@/lib/providers/tmdb";
import { startTmdbStub, type TmdbStub } from "../stub/tmdb";
import { required } from "./harness";

// A5 against the local stack and real Storage. db files run side by side, so
// this one serves the recordings under its own ids (900000000 + TMDB's) and
// attaches to its own tagged rows: nothing here touches a fixture row or a key
// another file holds.

const OFFSET = 900_000_000;
const RECORDINGS = join(process.cwd(), "tests/fixtures/tmdb");
// biome-ignore lint/suspicious/noExplicitAny: raw TMDB JSON
const recorded = (name: string): any =>
  JSON.parse(readFileSync(join(RECORDINGS, name), "utf8"));

const show = recorded("tv-46157.json");
const film2013 = recorded("movie-133805.json");
const film1976 = recorded("movie-7340.json");
const ids = {
  show: OFFSET + show.id,
  otherShow: OFFSET + show.id + 1,
  film2013: OFFSET + film2013.id,
  laterFilm: OFFSET + film2013.id + 1,
  film1976: OFFSET + film1976.id,
  collection: OFFSET + film1976.belongs_to_collection.id,
};

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
const covers = coverStoreFromEnv();
const tag = `import ${crypto.randomUUID()}`;
let dir: string;
let stub: TmdbStub;
let tmdb: Tmdb;
let film2013Row: string;
let film1976Row: string;
const made: string[] = [];

async function heldFilm(year: number) {
  const [{ id }] = await sql`
    insert into items (type, title, released_on, released_precision, source_note)
    values ('film', 'Carrie', ${`${year}-01-01`}, 'year', ${tag}) returning id`;
  await sql`
    insert into item_sources (item, source, key)
    values (${id}, 'letterboxd', ${`${tag} ${year}`})`;
  made.push(id);
  return id as string;
}

async function run(key: string, attachTo?: string, client = tmdb) {
  const result = await importFromTmdb(db, client, covers, { key, attachTo });
  made.push(result.id);
  return result;
}

// An item with its dates as text, the way TMDB and the assertions write them.
async function itemRow(id: string) {
  const [row] = await sql`
    select type, title, released_on::text as released_on, released_precision,
      summary, created_by, cover_path
    from items where id = ${id}`;
  return row;
}

// Items behind this file's keys, each OFFSET plus a TMDB id.
async function itemCount() {
  const [{ n }] = await sql`
    select count(*)::int as n from item_sources
    where source = 'tmdb' and key like any(array['movie/9________', 'tv/9________'])`;
  return n as number;
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "import-"));
  const copy = (id: string, body: object) =>
    writeFileSync(join(dir, `${id}.json`), JSON.stringify(body));
  copy(`tv-${ids.show}`, { ...show, id: ids.show });
  copy(`tv-${ids.otherShow}`, { ...show, id: ids.otherShow });
  copy(`movie-${ids.film2013}`, { ...film2013, id: ids.film2013 });
  copy(`movie-${ids.laterFilm}`, { ...film2013, id: ids.laterFilm });
  copy(`movie-${ids.film1976}`, {
    ...film1976,
    id: ids.film1976,
    belongs_to_collection: {
      ...film1976.belongs_to_collection,
      id: ids.collection,
    },
  });
  stub = await startTmdbStub({ dir });
  tmdb = createTmdb({
    apiKey: "stub",
    baseUrl: stub.baseUrl,
    imageBaseUrl: stub.imageBaseUrl,
  });
  film2013Row = await heldFilm(2013);
  film1976Row = await heldFilm(1976);
});

afterAll(async () => {
  const paths = await sql`
    select cover_path from items where id = any(${made}) and cover_path is not null`;
  if (paths.length) await covers.remove(paths.map((p) => p.cover_path));
  await sql`
    delete from franchises where id in (
      select franchise from franchise_sources
      where source = 'tmdb' and key = ${`collection/${ids.collection}`})`;
  await sql`delete from items where id = any(${made})`;
  await stub.close();
  rmSync(dir, { recursive: true, force: true });
  await close();
  await sql.end();
});

describe("importFromTmdb", () => {
  it("a new show: the item, its tv row, its source and its cover", async () => {
    const key = `tv/${ids.show}`;
    const { id, created } = await run(key);
    expect(created).toBe(true);
    const item = await itemRow(id);
    expect(item).toMatchObject({
      type: "tv",
      title: show.name,
      released_on: show.first_air_date,
      released_precision: "day",
      summary: show.overview,
      created_by: null,
      cover_path: `tmdb/${key}.jpg`,
    });
    const [tv] = await sql`
      select seasons, episodes, first_aired::text as first_aired,
        last_aired::text as last_aired, ended
      from item_tv where item = ${id}`;
    expect(tv).toMatchObject({
      seasons: show.number_of_seasons,
      episodes: show.number_of_episodes,
      first_aired: show.first_air_date,
      last_aired: show.last_air_date,
      ended: ["Ended", "Canceled"].includes(show.status),
    });
    const [source] = await sql`
      select url from item_sources where source = 'tmdb' and key = ${key}`;
    expect(source.url).toBe(`https://www.themoviedb.org/${key}`);
    const poster = await fetch(covers.publicUrl(item.cover_path));
    expect(poster.status).toBe(200);
    expect(poster.headers.get("content-type")).toBe("image/jpeg");
  });

  it("the same key again is the same item, and adds none", async () => {
    const before = await itemCount();
    const again = await run(`tv/${ids.show}`);
    expect(again.created).toBe(false);
    expect(await itemCount()).toBe(before);
  });

  it("attach fills the held film, and a finer date of the same year wins", async () => {
    const { id, created } = await run(`movie/${ids.film2013}`, film2013Row);
    expect({ id, created }).toEqual({ id: film2013Row, created: false });
    const sources = await sql`
      select source from item_sources where item = ${id} order by source`;
    expect(sources.map((s) => s.source)).toEqual(["letterboxd", "tmdb"]);
    const [film] = await sql`select * from item_films where item = ${id}`;
    expect(film).toMatchObject({
      runtime_minutes: film2013.runtime,
      original_title: film2013.original_title,
    });
    const item = await itemRow(id);
    expect(item).toMatchObject({
      title: "Carrie",
      summary: film2013.overview,
      released_on: film2013.release_date,
      released_precision: "day",
    });
  });

  it("attach never moves a held date to another year", async () => {
    const held = await heldFilm(2012);
    await run(`movie/${ids.laterFilm}`, held);
    const item = await itemRow(held);
    expect(item).toMatchObject({
      released_on: "2012-01-01",
      released_precision: "year",
    });
  });

  it("409: an item that already has a TMDB source, or is another type", async () => {
    await expect(
      importFromTmdb(db, tmdb, covers, {
        key: `movie/${ids.film1976}`,
        attachTo: film2013Row,
      }),
    ).rejects.toThrow(
      `That item already has TMDB source movie/${ids.film2013}.`,
    );
    await expect(
      importFromTmdb(db, tmdb, covers, {
        key: `tv/${ids.otherShow}`,
        attachTo: film1976Row,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    const [{ n }] = await sql`
      select count(*)::int as n from item_sources
      where source = 'tmdb'
        and key in (${`movie/${ids.film1976}`}, ${`tv/${ids.otherShow}`})`;
    expect(n).toBe(0);
  });

  it("404: a key TMDB doesn't have, or an attach target that doesn't exist", async () => {
    await expect(
      importFromTmdb(db, tmdb, covers, { key: `movie/${OFFSET}` }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      importFromTmdb(db, tmdb, covers, {
        key: `movie/${ids.film1976}`,
        attachTo: crypto.randomUUID(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a poster that won't load leaves cover_path null and the import standing", async () => {
    const broken = createTmdb({
      apiKey: "stub",
      baseUrl: stub.baseUrl,
      imageBaseUrl: `${new URL(stub.baseUrl).origin}/broken/t/p`,
    });
    const { id, created } = await run(`tv/${ids.otherShow}`, undefined, broken);
    expect(created).toBe(true);
    const [item] = await sql`select cover_path from items where id = ${id}`;
    expect(item.cover_path).toBeNull();
  });

  it("a film in a TMDB collection gets the franchise, once", async () => {
    const key = `movie/${ids.film1976}`;
    const franchiseKey = `collection/${ids.collection}`;
    const linked = () => sql`
      select f.name from item_franchises i
      join franchises f on f.id = i.franchise
      join franchise_sources s on s.franchise = f.id
      where i.item = ${film1976Row} and s.source = 'tmdb' and s.key = ${franchiseKey}`;
    await run(key, film1976Row);
    expect((await linked()).map((r) => r.name)).toEqual([
      film1976.belongs_to_collection.name,
    ]);
    await run(key);
    const [{ n }] = await sql`
      select count(*)::int as n from franchise_sources
      where source = 'tmdb' and key = ${franchiseKey}`;
    expect(n).toBe(1);
    expect(await linked()).toHaveLength(1);
  });
});

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { ConflictError, importFromTmdb } from "@/lib/catalog/import";
import { createTmdb, type Tmdb } from "@/lib/providers/tmdb";
import { startTmdbStub, type TmdbStub } from "../stub/tmdb";
import { required } from "./harness";

// Rummage R4 (Ch 1.2). The sheet offers Same only for a current match
// candidate (same type, folded title, year within 1). The route takes any
// uuid. A POST with attachTo naming an unrelated film of the same type staples
// TMDB's summary, runtime, date, poster and franchise onto it, in the global
// catalog, with no edit or delete this chapter to take it back off.

const OFFSET = 730_000_000;
const RECORDINGS = join(process.cwd(), "tests/fixtures/tmdb");
const film = JSON.parse(
  readFileSync(join(RECORDINGS, "movie-133805.json"), "utf8"),
);
const id = OFFSET + film.id;

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
const tag = `rummage-attach ${crypto.randomUUID()}`;
let dir: string;
let stub: TmdbStub;
let tmdb: Tmdb;
let misery: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "rummage-attach-"));
  writeFileSync(
    join(dir, `movie-${id}.json`),
    JSON.stringify({ ...film, id, poster_path: null }),
  );
  stub = await startTmdbStub({ dir });
  tmdb = createTmdb({
    apiKey: "stub",
    baseUrl: stub.baseUrl,
    imageBaseUrl: stub.imageBaseUrl,
  });
  const [row] = await sql`
    insert into items (type, title, released_on, released_precision, source_note)
    values ('film', 'Misery', '1990-01-01', 'year', ${tag}) returning id`;
  misery = row.id;
  await sql`
    insert into item_sources (item, source, key)
    values (${misery}, 'letterboxd', ${tag})`;
});

afterAll(async () => {
  await sql`delete from items where source_note = ${tag}`;
  await sql`
    delete from items where id in (
      select item from item_sources
      where source = 'tmdb' and key = ${`movie/${id}`})`;
  await stub.close();
  rmSync(dir, { recursive: true, force: true });
  await close();
  await sql.end();
});

it("Carrie (2013) can't be attached to Misery (1990): 409, and Misery untouched", async () => {
  await expect(
    importFromTmdb(db, tmdb, null, { key: `movie/${id}`, attachTo: misery }),
  ).rejects.toBeInstanceOf(ConflictError);
  const [row] = await sql`
    select i.summary, i.released_on::text as released_on, f.runtime_minutes,
      (select count(*)::int from item_sources s where s.item = i.id and s.source = 'tmdb') as tmdb
    from items i left join item_films f on f.item = i.id where i.id = ${misery}`;
  expect(row).toEqual({
    summary: null,
    released_on: "1990-01-01",
    runtime_minutes: null,
    tmdb: 0,
  });
});

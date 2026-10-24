import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { importFromTmdb } from "@/lib/catalog/import";
import { createTmdb, type Tmdb } from "@/lib/providers/tmdb";
import { startTmdbStub, type TmdbStub } from "../stub/tmdb";
import { required } from "./harness";

// Rummage R1 (Ch 1.2). `movie/0133805` and `movie/133805` are one TMDB film:
// the schema's `[0-9]+` lets the zeros through, parseTmdbKey drops them for
// the fetch, and item_sources keeps the raw string. So the second spelling
// never finds the first's item and the catalog gets a second row for one id,
// which the search then shows as `new` a third time.

const OFFSET = 700_000_000;
const RECORDINGS = join(process.cwd(), "tests/fixtures/tmdb");
const film = JSON.parse(
  readFileSync(join(RECORDINGS, "movie-133805.json"), "utf8"),
);
const id = OFFSET + film.id;

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
let dir: string;
let stub: TmdbStub;
let tmdb: Tmdb;
const made: string[] = [];

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "rummage-key-"));
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
});

afterAll(async () => {
  await sql`
    delete from items where id in (
      select item from item_sources
      where source = 'tmdb' and key ~ ${`^movie/0*${id}$`})`;
  await sql`delete from items where id = any(${made})`;
  await stub.close();
  rmSync(dir, { recursive: true, force: true });
  await close();
  await sql.end();
});

it("a key with leading zeros is the same film, not a second item", async () => {
  const first = await importFromTmdb(db, tmdb, null, { key: `movie/${id}` });
  made.push(first.id);
  expect(first.created).toBe(true);

  const again = await importFromTmdb(db, tmdb, null, {
    key: `movie/0${id}`,
  }).catch((error: Error) => error);
  if (!(again instanceof Error)) {
    made.push(again.id);
    expect(again).toEqual({ id: first.id, created: false });
  }

  const [{ n }] = await sql`
    select count(*)::int as n from item_sources
    where source = 'tmdb' and key ~ ${`^movie/0*${id}$`}`;
  expect(n).toBe(1);
});

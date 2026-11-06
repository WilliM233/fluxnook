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

// Rummage R2 (Ch 1.2). Two films of one collection imported at the same
// moment (two people, or two tabs): addFranchise reads franchise_sources,
// finds nothing, and both insert. The second lands on the (source, key) pk,
// which nothing catches, so one import is a 500 and its item never lands.
// The item key has a KeyTaken path; the franchise key has none.

const OFFSET = 710_000_000;
const RECORDINGS = join(process.cwd(), "tests/fixtures/tmdb");
const film = JSON.parse(
  readFileSync(join(RECORDINGS, "movie-7340.json"), "utf8"),
);
const ids = [OFFSET + 1, OFFSET + 2];
const collection = OFFSET + 99;

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const a = createDb();
const b = createDb();
let dir: string;
let stub: TmdbStub;
let tmdb: Tmdb;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "rummage-franchise-"));
  for (const id of ids) {
    writeFileSync(
      join(dir, `movie-${id}.json`),
      JSON.stringify({
        ...film,
        id,
        poster_path: null,
        belongs_to_collection: { id: collection, name: `Race ${collection}` },
      }),
    );
  }
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
      select item from item_sources where source = 'tmdb'
      and key in (${`movie/${ids[0]}`}, ${`movie/${ids[1]}`}))`;
  await sql`
    delete from franchises where id in (
      select franchise from franchise_sources
      where source = 'tmdb' and key = ${`collection/${collection}`})`;
  await stub.close();
  rmSync(dir, { recursive: true, force: true });
  await a.close();
  await b.close();
  await sql.end();
});

it("two films of one collection imported at once both land, with one franchise", async () => {
  const results = await Promise.allSettled([
    importFromTmdb(a.db, tmdb, null, { key: `movie/${ids[0]}` }),
    importFromTmdb(b.db, tmdb, null, { key: `movie/${ids[1]}` }),
  ]);
  expect(
    results.map((r) => (r.status === "rejected" ? String(r.reason) : "ok")),
  ).toEqual(["ok", "ok"]);
  const [{ n }] = await sql`
    select count(*)::int as n from franchise_sources
    where source = 'tmdb' and key = ${`collection/${collection}`}`;
  expect(n).toBe(1);
});

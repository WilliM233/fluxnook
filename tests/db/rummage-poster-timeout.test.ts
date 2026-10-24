import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { importFromTmdb } from "@/lib/catalog/import";
import { coverStoreFromEnv } from "@/lib/covers";
import { createTmdb } from "@/lib/providers/tmdb";
import { startTmdbStub, type TmdbStub } from "../stub/tmdb";
import { required } from "./harness";

// Rummage R3 (Ch 1.2). cachePoster fetches the w500 with a bare fetch and no
// deadline. A CDN that accepts the connection and never answers holds the
// import request open (undici gives up after five minutes), so "Add" spins
// for as long as the person waits. A poster failure is meant to be one log
// line and a null cover_path; a poster that never arrives should be the same.

const OFFSET = 720_000_000;
const RECORDINGS = join(process.cwd(), "tests/fixtures/tmdb");
const show = JSON.parse(
  readFileSync(join(RECORDINGS, "tv-46157.json"), "utf8"),
);
const id = OFFSET + show.id;

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const { db, close } = createDb();
let dir: string;
let stub: TmdbStub;
let hang: Server;
const made: string[] = [];

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "rummage-poster-"));
  writeFileSync(join(dir, `tv-${id}.json`), JSON.stringify({ ...show, id }));
  stub = await startTmdbStub({ dir });
  // Accepts every request and answers none of them.
  hang = createServer(() => {});
  await new Promise<void>((resolve) => hang.listen(0, "127.0.0.1", resolve));
});

afterAll(async () => {
  // By key as well as by id: when the test times out, `made` is still empty.
  await sql`
    delete from items where id = any(${made}) or id in (
      select item from item_sources where source = 'tmdb' and key = ${`tv/${id}`})`;
  await stub.close();
  hang.closeAllConnections();
  await new Promise<void>((resolve) => hang.close(() => resolve()));
  rmSync(dir, { recursive: true, force: true });
  await close();
  await sql.end();
});

it("a poster host that never answers leaves cover_path null within 15 s", async () => {
  const port = (hang.address() as AddressInfo).port;
  const tmdb = createTmdb({
    apiKey: "stub",
    baseUrl: stub.baseUrl,
    imageBaseUrl: `http://127.0.0.1:${port}/t/p`,
  });
  const started = Date.now();
  const result = await importFromTmdb(db, tmdb, coverStoreFromEnv(), {
    key: `tv/${id}`,
  });
  made.push(result.id);
  expect(Date.now() - started).toBeLessThan(15_000);
  const [item] =
    await sql`select cover_path from items where id = ${result.id}`;
  expect(item.cover_path).toBeNull();
}, 20_000);

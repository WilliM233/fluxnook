import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { afterAll, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { loadFixtures } from "@/fixtures/load";
import { required, signUp } from "./harness";

// Ch 1.2 D2. Two loads for two different people at once, onto catalog rows
// neither has made yet, both land: the second waits for the first's catalog
// instead of colliding with it on an item_sources key. CI's fresh database
// hit this when catalog-match.test.ts and fixtures-load.test.ts loaded the
// fixtures side by side.

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const a = createDb();
const b = createDb();
const tag = crypto.randomUUID();
const title = `race ${tag}`;
const users: string[] = [];
const dir = mkdtempSync(path.join(tmpdir(), "race-"));

// Enough fresh items that the two transactions overlap on the catalog.
const items = Array.from({ length: 40 }, (_, i) => ({
  id: `race:${tag}-${i}`,
  type: "film",
  title,
  year: 2000,
  providers: {},
  source_note: "",
}));
writeFileSync(
  path.join(dir, "race.json"),
  JSON.stringify({
    items,
    shelves: [
      {
        name: `Race ${tag}`,
        date: "2026-10-24",
        description: "",
        entries: [{ item: items[0].id, position: 1 }],
      },
    ],
  }),
);

afterAll(async () => {
  for (const id of users) await sql`delete from auth.users where id = ${id}`;
  await sql`delete from items where title = ${title}`;
  rmSync(dir, { recursive: true, force: true });
  await a.close();
  await b.close();
  await sql.end();
});

// The two loads wait on the loader's lock by design, and so does every other
// db file that loads the fixtures beside this one; on a fresh database the
// first full load holds it for seconds. Ch 1.3 timed out once at 5 s.
it("two people's loads at once onto a new catalog both succeed", {
  timeout: 30_000,
}, async () => {
  const one = await signUp(sql);
  const two = await signUp(sql);
  users.push(one.id, two.id);
  const results = await Promise.allSettled([
    loadFixtures(a.db, { email: one.email, dir, log: () => {} }),
    loadFixtures(b.db, { email: two.email, dir, log: () => {} }),
  ]);
  expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
  const [{ n }] = await sql`
    select count(*)::int as n from items where title = ${title}`;
  expect(n).toBe(items.length);
});

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixture } from "@/fixtures/shape";

// `npm run fixtures:load` end to end (Ch 1.1, A6 to A8): the real CLI against
// the local stack, every expected number computed from the fixture files.
// Other db test files write catalog rows beside this one, so catalog counts
// are taken over the fixtures' own source keys, never a whole table.

const ROOT = path.resolve(__dirname, "../..");
const DIR = path.join(ROOT, "supabase/seed/fixtures");

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env.local.`);
  }
  return value;
}

const files = readdirSync(DIR)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) =>
    fixture.parse(JSON.parse(readFileSync(path.join(DIR, name), "utf8"))),
  );

function tally<T>(rows: T[], key: (row: T) => string) {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[key(row)] = (counts[key(row)] ?? 0) + 1;
  return counts;
}

const allItems = files.flatMap((f) => f.items);
const allRelations = files.flatMap((f) => f.relations);
const allEditions = files.flatMap((f) => f.editions);
const itemIds = allItems.map((i) => i.id);
const editionKeys = allEditions.map((e) => e.id.slice("edition:".length));

const expected = {
  items: allItems.length,
  byType: tally(allItems, (i) => i.type),
  bySource: tally(allItems, (i) => i.id.split(":")[0]),
  books: allItems.filter((i) => i.type === "book").length,
  comics: allItems.filter((i) => i.type === "comic").length,
  byKind: tally(allRelations, (r) => r.type),
  editions: allEditions.length,
  contents: allEditions.reduce((n, e) => n + e.contents.length, 0),
  gaps: files.flatMap((f) => f.gaps),
};

const sql = postgres(required("DATABASE_URL"), { max: 1 });
const supabase = createClient(
  required("NEXT_PUBLIC_SUPABASE_URL"),
  required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  { auth: { persistSession: false } },
);

function run(args: string[]) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/fixtures-load.ts", ...args],
    { cwd: ROOT, env: process.env, encoding: "utf8" },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function signUp() {
  const email = `db-${crypto.randomUUID()}@example.com`;
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) throw error;
  const [{ id }] = await sql`select id from auth.users where email = ${email}`;
  return { email, id: id as string };
}

function rows(list: { key: string; n: number }[]) {
  return Object.fromEntries(list.map((r) => [r.key, r.n]));
}

async function catalog() {
  const fx = sql`
    select item from item_sources
    where source || ':' || key = any(${sql.array(itemIds)})`;
  const ed = sql`
    select edition from edition_sources
    where source = 'manual' and key = any(${sql.array(editionKeys)})`;
  const byType = await sql<{ key: string; n: number }[]>`
    select type as key, count(*)::int as n from items
    where id in (${fx}) group by type`;
  const bySource = await sql<{ key: string; n: number }[]>`
    select source as key, count(*)::int as n from item_sources
    where source || ':' || key = any(${sql.array(itemIds)}) group by source`;
  const byKind = await sql<{ key: string; n: number }[]>`
    select kind as key, count(*)::int as n from item_relations
    where from_item in (${fx}) and to_item in (${fx}) group by kind`;
  type Counts = Record<
    | "items"
    | "books"
    | "comics"
    | "editions"
    | "edition_sources"
    | "contents"
    | "franchises",
    number
  >;
  const [counts] = await sql<Counts[]>`
    select
      (select count(*)::int from items where id in (${fx})) as items,
      (select count(*)::int from item_books where item in (${fx})) as books,
      (select count(*)::int from item_comics where item in (${fx})) as comics,
      (select count(*)::int from editions where id in (${ed})) as editions,
      (select count(*)::int from edition_sources where edition in (${ed})) as edition_sources,
      (select count(*)::int from edition_contents where edition in (${ed})) as contents,
      (select count(*)::int from franchises) as franchises`;
  return {
    ...counts,
    byType: rows(byType),
    bySource: rows(bySource),
    byKind: rows(byKind),
  };
}

let user: { email: string; id: string };
let first: ReturnType<typeof run>;

beforeAll(async () => {
  user = await signUp();
  first = run(["--user", user.email]);
  if (first.status !== 0) throw new Error(first.stderr || first.stdout);
}, 120_000);

afterAll(() => sql.end());

describe("fixtures:load, the catalog", () => {
  it("writes every fixture item, source, relation, edition and content once", async () => {
    const got = await catalog();
    expect(got.items).toBe(expected.items);
    expect(got.byType).toEqual(expected.byType);
    expect(got.bySource).toEqual(expected.bySource);
    expect(got.books).toBe(expected.books);
    expect(got.comics).toBe(expected.comics);
    expect(got.byKind).toEqual(expected.byKind);
    expect(got.editions).toBe(expected.editions);
    expect(got.edition_sources).toBe(expected.editions);
    expect(got.contents).toBe(expected.contents);
    expect(got.franchises).toBe(0);
  });

  it("prints every gap and still loads the item behind it", async () => {
    const lines = first.stdout
      .split("\n")
      .filter((l) => l.startsWith("  gap "));
    expect(lines).toHaveLength(expected.gaps.length);
    expect(first.stdout).toContain("  gap letterboxd:mic8: ");
    const found = await sql`
      select 1 from item_sources where source = 'letterboxd' and key = 'mic8'`;
    expect(found).toHaveLength(1);
  });

  it("names a missing auth user and exits 1", () => {
    const email = `nobody-${crypto.randomUUID()}@example.com`;
    const result = run(["--user", email]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`no auth user with email ${email}`);
  });

  it("refuses to run without --user, exit 2", () => {
    const result = run([]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--user");
  });

  it("a second load adds no catalog row", async () => {
    const before = await catalog();
    const other = await signUp();
    const result = run(["--user", other.email]);
    expect(result.status, result.stderr).toBe(0);
    expect(await catalog()).toEqual(before);
  });

  it("dates, notes and provider links land as the plan reads them", async () => {
    const [carrie] = await sql`
      select i.released_on::text, i.released_precision, s.url
      from items i join item_sources s on s.item = i.id
      where s.source = 'letterboxd' and s.key = '20ZQ'`;
    expect(carrie).toEqual({
      released_on: "1976-01-01",
      released_precision: "year",
      url: "https://boxd.it/20ZQ",
    });

    const comic = async (key: string) => {
      const [row] = await sql`
        select i.released_on::text, i.released_precision, i.source_note,
          c.number, s.url
        from items i
        join item_sources s on s.item = i.id
        join item_comics c on c.item = i.id
        where s.source = 'manual' and s.key = ${key}`;
      return row;
    };
    expect(await comic("tmnt-mirage-v1-1")).toEqual({
      released_on: "1984-05-01",
      released_precision: "month",
      source_note: "May, 1984",
      number: 1,
      url: null,
    });
    expect(await comic("tmnt-ultimate-collection-1")).toMatchObject({
      released_on: null,
      released_precision: null,
      source_note: null,
    });
    expect(await comic("tmnt-mirage-savage-dragon-2-r212")).toMatchObject({
      source_note: "#22",
    });
  });
});

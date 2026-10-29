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

const allShelves = files.flatMap((f) => f.shelves);
const expectedContent = {
  shelves: allShelves.length,
  sections: allShelves.reduce((n, s) => n + (s.sections?.length ?? 0), 0),
  entries: allShelves.reduce(
    (n, s) =>
      n +
      (s.entries?.length ?? 0) +
      (s.sections ?? []).reduce((m, sec) => m + sec.entries.length, 0),
    0,
  ),
  occurrences: files.reduce((n, f) => n + f.occurrences.length, 0),
  journal_entries: 0,
  copies: files.reduce((n, f) => n + f.copies.length, 0),
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
      -- The loader's own: a Comic Vine attach beside this file adds one each (1.4.2).
      (select count(*)::int from edition_sources where edition in (${ed}) and source = 'manual') as edition_sources,
      (select count(*)::int from edition_contents where edition in (${ed})) as contents,
      -- The loader's own franchises: an import beside this file makes tmdb ones.
      (select count(*)::int from franchise_sources where source <> 'tmdb') as franchises`;
  return {
    ...counts,
    byType: rows(byType),
    bySource: rows(bySource),
    byKind: rows(byKind),
  };
}

// A user's rows: owner on shelves, occurrences and copies; sections, entries
// and journal entries through their parent.
async function content(owner: string) {
  const [counts] = await sql<Record<keyof typeof expectedContent, number>[]>`
    select
      (select count(*)::int from shelves where owner = ${owner}) as shelves,
      (select count(*)::int from shelf_sections k
        join shelves s on s.id = k.shelf where s.owner = ${owner}) as sections,
      (select count(*)::int from shelf_entries e
        join shelves s on s.id = e.shelf where s.owner = ${owner}) as entries,
      (select count(*)::int from occurrences where owner = ${owner}) as occurrences,
      (select count(*)::int from journal_entries j
        join occurrences o on o.id = j.occurrence where o.owner = ${owner}) as journal_entries,
      (select count(*)::int from copies where owner = ${owner}) as copies`;
  return counts;
}

let user: { email: string; id: string };
let other: { email: string; id: string };
let first: ReturnType<typeof run>;

beforeAll(async () => {
  user = await signUp();
  first = run(["--user", user.email]);
  if (first.status !== 0) throw new Error(first.stderr || first.stdout);
}, 120_000);

afterAll(() => sql.end());

// Each load spawns the CLI, a few seconds apiece on CI.
const spawning = { timeout: 120_000 };

describe("fixtures:load, the catalog", spawning, () => {
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
    other = await signUp();
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

describe("fixtures:load, the user's content", spawning, () => {
  it("writes the shelves, sections, entries, occurrences and copies, all private", async () => {
    expect(await content(user.id)).toEqual(expectedContent);

    const [flags] = await sql`
      select
        (select count(*)::int from shelf_entries e join shelves s on s.id = e.shelf
          where s.owner = ${user.id}
            and (e.status <> 'unmarked' or e.visibility <> 'private')) as entries,
        (select count(*)::int from occurrences where owner = ${user.id}
          and (status <> 'done' or started_on is not null or finished_on is not null
            or stars is not null or visibility <> 'private')) as occurrences,
        (select count(*)::int from copies where owner = ${user.id}
          and visibility <> 'private') as copies,
        (select count(*)::int from shelves where owner = ${user.id}
          and visibility <> 'private') as shelves`;
    expect(flags).toEqual({
      entries: 0,
      occurrences: 0,
      copies: 0,
      shelves: 0,
    });

    for (const shelf of allShelves) {
      const [row] = await sql`
        select s.id, s.created_at, s.source_url,
          (select count(*)::int from shelf_sections where shelf = s.id) as sections,
          (select count(*)::int from shelf_entries where shelf = s.id and section is null) as flat
        from shelves s where s.owner = ${user.id} and s.name = ${shelf.name}`;
      expect(row.created_at.toISOString()).toBe(`${shelf.date}T00:00:00.000Z`);
      expect(row.source_url).toBe(shelf.url ?? null);
      expect(row.sections).toBe(shelf.sections?.length ?? 0);
      expect(row.flat).toBe(shelf.entries?.length ?? 0);
    }
  });

  it("refuses a user who already has content, writing nothing, exit 1", async () => {
    const before = {
      catalog: await catalog(),
      content: await content(user.id),
    };
    const result = run(["--user", user.email]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${user.email} already has`);
    expect(result.stderr).toContain("--replace");
    expect({
      catalog: await catalog(),
      content: await content(user.id),
    }).toEqual(before);
  });

  it("--replace clears and writes again; twice, the counts hold", async () => {
    const before = {
      catalog: await catalog(),
      content: await content(user.id),
    };
    for (let i = 0; i < 2; i++) {
      const result = run(["--user", user.email, "--replace"]);
      expect(result.status, result.stderr).toBe(0);
      const echo = result.stdout.indexOf(`fixtures:load: ${user.email} (`);
      const replaced = result.stdout.indexOf(
        `content replaced for ${user.email}:`,
      );
      expect(echo).toBeGreaterThanOrEqual(0);
      expect(replaced).toBeGreaterThan(echo);
    }
    expect({
      catalog: await catalog(),
      content: await content(user.id),
    }).toEqual(before);
  });

  it("each user gets their own content and no one else's", async () => {
    expect(await content(other.id)).toEqual(expectedContent);
    expect(await content(user.id)).toEqual(expectedContent);
  });

  it("finds the user however the address is cased, as the login form does", async () => {
    const shouty = await signUp();
    const result = run(["--user", shouty.email.toUpperCase()]);
    expect(result.status, result.stderr).toBe(0);
    expect(await content(shouty.id)).toEqual(expectedContent);
  });

  // Last: it takes the user.
  it("a profile delete takes that user's content and no catalog row", async () => {
    const before = await catalog();
    await sql`delete from profiles where id = ${user.id}`;
    expect(await content(user.id)).toEqual({
      shelves: 0,
      sections: 0,
      entries: 0,
      occurrences: 0,
      journal_entries: 0,
      copies: 0,
    });
    expect(await catalog()).toEqual(before);
    expect(await content(other.id)).toEqual(expectedContent);
  });
});

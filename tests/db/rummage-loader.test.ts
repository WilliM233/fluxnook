import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "@/db/client";
import { LoadError, loadFixtures } from "@/fixtures/load";

// The Raccoon's Rummage for Ch 1.1, the loader half (plan section 4b, R9 to
// R11): two loads at once, a fixture that points past its files, and a load
// that dies halfway through a --replace. Small fixtures in a temp dir, so each
// case is a second, not three.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env.local.`);
  }
  return value;
}

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {} });
const supabase = createClient(
  required("NEXT_PUBLIC_SUPABASE_URL"),
  required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  { auth: { persistSession: false } },
);
const a = createDb();
const b = createDb();
const quiet = () => {};

const tag = crypto.randomUUID();
const title = `raccoon ${tag}`;
const dirs: string[] = [];
const users: string[] = [];

function film(key: string) {
  return {
    id: `raccoon:${key}`,
    type: "film",
    title,
    year: 2000,
    providers: {},
    source_note: "",
  };
}

function shelf(name: string, item: string) {
  return {
    name,
    date: "2026-10-23",
    description: "",
    entries: [{ item, position: 1 }],
  };
}

// One file per call, under a fresh directory the loader reads whole.
function fixtureDir(name: string, data: unknown) {
  const dir = mkdtempSync(path.join(tmpdir(), "raccoon-"));
  writeFileSync(path.join(dir, name), JSON.stringify(data));
  dirs.push(dir);
  return dir;
}

async function signUp() {
  const email = `db-${crypto.randomUUID()}@example.com`;
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) throw error;
  const [{ id }] = await sql`select id from auth.users where email = ${email}`;
  users.push(id);
  return { email, id: id as string };
}

async function shelvesOf(owner: string) {
  const rows =
    await sql`select name from shelves where owner = ${owner} order by name`;
  return rows.map((r) => r.name as string);
}

async function sourced(key: string) {
  return sql`select 1 from item_sources where source = 'raccoon' and key = ${key}`;
}

beforeAll(async () => {
  // A throwaway user primes the catalog, as every real run after the first has.
  const seed = await signUp();
  await loadFixtures(a.db, {
    email: seed.email,
    dir: fixtureDir("good.json", {
      items: [film(`${tag}-good`)],
      shelves: [shelf(`Raccoon ${tag}`, `raccoon:${tag}-good`)],
    }),
    log: quiet,
  });
});

afterAll(async () => {
  for (const id of users) await sql`delete from auth.users where id = ${id}`;
  await sql`delete from items where title = ${title}`;
  await sql.end();
  await a.close();
  await b.close();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("rummage: the loader", { timeout: 30_000 }, () => {
  it("R9: two loads for one empty user at once leave one copy of the content, not two", async () => {
    const dir = fixtureDir("good.json", {
      items: [film(`${tag}-good`)],
      shelves: [shelf(`Raccoon ${tag}`, `raccoon:${tag}-good`)],
    });
    const racer = await signUp();
    const results = await Promise.allSettled([
      loadFixtures(a.db, { email: racer.email, dir, log: quiet }),
      loadFixtures(b.db, { email: racer.email, dir, log: quiet }),
    ]);

    expect(await shelvesOf(racer.id)).toEqual([`Raccoon ${tag}`]);
    const lost = results.filter((r) => r.status === "rejected");
    expect(lost).toHaveLength(1);
    expect(lost[0].reason).toBeInstanceOf(LoadError);
    expect(String(lost[0].reason.message)).toContain("already has");
  });

  it("R10: a copy or occurrence pointing past every file is a refusal that names it, not a stack trace", async () => {
    const user = await signUp();
    const copy = fixtureDir("copy.json", {
      items: [film(`${tag}-r10`)],
      shelves: [],
      copies: [{ edition: "edition:raccoon-nope", note: "" }],
    });
    await expect(
      loadFixtures(a.db, { email: user.email, dir: copy, log: quiet }),
    ).rejects.toSatisfy(
      (e) =>
        e instanceof LoadError && e.message.includes("edition:raccoon-nope"),
    );

    const occurrence = fixtureDir("occurrence.json", {
      items: [film(`${tag}-r10`)],
      shelves: [],
      occurrences: [{ item: "raccoon:nope", status: "done" }],
    });
    await expect(
      loadFixtures(a.db, { email: user.email, dir: occurrence, log: quiet }),
    ).rejects.toSatisfy(
      (e) => e instanceof LoadError && e.message.includes("raccoon:nope"),
    );

    // Refused before the commit: the file's own item never landed either.
    expect(await sourced(`${tag}-r10`)).toHaveLength(0);
    expect(await shelvesOf(user.id)).toEqual([]);
  });

  it("R11: a file off the shape is named and nothing lands; a --replace that dies mid-write leaves the user as they were", async () => {
    const user = await signUp();
    const bad = fixtureDir("bad.json", { items: [], shelves: [], bogus: 1 });
    await expect(
      loadFixtures(a.db, { email: user.email, dir: bad, log: quiet }),
    ).rejects.toSatisfy(
      (e) => e instanceof LoadError && e.message.includes("bad.json"),
    );

    await loadFixtures(a.db, {
      email: user.email,
      dir: fixtureDir("first.json", {
        items: [film(`${tag}-good`)],
        shelves: [shelf(`Raccoon ${tag}`, `raccoon:${tag}-good`)],
      }),
      log: quiet,
    });
    expect(await shelvesOf(user.id)).toEqual([`Raccoon ${tag}`]);

    const dying = fixtureDir("second.json", {
      items: [film(`${tag}-r11`)],
      shelves: [shelf(`Raccoon ${tag} again`, `raccoon:${tag}-r11`)],
      copies: [{ edition: "edition:raccoon-nope", note: "" }],
    });
    await expect(
      loadFixtures(a.db, {
        email: user.email,
        dir: dying,
        replace: true,
        log: quiet,
      }),
    ).rejects.toThrow();

    expect(await shelvesOf(user.id)).toEqual([`Raccoon ${tag}`]);
    expect(await sourced(`${tag}-r11`)).toHaveLength(0);
  });
});

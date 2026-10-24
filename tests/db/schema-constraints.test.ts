import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The content tables' rules against real Postgres (Ch 1.1, A9): the quiet
// visibility default, the section key, half stars, the anchor pair, what a
// delete takes and what it refuses. Other db test files run beside this one,
// so it checks its own rows by id, never a whole-table count.

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

const tag = crypto.randomUUID();
let owner: string;
let item: string;
let edition: string;
let shelf: string;
let section: string;
let occurrence: string;
const made: Record<string, string> = {};

async function rejects(query: Promise<unknown>, pattern: RegExp) {
  await expect(query).rejects.toThrow(pattern);
}

// Every call outside sql.begin is its own statement, so a reject leaves nothing.
beforeAll(async () => {
  const email = `db-${tag}@example.com`;
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) throw error;
  [{ id: owner }] = await sql`select id from auth.users where email = ${email}`;

  [{ id: item }] = await sql`
    insert into items (type, title) values ('film', ${`constraints ${tag}`})
    returning id`;
  await sql`insert into item_sources (item, source, key) values (${item}, 'test', ${tag})`;
  [{ id: edition }] = await sql`
    insert into editions (item, format) values (${item}, 'dvd') returning id`;
  [{ id: shelf }] = await sql`
    insert into shelves (owner, name) values (${owner}, 'A') returning id`;
  [{ id: section }] = await sql`
    insert into shelf_sections (shelf, name, position) values (${shelf}, 'One', 1)
    returning id`;
  [{ id: made.shelf_entries }] = await sql`
    insert into shelf_entries (shelf, section, item, position)
    values (${shelf}, ${section}, ${item}, 1) returning id`;
  [{ id: occurrence }] = await sql`
    insert into occurrences (owner, item, status) values (${owner}, ${item}, 'done')
    returning id`;
  [{ id: made.journal_entries }] = await sql`
    insert into journal_entries (occurrence, body) values (${occurrence}, 'x')
    returning id`;
  [{ id: made.copies }] = await sql`
    insert into copies (owner, edition) values (${owner}, ${edition}) returning id`;
  made.shelves = shelf;
  made.occurrences = occurrence;
});

afterAll(async () => {
  // The profile is gone by the last test, so the restrict edges no longer hold.
  await sql`delete from profiles where id = ${owner}`;
  await sql`delete from items where id = ${item}`;
  await sql.end();
});

describe("content tables", () => {
  it("a row that never names visibility reads back private, on all five", async () => {
    for (const [table, id] of Object.entries(made)) {
      const [row] =
        await sql`select visibility from ${sql(table)} where id = ${id}`;
      expect(row.visibility, table).toBe("private");
    }
  });

  it("an entry can't sit in another shelf's section", async () => {
    const [{ id: other }] = await sql`
      insert into shelves (owner, name) values (${owner}, 'B') returning id`;
    await rejects(
      sql`insert into shelf_entries (shelf, section, item, position)
          values (${other}, ${section}, ${item}, 1)`,
      /violates foreign key constraint/,
    );
    const inserted = await sql`
      insert into shelf_entries (shelf, section, item, position)
      values (${other}, null, ${item}, 1) returning id`;
    expect(inserted).toHaveLength(1);
  });

  it("stars take half steps from 0.5 to 5.0 and nothing else", async () => {
    for (const stars of ["4.3", "0", "5.5"]) {
      await rejects(
        sql`update occurrences set stars = ${stars} where id = ${occurrence}`,
        /occurrences_stars/,
      );
    }
    for (const stars of ["4.5", "0.5", "5.0"]) {
      const [row] = await sql`
        update occurrences set stars = ${stars} where id = ${occurrence}
        returning stars`;
      expect(row.stars).toBe(Number(stars).toFixed(1));
    }
  });

  it("a journal anchor is a known kind with a value, or neither", async () => {
    await rejects(
      sql`insert into journal_entries (occurrence, body, anchor_kind)
          values (${occurrence}, 'x', 'page')`,
      /journal_entries_anchor/,
    );
    await rejects(
      sql`insert into journal_entries (occurrence, body, anchor_kind, anchor_value)
          values (${occurrence}, 'x', 'verse', '3')`,
      /journal_entries_anchor_kind/,
    );
    const inserted = await sql`
      insert into journal_entries (occurrence, body, anchor_kind, anchor_value)
      values (${occurrence}, 'x', 'page', '12') returning id`;
    expect(inserted).toHaveLength(1);
  });

  it("the catalog refuses a delete while content points at it; a bare item takes its links", async () => {
    await rejects(
      sql`delete from items where id = ${item}`,
      /violates foreign key constraint/,
    );
    await rejects(
      sql`delete from editions where id = ${edition}`,
      /copies_edition_editions_id_fk/,
    );

    const [{ id: bare }] = await sql`
      insert into items (type, title) values ('film', ${`bare ${tag}`}) returning id`;
    await sql`insert into item_sources (item, source, key) values (${bare}, 'test', ${`bare-${tag}`})`;
    await sql`insert into item_relations (from_item, to_item, kind)
              values (${bare}, ${item}, 'adaptation-of')`;
    await sql`delete from items where id = ${bare}`;
    expect(
      await sql`select 1 from item_sources where item = ${bare}`,
    ).toHaveLength(0);
    expect(
      await sql`select 1 from item_relations where from_item = ${bare}`,
    ).toHaveLength(0);
  });

  it("an update moves updated_at and leaves created_at, on every table but profiles", async () => {
    const [{ id }] = await sql`
      insert into shelves (owner, name, created_at, updated_at)
      values (${owner}, 'Stamped', '2000-01-01', '2000-01-01') returning id`;
    const [row] = await sql`
      update shelves set name = 'Restamped' where id = ${id}
      returning created_at, updated_at`;
    expect(row.created_at.getUTCFullYear()).toBe(2000);
    expect(row.updated_at.getUTCFullYear()).toBeGreaterThan(2000);

    const missing = await sql`
      select c.table_name from information_schema.columns c
      where c.table_schema = 'public' and c.column_name = 'updated_at'
        and not exists (
          select 1 from pg_trigger t
          where t.tgrelid = ('public.' || c.table_name)::regclass
            and t.tgname = c.table_name || '_updated_at')`;
    expect(missing.map((r) => r.table_name)).toEqual([]);
  });

  // Last: it takes the user.
  it("a profile delete takes every content row it owns and no catalog row", async () => {
    await sql`delete from profiles where id = ${owner}`;

    for (const table of ["shelves", "occurrences", "copies"]) {
      const rows =
        await sql`select 1 from ${sql(table)} where owner = ${owner}`;
      expect(rows, table).toHaveLength(0);
    }
    for (const [table, id] of Object.entries(made)) {
      const rows = await sql`select 1 from ${sql(table)} where id = ${id}`;
      expect(rows, table).toHaveLength(0);
    }
    expect(
      await sql`select 1 from shelf_sections where id = ${section}`,
    ).toHaveLength(0);
    expect(await sql`select 1 from items where id = ${item}`).toHaveLength(1);
    expect(
      await sql`select 1 from editions where id = ${edition}`,
    ).toHaveLength(1);
  });
});

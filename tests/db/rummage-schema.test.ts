import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The Raccoon's Rummage for Ch 1.1, the schema half (plan section 4b, R1 to
// R8): the checks and keys the constraint test never pushes on. Every row is
// tagged so it cleans up after itself beside the other db files.

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
let film: string;
let book: string;

async function rejects(query: Promise<unknown>, pattern: RegExp) {
  await expect(query).rejects.toThrow(pattern);
}

async function newItem(type = "film", form: string | null = null) {
  const [{ id }] = await sql`
    insert into items (type, title, form)
    values (${type}, ${`raccoon ${tag}`}, ${form}) returning id`;
  return id as string;
}

beforeAll(async () => {
  const email = `db-${tag}@example.com`;
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) throw error;
  [{ id: owner }] = await sql`select id from auth.users where email = ${email}`;
  film = await newItem();
  book = await newItem("book", "novel");
});

afterAll(async () => {
  // auth.users cascades to profiles and everything owned; then the catalog.
  await sql`delete from auth.users where id = ${owner}`;
  await sql`delete from items where title = ${`raccoon ${tag}`}`;
  await sql.end();
});

describe("rummage: the catalog's checks", () => {
  it("R1: a book or comic with no form is rejected, not quietly accepted", async () => {
    // `form in (...)` is null for a null form, and a null check passes.
    await rejects(
      sql`insert into items (type, title) values ('book', ${`raccoon ${tag}`})`,
      /items_form_per_type/,
    );
    await rejects(
      sql`insert into items (type, title) values ('comic', ${`raccoon ${tag}`})`,
      /items_form_per_type/,
    );
  });

  it("R2: every catalog check and key says no, by name", async () => {
    const title = `raccoon ${tag}`;
    const cases: [string, Promise<unknown>][] = [
      [
        // A fourth type fails both checks; Postgres names whichever it hit first.
        "items_(type|form_per_type)",
        sql`insert into items (type, title) values ('game', ${title})`,
      ],
      [
        "items_form_per_type",
        sql`insert into items (type, title, form) values ('film', ${title}, 'novel')`,
      ],
      [
        "items_form_per_type",
        sql`insert into items (type, title, form) values ('book', ${title}, 'issue')`,
      ],
      [
        "items_form_per_type",
        sql`insert into items (type, title, form) values ('comic', ${title}, 'novel')`,
      ],
      [
        "items_released",
        sql`insert into items (type, title, released_on) values ('film', ${title}, '1974-01-01')`,
      ],
      [
        "items_released",
        sql`insert into items (type, title, released_precision) values ('film', ${title}, 'year')`,
      ],
      [
        "items_released_precision",
        sql`insert into items (type, title, released_on, released_precision) values ('film', ${title}, '1974-01-01', 'week')`,
      ],
      [
        "item_comics_series_kind",
        sql`insert into item_comics (item, series_kind) values (${film}, 'limited')`,
      ],
      [
        "item_relations_not_self",
        sql`insert into item_relations (from_item, to_item, kind) values (${film}, ${film}, 'adaptation-of')`,
      ],
      [
        "item_relations_kind",
        sql`insert into item_relations (from_item, to_item, kind) values (${film}, ${book}, 'sequel-of')`,
      ],
      [
        "editions_format",
        sql`insert into editions (item, format) values (${film}, 'vhs')`,
      ],
      [
        "editions_released",
        sql`insert into editions (item, format, released_on) values (${film}, 'dvd', '2001-01-01')`,
      ],
      [
        "shelf_entries_status",
        sql`insert into shelf_entries (shelf, item, position, status) select id, ${film}, 1, 'read' from shelves where owner = ${owner} limit 1`,
      ],
      [
        "occurrences_status",
        sql`insert into occurrences (owner, item, status) values (${owner}, ${film}, 'reading')`,
      ],
    ];
    // The entry case needs a shelf to point at.
    await sql`insert into shelves (owner, name) values (${owner}, 'R2')`;
    for (const [name, query] of cases) {
      await rejects(query, new RegExp(name));
    }

    await sql`insert into item_relations (from_item, to_item, kind) values (${film}, ${book}, 'adaptation-of')`;
    await rejects(
      sql`insert into item_relations (from_item, to_item, kind) values (${film}, ${book}, 'adaptation-of')`,
      /item_relations_from_item_to_item_kind_pk/,
    );
  });
});

describe("rummage: the content tables' keys", () => {
  it("R3: visibility takes its three words and nothing else, on all five", async () => {
    const [{ id: shelf }] = await sql`
      insert into shelves (owner, name) values (${owner}, 'R3') returning id`;
    const [{ id: edition }] = await sql`
      insert into editions (item, format) values (${film}, 'dvd') returning id`;
    const [{ id: occurrence }] = await sql`
      insert into occurrences (owner, item, status) values (${owner}, ${film}, 'done')
      returning id`;
    const items = [film, book, await newItem()];

    const insert = (table: string, visibility: string, n: number) => {
      switch (table) {
        case "shelves":
          return sql`insert into shelves (owner, name, visibility) values (${owner}, ${`R3 ${n}`}, ${visibility})`;
        case "shelf_entries":
          return sql`insert into shelf_entries (shelf, item, position, visibility) values (${shelf}, ${items[n]}, ${n}, ${visibility})`;
        case "occurrences":
          return sql`insert into occurrences (owner, item, status, visibility) values (${owner}, ${film}, 'done', ${visibility})`;
        case "journal_entries":
          return sql`insert into journal_entries (occurrence, body, visibility) values (${occurrence}, 'x', ${visibility})`;
        default:
          return sql`insert into copies (owner, edition, visibility) values (${owner}, ${edition}, ${visibility})`;
      }
    };
    const tables = [
      "shelves",
      "shelf_entries",
      "occurrences",
      "journal_entries",
      "copies",
    ];
    for (const table of tables) {
      await rejects(
        insert(table, "secret", 0),
        new RegExp(`${table}_visibility`),
      );
      await rejects(insert(table, "", 0), new RegExp(`${table}_visibility`));
      await insert(table, "unlisted", 1);
      await insert(table, "public", 2);
    }
  });

  it("R4: a work sits on a shelf once, and a shelf's section names are its own", async () => {
    const [{ id: shelf }] = await sql`
      insert into shelves (owner, name) values (${owner}, 'R4') returning id`;
    await sql`insert into shelf_entries (shelf, item, position) values (${shelf}, ${film}, 1)`;
    await rejects(
      sql`insert into shelf_entries (shelf, item, position) values (${shelf}, ${film}, 2)`,
      /shelf_entries_shelf_item/,
    );
    await sql`insert into shelf_sections (shelf, name, position) values (${shelf}, 'One', 1)`;
    await rejects(
      sql`insert into shelf_sections (shelf, name, position) values (${shelf}, 'One', 2)`,
      /shelf_sections_shelf_name/,
    );
    // The same name on another shelf is fine.
    const [{ id: other }] = await sql`
      insert into shelves (owner, name) values (${owner}, 'R4 b') returning id`;
    await sql`insert into shelf_sections (shelf, name, position) values (${other}, 'One', 1)`;
  });

  it("R5: neither a section nor an entry can change shelf and leave the pair behind", async () => {
    const [{ id: a }] = await sql`
      insert into shelves (owner, name) values (${owner}, 'R5 a') returning id`;
    const [{ id: b }] = await sql`
      insert into shelves (owner, name) values (${owner}, 'R5 b') returning id`;
    const [{ id: section }] = await sql`
      insert into shelf_sections (shelf, name, position) values (${a}, 'One', 1)
      returning id`;
    const [{ id: entry }] = await sql`
      insert into shelf_entries (shelf, section, item, position)
      values (${a}, ${section}, ${film}, 1) returning id`;

    await rejects(
      sql`update shelf_sections set shelf = ${b} where id = ${section}`,
      /shelf_entries_section_shelf_fk/,
    );
    await rejects(
      sql`update shelf_entries set shelf = ${b} where id = ${entry}`,
      /shelf_entries_section_shelf_fk/,
    );
    // Moved with its section cleared, the entry may change shelf.
    await sql`update shelf_entries set shelf = ${b}, section = null where id = ${entry}`;
  });

  it("R6: deleting a section takes its entries and leaves the rest of the shelf", async () => {
    const [{ id: shelf }] = await sql`
      insert into shelves (owner, name) values (${owner}, 'R6') returning id`;
    const [{ id: section }] = await sql`
      insert into shelf_sections (shelf, name, position) values (${shelf}, 'One', 1)
      returning id`;
    const [{ id: inSection }] = await sql`
      insert into shelf_entries (shelf, section, item, position)
      values (${shelf}, ${section}, ${film}, 1) returning id`;
    const [{ id: flat }] = await sql`
      insert into shelf_entries (shelf, item, position)
      values (${shelf}, ${book}, 2) returning id`;

    await sql`delete from shelf_sections where id = ${section}`;
    expect(
      await sql`select 1 from shelf_entries where id = ${inSection}`,
    ).toHaveLength(0);
    expect(
      await sql`select 1 from shelf_entries where id = ${flat}`,
    ).toHaveLength(1);
    expect(await sql`select 1 from shelves where id = ${shelf}`).toHaveLength(
      1,
    );
  });
});

describe("rummage: what a delete reaches", () => {
  it("R7: a copy of an edition holds the edition's item in the catalog", async () => {
    const work = await newItem("comic", "collected");
    const [{ id: edition }] = await sql`
      insert into editions (item, format) values (${work}, 'hardcover') returning id`;
    const [{ id: copy }] = await sql`
      insert into copies (owner, edition) values (${owner}, ${edition}) returning id`;

    // Nothing points at the item itself; the hold is two tables away.
    await rejects(
      sql`delete from items where id = ${work}`,
      /copies_edition_editions_id_fk/,
    );
    expect(
      await sql`select 1 from editions where id = ${edition}`,
    ).toHaveLength(1);

    await sql`delete from copies where id = ${copy}`;
    await sql`delete from items where id = ${work}`;
    expect(
      await sql`select 1 from editions where id = ${edition}`,
    ).toHaveLength(0);
  });

  it("R8: a profile delete leaves the items it created, author cleared (last: it takes the user)", async () => {
    const [{ id: made }] = await sql`
      insert into items (type, title, created_by)
      values ('film', ${`raccoon ${tag}`}, ${owner}) returning id`;
    const [{ id: shelf }] = await sql`
      insert into shelves (owner, name) values (${owner}, 'R8') returning id`;
    await sql`insert into shelf_entries (shelf, item, position) values (${shelf}, ${made}, 1)`;
    const [{ n: before }] = await sql`
      select count(*)::int as n from items where title = ${`raccoon ${tag}`}`;

    await sql`delete from profiles where id = ${owner}`;

    const [row] = await sql`select created_by from items where id = ${made}`;
    expect(row).toEqual({ created_by: null });
    expect(await sql`select 1 from shelves where id = ${shelf}`).toHaveLength(
      0,
    );
    const [{ n: after }] = await sql`
      select count(*)::int as n from items where title = ${`raccoon ${tag}`}`;
    expect(after).toBe(before);
  });
});

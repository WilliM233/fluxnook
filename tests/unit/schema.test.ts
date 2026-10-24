import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";

// The schema's shape without a database: the quiet failures (a missing
// default, a visibility column on the catalog) show here before a migration.
const tables = Object.values(schema as Record<string, unknown>)
  .filter((value): value is PgTable => is(value, PgTable))
  .map((table) => getTableConfig(table));

function config(name: string) {
  const found = tables.find((table) => table.name === name);
  if (!found) throw new Error(`no table ${name} in src/db/schema.ts`);
  return found;
}

function column(table: string, name: string) {
  return config(table).columns.find((c) => c.name === name);
}

const catalog = [
  "items",
  "item_books",
  "item_comics",
  "item_films",
  "item_tv",
  "item_sources",
  "item_relations",
  "editions",
  "edition_sources",
  "edition_contents",
  "franchises",
  "franchise_sources",
  "item_franchises",
];

const content = [
  "shelves",
  "shelf_entries",
  "occurrences",
  "journal_entries",
  "copies",
];

describe("schema", () => {
  it("every table but profiles keeps created_at and updated_at, not null with a default", () => {
    const rest = tables.filter((table) => table.name !== "profiles");
    expect(rest.map((t) => t.name)).toEqual(expect.arrayContaining(catalog));
    for (const table of rest) {
      for (const name of ["created_at", "updated_at"]) {
        const c = column(table.name, name);
        expect(c, `${table.name}.${name}`).toBeDefined();
        expect(c?.notNull, `${table.name}.${name} not null`).toBe(true);
        expect(c?.hasDefault, `${table.name}.${name} default`).toBe(true);
      }
    }
  });

  it("no catalog table, and not profiles, carries visibility", () => {
    for (const name of [...catalog, "profiles"]) {
      expect(column(name, "visibility"), name).toBeUndefined();
    }
  });

  it("items names its type, form and release checks", () => {
    const names = config("items").checks.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "items_type",
        "items_form_per_type",
        "items_released",
      ]),
    );
  });

  it("sources, relations and contents are keyed on their columns together", () => {
    const keys = {
      item_sources: ["source", "key"],
      item_relations: ["from_item", "to_item", "kind"],
      edition_contents: ["edition", "item"],
    };
    for (const [name, columns] of Object.entries(keys)) {
      const { primaryKeys } = config(name);
      expect(primaryKeys, name).toHaveLength(1);
      expect(primaryKeys[0].columns.map((c) => c.name)).toEqual(columns);
    }
  });

  it("every content table carries visibility, not null, private by default", () => {
    for (const name of content) {
      const c = column(name, "visibility");
      expect(c, name).toBeDefined();
      expect(c?.notNull, `${name}.visibility not null`).toBe(true);
      expect(c?.default, `${name}.visibility default`).toBe("private");
    }
  });

  it("owner is on shelves, occurrences and copies; the rest reach it through a parent", () => {
    for (const name of ["shelves", "occurrences", "copies"]) {
      expect(column(name, "owner")?.notNull, name).toBe(true);
    }
    for (const name of ["shelf_sections", "shelf_entries", "journal_entries"]) {
      expect(column(name, "owner"), name).toBeUndefined();
    }
    expect(column("shelf_sections", "visibility")).toBeUndefined();
  });

  it("a shelf entry's section is keyed together with its shelf", () => {
    const composite = config("shelf_entries")
      .foreignKeys.map((fk) => fk.reference())
      .find((ref) => ref.columns.length === 2);
    expect(composite?.columns.map((c) => c.name)).toEqual(["section", "shelf"]);
    expect(getTableConfig(composite?.foreignTable as PgTable).name).toBe(
      "shelf_sections",
    );
    expect(composite?.foreignColumns.map((c) => c.name)).toEqual([
      "id",
      "shelf",
    ]);
  });

  it("items carries summary and cover_path, both nullable (Ch 1.2)", () => {
    for (const name of ["summary", "cover_path"]) {
      const c = column("items", name);
      expect(c, `items.${name}`).toBeDefined();
      expect(c?.notNull, `items.${name} nullable`).toBe(false);
    }
  });

  it("item_films and item_tv are keyed on their item", () => {
    for (const name of ["item_films", "item_tv"]) {
      const item = column(name, "item");
      expect(item?.primary, `${name}.item primary`).toBe(true);
      const ref = config(name).foreignKeys[0]?.reference();
      expect(getTableConfig(ref?.foreignTable as PgTable).name).toBe("items");
    }
  });

  it("item_tv.ended is not null and defaults to false", () => {
    const ended = column("item_tv", "ended");
    expect(ended?.notNull).toBe(true);
    expect(ended?.default).toBe(false);
  });
});

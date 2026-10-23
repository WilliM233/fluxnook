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
  "item_sources",
  "item_relations",
  "editions",
  "edition_sources",
  "edition_contents",
  "franchises",
  "franchise_sources",
  "item_franchises",
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
});

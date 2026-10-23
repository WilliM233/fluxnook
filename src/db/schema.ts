import { type SQL, sql } from "drizzle-orm";
import {
  check,
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

/**
 * One row per auth user, created by the on_auth_user_created trigger.
 * Account data, so no visibility column (ch 0.2 Q2).
 */
export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Every enumeration is text with a check, never a Postgres enum (Ch 1.1
// call): adding a value is a one-line migration, not an ALTER TYPE.
export const itemTypes = ["film", "book", "comic"] as const;
export const bookForms = [
  "novel",
  "novella",
  "collection",
  "story",
  "series",
] as const;
export const comicForms = [
  "issue",
  "one-shot",
  "backup",
  "collected",
  "anthology",
] as const;
export const seriesKinds = [
  "ongoing",
  "micro-series",
  "mini-series",
  "crossover",
  "tie-in",
  "minor",
] as const;
export const releasedPrecisions = ["day", "month", "year"] as const;
export const relationKinds = ["adaptation-of", "contained-in"] as const;
// One vocabulary across types, narrowed per type at the API (Ch 1.1 call).
export const editionFormats = [
  "floppy",
  "tpb",
  "hardcover",
  "omnibus",
  "paperback",
  "ebook",
  "audiobook",
  "dvd",
  "blu-ray",
  "4k",
  "digital",
] as const;

// Literals, not parameters: a check constraint is DDL and takes no binds.
function oneOf(column: SQL | unknown, values: readonly string[]) {
  const list = sql.raw(values.map((v) => `'${v}'`).join(", "));
  return sql`${column} in (${list})`;
}

function timestamps() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  };
}

// A date known to the day, the month or only the year: `1984-05-01` with
// `month` is May 1984. Both null or both set.
function released() {
  return {
    releasedOn: date("released_on"),
    releasedPrecision: text("released_precision", { enum: releasedPrecisions }),
  };
}

// ---- The catalog: shared by every user, deduped on provider ids, no
// visibility. A row outlives whoever added it.

/**
 * A work: one film, book or comic, with its original date (an edition carries
 * its own). A story is a book with form `story`; a collected edition is a
 * `collected` comic with an edition and contents (Roadmap 2026-10-23).
 */
export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type", { enum: itemTypes }).notNull(),
    title: text("title").notNull(),
    form: text("form", { enum: [...bookForms, ...comicForms] }),
    ...released(),
    sourceNote: text("source_note"),
    // Null for loader and provider rows. Set null when the author goes: the
    // catalog is global and carries no ownership (Deferral).
    createdBy: uuid("created_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (t) => [
    check("items_type", oneOf(t.type, itemTypes)),
    check(
      "items_form_per_type",
      sql`(${t.type} = 'film' and ${t.form} is null) or (${t.type} = 'book' and ${oneOf(t.form, bookForms)}) or (${t.type} = 'comic' and ${oneOf(t.form, comicForms)})`,
    ),
    check(
      "items_released",
      sql`(${t.releasedOn} is null) = (${t.releasedPrecision} is null)`,
    ),
    check(
      "items_released_precision",
      sql`${t.releasedPrecision} is null or ${oneOf(t.releasedPrecision, releasedPrecisions)}`,
    ),
  ],
);

/** A book's own columns. A column two types share lives on `items`. */
export const itemBooks = pgTable("item_books", {
  item: uuid("item")
    .primaryKey()
    .references(() => items.id, { onDelete: "cascade" }),
  author: text("author").notNull(),
  ...timestamps(),
});

/** A comic's own columns. `series` is text until Metron brings an entity. */
export const itemComics = pgTable(
  "item_comics",
  {
    item: uuid("item")
      .primaryKey()
      .references(() => items.id, { onDelete: "cascade" }),
    series: text("series"),
    seriesKind: text("series_kind", { enum: seriesKinds }),
    number: integer("number"),
    ...timestamps(),
  },
  (t) => [
    check(
      "item_comics_series_kind",
      sql`${t.seriesKind} is null or ${oneOf(t.seriesKind, seriesKinds)}`,
    ),
  ],
);

/**
 * An item's identity at a source: `letterboxd`/`20ZQ`, or `manual` for a
 * hand-made row, a source like any provider. The catalog dedupes on this key.
 */
export const itemSources = pgTable(
  "item_sources",
  {
    item: uuid("item")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    key: text("key").notNull(),
    url: text("url"),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.source, t.key] })],
);

/**
 * One work pointing at another. `adaptation-of` runs from the adaptation to
 * its source, `contained-in` from the part to the whole. No position until a
 * feature reads one.
 */
export const itemRelations = pgTable(
  "item_relations",
  {
    fromItem: uuid("from_item")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    toItem: uuid("to_item")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: relationKinds }).notNull(),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.fromItem, t.toItem, t.kind] }),
    check("item_relations_kind", oneOf(t.kind, relationKinds)),
    check("item_relations_not_self", sql`${t.fromItem} <> ${t.toItem}`),
  ],
);

/** A printing or release of a work, with its own date. */
export const editions = pgTable(
  "editions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    item: uuid("item")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    format: text("format", { enum: editionFormats }).notNull(),
    title: text("title"),
    ...released(),
    ...timestamps(),
  },
  (t) => [
    check("editions_format", oneOf(t.format, editionFormats)),
    check(
      "editions_released",
      sql`(${t.releasedOn} is null) = (${t.releasedPrecision} is null)`,
    ),
    check(
      "editions_released_precision",
      sql`${t.releasedPrecision} is null or ${oneOf(t.releasedPrecision, releasedPrecisions)}`,
    ),
  ],
);

/** An edition's identity at a source, as `item_sources` is an item's. */
export const editionSources = pgTable(
  "edition_sources",
  {
    edition: uuid("edition")
      .notNull()
      .references(() => editions.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    key: text("key").notNull(),
    url: text("url"),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.source, t.key] })],
);

/**
 * The works an edition holds, in order. A copy of the edition is how each of
 * them is owned; that is never written as `contained-in`.
 */
export const editionContents = pgTable(
  "edition_contents",
  {
    edition: uuid("edition")
      .notNull()
      .references(() => editions.id, { onDelete: "cascade" }),
    item: uuid("item")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.edition, t.item] })],
);

/** A named world that works belong to. Empty until a provider seeds one. */
export const franchises = pgTable("franchises", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ...timestamps(),
});

/** A franchise's identity at a source. */
export const franchiseSources = pgTable(
  "franchise_sources",
  {
    franchise: uuid("franchise")
      .notNull()
      .references(() => franchises.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    key: text("key").notNull(),
    url: text("url"),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.source, t.key] })],
);

/** Which works belong to which franchise. */
export const itemFranchises = pgTable(
  "item_franchises",
  {
    item: uuid("item")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    franchise: uuid("franchise")
      .notNull()
      .references(() => franchises.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.item, t.franchise] })],
);

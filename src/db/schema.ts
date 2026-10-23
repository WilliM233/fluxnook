import { type SQL, sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
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
export const visibilities = ["private", "unlisted", "public"] as const;
export const entryStatuses = ["unmarked", "done", "skipped"] as const;
export const occurrenceStatuses = ["in_progress", "done", "abandoned"] as const;
export const anchorKinds = ["page", "chapter", "episode", "issue"] as const;
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
      // `form in (...)` is null for a null form, and a null check passes, so
      // the book and comic arms say not null out loud (Ch 1.1 B1).
      sql`(${t.type} = 'film' and ${t.form} is null) or (${t.type} = 'book' and ${t.form} is not null and ${oneOf(t.form, bookForms)}) or (${t.type} = 'comic' and ${t.form} is not null and ${oneOf(t.form, comicForms)})`,
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

// ---- A person's own content: every row reaches an owner, through its own
// `owner` column or its parent's, and goes when the profile does. Private by
// default (Roadmap 2026-10-16).

// The column plus its check; the default is what keeps a forgotten field
// private, so the unit and db tests both read it back.
function visibility() {
  return text("visibility", { enum: visibilities })
    .notNull()
    .default("private");
}

function owner() {
  return uuid("owner")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" });
}

/** A person's list of works: flat, or in named sections. */
export const shelves = pgTable(
  "shelves",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    owner: owner(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    // Where the list came from, when it came from somewhere (a Letterboxd list).
    sourceUrl: text("source_url"),
    visibility: visibility(),
    ...timestamps(),
  },
  (t) => [check("shelves_visibility", oneOf(t.visibility, visibilities))],
);

/**
 * A named part of a shelf. Its owner and visibility are the shelf's. The
 * `(id, shelf)` key is what an entry's section points at, so an entry can't
 * sit in another shelf's section.
 */
export const shelfSections = pgTable(
  "shelf_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shelf: uuid("shelf")
      .notNull()
      .references(() => shelves.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    ...timestamps(),
  },
  (t) => [
    unique("shelf_sections_shelf_name").on(t.shelf, t.name),
    unique("shelf_sections_id_shelf").on(t.id, t.shelf),
  ],
);

/**
 * A work on a shelf, once. Positions are integers renumbered on move; `section`
 * is null on a flat shelf. Owner through the shelf.
 */
export const shelfEntries = pgTable(
  "shelf_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shelf: uuid("shelf")
      .notNull()
      .references(() => shelves.id, { onDelete: "cascade" }),
    section: uuid("section"),
    item: uuid("item")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    status: text("status", { enum: entryStatuses })
      .notNull()
      .default("unmarked"),
    visibility: visibility(),
    ...timestamps(),
  },
  (t) => [
    unique("shelf_entries_shelf_item").on(t.shelf, t.item),
    // Cascade: what a section delete does to its entries is Ch 1.5's call
    // (Deferral); its API can move them first.
    foreignKey({
      name: "shelf_entries_section_shelf_fk",
      columns: [t.section, t.shelf],
      foreignColumns: [shelfSections.id, shelfSections.shelf],
    }).onDelete("cascade"),
    check("shelf_entries_status", oneOf(t.status, entryStatuses)),
    check("shelf_entries_visibility", oneOf(t.visibility, visibilities)),
  ],
);

/**
 * One read or watch of a work. Hangs off the item, never a copy; stars live
 * here, in half steps.
 */
export const occurrences = pgTable(
  "occurrences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    owner: owner(),
    item: uuid("item")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    status: text("status", { enum: occurrenceStatuses }).notNull(),
    startedOn: date("started_on"),
    finishedOn: date("finished_on"),
    stars: numeric("stars", { precision: 2, scale: 1 }),
    visibility: visibility(),
    ...timestamps(),
  },
  (t) => [
    check("occurrences_status", oneOf(t.status, occurrenceStatuses)),
    // numeric(2,1) stores 4.3 happily; the doubling is what holds half steps.
    check(
      "occurrences_stars",
      sql`${t.stars} is null or (${t.stars} >= 0.5 and ${t.stars} <= 5.0 and ${t.stars} * 2 = trunc(${t.stars} * 2))`,
    ),
    check("occurrences_visibility", oneOf(t.visibility, visibilities)),
  ],
);

/**
 * What someone wrote during an occurrence, optionally pinned to a place in the
 * work: page 12, episode S02E03. Owner through the occurrence.
 */
export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurrence: uuid("occurrence")
      .notNull()
      .references(() => occurrences.id, { onDelete: "cascade" }),
    writtenAt: timestamp("written_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    body: text("body").notNull(),
    anchorKind: text("anchor_kind", { enum: anchorKinds }),
    anchorValue: text("anchor_value"),
    visibility: visibility(),
    ...timestamps(),
  },
  (t) => [
    check(
      "journal_entries_anchor_kind",
      sql`${t.anchorKind} is null or ${oneOf(t.anchorKind, anchorKinds)}`,
    ),
    check(
      "journal_entries_anchor",
      sql`(${t.anchorKind} is null) = (${t.anchorValue} is null)`,
    ),
    check("journal_entries_visibility", oneOf(t.visibility, visibilities)),
  ],
);

/** An owned edition. What it holds is owned through its contents. */
export const copies = pgTable(
  "copies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    owner: owner(),
    edition: uuid("edition")
      .notNull()
      .references(() => editions.id, { onDelete: "restrict" }),
    condition: text("condition"),
    acquiredOn: date("acquired_on"),
    note: text("note").notNull().default(""),
    visibility: visibility(),
    ...timestamps(),
  },
  (t) => [check("copies_visibility", oneOf(t.visibility, visibilities))],
);

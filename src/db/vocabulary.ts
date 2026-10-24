// The catalog's and the content tables' vocabularies, apart from the table
// definitions so a client component can import them without Drizzle.

// Every enumeration is text with a check, never a Postgres enum (Ch 1.1
// call): adding a value is a one-line migration, not an ALTER TYPE.
// `tv` is a show; the show is the item, seasons and episodes are anchors (Ch 1.2).
export const itemTypes = ["film", "book", "comic", "tv"] as const;
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

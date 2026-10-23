/**
 * The shape of a fixture file under `supabase/seed/fixtures/`.
 *
 * A fixture is media items, the shelves that point at them and the relations
 * between them, built from a raw export by `npm run fixtures:build`. Chapter
 * 0.6 added the `comic` variant and the collection: editions with contents,
 * the copies that own them, the occurrences that say what was read, and
 * shelves with sections. `tests/unit/fixtures.test.ts` holds every fixture to
 * this shape; the Volume 1 Ch 1 loader reads it to fill the tables. A chapter
 * that brings a new media type adds its variant to `item` and its provider
 * names to `providers`.
 */
import { z } from "zod";

// <source>:<key>, so ids from different sources can't collide and each one
// says where it came from.
const itemId = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]*:[A-Za-z0-9][A-Za-z0-9._-]*$/,
    "item ids are <source>:<key>",
  );

// An edition id would pass as an item id, so it is told apart by its prefix.
const editionId = z
  .string()
  .regex(
    /^edition:[A-Za-z0-9][A-Za-z0-9._-]*$/,
    "edition ids are edition:<key>",
  );

// https only: the loader turns these into links, and z.url() alone takes
// javascript: and file:.
const httpsUrl = z.url({ protocol: /^https$/ });

// An id whose source is a provider names the same thing as that provider's
// URL, so the loader can't key one film and link to another.
const providerUrl = {
  letterboxd: (key: string) => `https://boxd.it/${key}`,
};

const itemCore = z.strictObject({
  id: itemId,
  title: z.string().min(1),
  year: z.number().int(),
  providers: z.partialRecord(z.enum(["letterboxd"]), httpsUrl),
  source_note: z.string(),
});

const film = itemCore.extend({ type: z.literal("film") });

// A story is a book with form `story`, not a type of its own (Ch 0.5).
const book = itemCore.extend({
  type: z.literal("book"),
  form: z.enum(["novel", "novella", "collection", "story", "series"]),
  author: z.string().min(1),
});

// Forms in collectors' words (Roadmap 2026-10-23): a backup is a short
// printed inside another comic, an anthology a host that isn't the run's own,
// collected a trade or hardcover as a work. `year` may be null here alone,
// since a hand-made sheet has undated rows; `source_date` keeps the cell.
const comic = itemCore.extend({
  type: z.literal("comic"),
  year: z.number().int().nullable(),
  month: z.number().int().min(1).max(12).optional(),
  source_date: z.string(),
  form: z.enum(["issue", "one-shot", "backup", "collected", "anthology"]),
  series: z.string().min(1).nullable(),
  series_kind: z
    .enum([
      "ongoing",
      "micro-series",
      "mini-series",
      "crossover",
      "tie-in",
      "minor",
    ])
    .nullable(),
  number: z.number().int().nullable(),
});

export const item = z.discriminatedUnion("type", [film, book, comic]);

const entry = z.strictObject({
  item: itemId,
  position: z.number().int().positive(),
});

// A shelf is flat (`entries`) or sectioned (`sections`), never both; the
// superRefine below says which is wrong, where a union would say only
// "Invalid input". Positions restart in each section.
const section = z.strictObject({
  name: z.string().min(1),
  entries: z.array(entry),
});

const shelf = z.strictObject({
  name: z.string().min(1),
  date: z.iso.date(),
  // A source with no public link (L's sheet, Ch 0.6) gives none.
  url: httpsUrl.optional(),
  description: z.string(),
  entries: z.array(entry).optional(),
  sections: z.array(section).optional(),
});

// The name fixes the direction: adaptation-of runs from the adaptation to its
// source, contained-in from the part to the whole. Either end may be an item
// in another fixture file; tests/unit/fixtures.test.ts resolves them over
// every file together.
const relation = z.strictObject({
  type: z.enum(["adaptation-of", "contained-in"]),
  from: itemId,
  to: itemId,
});

// A printing of an item. For comics, `contents` are the issues it collects,
// so a copy of the edition is how each of them is "owned via" it; that is
// never written as contained-in (Roadmap 2026-10-23).
const edition = z.strictObject({
  id: editionId,
  item: itemId,
  format: z.enum(["floppy", "tpb", "hardcover", "omnibus"]),
  contents: z.array(itemId),
});

// An owned thing. Read is never derived from a copy; that's an occurrence.
const copy = z.strictObject({ edition: editionId, note: z.string() });

// One read or watch of an item. A sheet's read flag carries no date, so only
// the status is here until occurrences are rows (Volume 1 Ch 1).
const occurrence = z.strictObject({
  item: itemId,
  status: z.enum(["done"]),
});

// An item the raw file gave nothing to build from, recorded rather than
// filled in.
const gap = z.strictObject({ item: itemId, reason: z.string().min(1) });

// Everything past items and shelves defaults to empty, so a file without an
// array (king-films has none) doesn't carry an empty key.
export const fixture = z
  .strictObject({
    items: z.array(item),
    shelves: z.array(shelf),
    relations: z.array(relation).default([]),
    editions: z.array(edition).default([]),
    copies: z.array(copy).default([]),
    occurrences: z.array(occurrence).default([]),
    gaps: z.array(gap).default([]),
  })
  .superRefine((file, ctx) => {
    const ids = new Set<string>();
    file.items.forEach(({ id, providers }, i) => {
      if (ids.has(id)) {
        ctx.addIssue({
          code: "custom",
          path: ["items", i, "id"],
          message: `item id ${id} appears more than once`,
        });
      }
      ids.add(id);
      const [source, key] = id.split(":");
      if (source in providerUrl) {
        const provider = source as keyof typeof providerUrl;
        const expected = providerUrl[provider](key);
        if (providers[provider] !== expected) {
          ctx.addIssue({
            code: "custom",
            path: ["items", i, "providers", provider],
            message: `item ${id} should link to ${expected}`,
          });
        }
      }
    });

    const checkEntries = (
      entries: z.infer<typeof entry>[],
      path: (string | number)[],
      where: string,
    ) => {
      entries.forEach(({ item: id, position }, ei) => {
        if (!ids.has(id)) {
          ctx.addIssue({
            code: "custom",
            path: [...path, ei, "item"],
            message: `${where}entry ${position} points at ${id}, which is not an item in this file`,
          });
        }
        // Gaps are fine; repeats and steps back would make position order
        // and array order disagree.
        const previous = entries[ei - 1]?.position;
        if (previous !== undefined && position <= previous) {
          ctx.addIssue({
            code: "custom",
            path: [...path, ei, "position"],
            message: `${where}entry ${position} comes after entry ${previous}; positions must increase`,
          });
        }
      });
    };
    file.shelves.forEach((s, si) => {
      if ((s.entries === undefined) === (s.sections === undefined)) {
        ctx.addIssue({
          code: "custom",
          path: ["shelves", si],
          message: `shelf ${JSON.stringify(s.name)} must have entries or sections, not both and not neither`,
        });
      }
      if (s.entries) checkEntries(s.entries, ["shelves", si, "entries"], "");
      const names = new Set<string>();
      s.sections?.forEach((sec, ki) => {
        const path = ["shelves", si, "sections", ki];
        if (names.has(sec.name)) {
          ctx.addIssue({
            code: "custom",
            path: [...path, "name"],
            message: `section ${JSON.stringify(sec.name)} appears more than once on shelf ${JSON.stringify(s.name)}`,
          });
        }
        names.add(sec.name);
        checkEntries(
          sec.entries,
          [...path, "entries"],
          `section ${JSON.stringify(sec.name)} `,
        );
      });
    });

    const editionIds = new Set<string>();
    file.editions.forEach(({ id, item: of, contents }, i) => {
      if (editionIds.has(id)) {
        ctx.addIssue({
          code: "custom",
          path: ["editions", i, "id"],
          message: `edition id ${id} appears more than once`,
        });
      }
      editionIds.add(id);
      // An edition lives in the file of the work it prints; what it collects
      // may be anywhere, and the cross-file test resolves that.
      if (!ids.has(of)) {
        ctx.addIssue({
          code: "custom",
          path: ["editions", i, "item"],
          message: `edition ${id} is of ${of}, which is not an item in this file`,
        });
      }
      const seen = new Set<string>();
      contents.forEach((content, ci) => {
        if (content === of || seen.has(content)) {
          ctx.addIssue({
            code: "custom",
            path: ["editions", i, "contents", ci],
            message:
              content === of
                ? `edition ${id} lists its own item ${of} in its contents`
                : `edition ${id} lists ${content} more than once`,
          });
        }
        seen.add(content);
      });
    });

    const relations = new Set<string>();
    file.relations.forEach(({ type, from, to }, i) => {
      const key = `${type} ${from} ${to}`;
      if (from === to || relations.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["relations", i],
          message:
            from === to
              ? `relation ${i} (${type}) runs from ${from} to itself`
              : `relation ${type} ${from} -> ${to} appears more than once`,
        });
      }
      relations.add(key);
    });
  });

export type Fixture = z.infer<typeof fixture>;
export type Relation = z.infer<typeof relation>;
export type Edition = z.infer<typeof edition>;

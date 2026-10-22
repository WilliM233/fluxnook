/**
 * The shape of a fixture file under `supabase/seed/fixtures/`.
 *
 * A fixture is media items and the shelves that point at them, built from a
 * raw export by `npm run fixtures:build`. `tests/unit/fixtures.test.ts` holds
 * every fixture to this shape; the Volume 1 Ch 1 loader reads it to fill the
 * tables. A chapter that brings a new media type adds its variant to `item`
 * and its provider names to `providers`.
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

export const item = z.discriminatedUnion("type", [film]);

const entry = z.strictObject({
  item: itemId,
  position: z.number().int().positive(),
});

const shelf = z.strictObject({
  name: z.string().min(1),
  date: z.iso.date(),
  url: httpsUrl,
  description: z.string(),
  entries: z.array(entry),
});

export const fixture = z
  .strictObject({ items: z.array(item), shelves: z.array(shelf) })
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
    file.shelves.forEach((s, si) => {
      s.entries.forEach(({ item: id, position }, ei) => {
        if (!ids.has(id)) {
          ctx.addIssue({
            code: "custom",
            path: ["shelves", si, "entries", ei, "item"],
            message: `entry ${position} points at ${id}, which is not an item in this file`,
          });
        }
        // Gaps are fine; repeats and steps back would make position order
        // and array order disagree.
        const previous = s.entries[ei - 1]?.position;
        if (previous !== undefined && position <= previous) {
          ctx.addIssue({
            code: "custom",
            path: ["shelves", si, "entries", ei, "position"],
            message: `entry ${position} comes after entry ${previous}; positions must increase`,
          });
        }
      });
    });
  });

export type Fixture = z.infer<typeof fixture>;

import { z } from "zod";

// Postgres text can't hold a NUL byte, so it is a 400 here, never the
// database's 500 (Rummage R3).
const NUL = "That has a character a shelf can't hold.";
const noNul = (text: string) => !text.includes("\0");

// A shelf's name is trimmed and 1 to 120 characters; a description is kept
// as typed, up to 2000 (A3). A section's name follows the shelf's rule.
export const shelfName = (blank: string) =>
  z
    .string()
    .trim()
    .min(1, blank)
    .max(120, "At most 120 characters.")
    .refine(noNul, NUL);

const description = z
  .string()
  .max(2000, "At most 2000 characters.")
  .refine(noNul, NUL);

const NOTHING = "Nothing to change.";

/** Request body of `POST /api/v1/shelves` (A3). */
export const createShelfSchema = z.strictObject({
  name: shelfName("Give the shelf a name."),
  description: description.default(""),
});

/** The most works one `?items=` may ask about, as one add may carry. */
export const ASKED_LIMIT = 500;

const isUuid = (id: string) => z.uuid().safeParse(id).success;

// Checked as one list, so a bad id is a sentence at `items`, not `items.3`.
// Folded first, so one work in two cases is asked about once (1.4.3's R3).
const askedItems = z
  .string()
  .transform((list) => list.split(",").map((id) => id.trim().toLowerCase()))
  .refine((ids) => ids.every(isUuid), "Each one a work's id.")
  .refine(
    (ids) => ids.length <= ASKED_LIMIT,
    `At most ${ASKED_LIMIT} works in one go.`,
  )
  .refine((ids) => new Set(ids).size === ids.length, "Each work once.");

/**
 * Query of `GET /api/v1/shelves` (A3, C9): one work (`item`), many
 * (`items`, comma-separated), or neither; parsed to the one list `has`
 * counts against.
 */
export const listShelvesQuerySchema = z
  .strictObject({
    item: z
      .uuid("A work's id.")
      .transform((id) => id.toLowerCase())
      .optional(),
    items: askedItems.optional(),
  })
  .refine((query) => !(query.item && query.items), {
    message: "One question at a time: item, or items.",
    path: ["items"],
  })
  .transform(({ item, items }) => ({ items: item ? [item] : (items ?? []) }));

/** Request body of `PATCH /api/v1/shelves/<id>` (A3): either field, at least one. */
export const patchShelfSchema = z
  .strictObject({
    name: shelfName("Give the shelf a name.").optional(),
    description: description.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, NOTHING);

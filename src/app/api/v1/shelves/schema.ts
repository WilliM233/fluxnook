import { z } from "zod";

// A shelf's name is trimmed and 1 to 120 characters; a description is kept
// as typed, up to 2000 (A3). A section's name follows the shelf's rule.
export const shelfName = (blank: string) =>
  z.string().trim().min(1, blank).max(120, "At most 120 characters.");

const description = z.string().max(2000, "At most 2000 characters.");

const NOTHING = "Nothing to change.";

/** Request body of `POST /api/v1/shelves` (A3). */
export const createShelfSchema = z.strictObject({
  name: shelfName("Give the shelf a name."),
  description: description.default(""),
});

/** Request body of `PATCH /api/v1/shelves/<id>` (A3): either field, at least one. */
export const patchShelfSchema = z
  .strictObject({
    name: shelfName("Give the shelf a name.").optional(),
    description: description.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, NOTHING);

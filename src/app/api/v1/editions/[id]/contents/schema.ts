import { z } from "zod";

/** The most comics one edition's contents may name; an omnibus holds under a hundred. */
export const CONTENTS_LIMIT = 500;

/**
 * Request body of `PUT /api/v1/editions/<id>/contents` (A6): the comics the
 * edition holds, in the order it prints them, each once.
 */
export const editionContentsSchema = z.strictObject({
  // One comic in any case: the ids are folded before "each once" (Rummage R3).
  items: z
    .array(z.uuid().transform((id) => id.toLowerCase()))
    .max(CONTENTS_LIMIT, `At most ${CONTENTS_LIMIT} comics in one edition.`)
    .refine((ids) => new Set(ids).size === ids.length, "Each comic once."),
});

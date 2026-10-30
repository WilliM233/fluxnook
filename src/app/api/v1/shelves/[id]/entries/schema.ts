import { z } from "zod";
import { entryStatuses } from "@/db/vocabulary";

/** The most works one add may carry; the longest run in the catalog is 150. */
export const ENTRIES_LIMIT = 500;

/**
 * Request body of `POST /api/v1/shelves/<id>/entries` (A5): works in the
 * order they go on, each once, into a section or the unsectioned part.
 */
export const addEntriesSchema = z.strictObject({
  // One work in any case: ids are folded before "each once" (1.4.3's R3).
  items: z
    .array(z.uuid().transform((id) => id.toLowerCase()))
    .min(1, "Pick at least one work.")
    .max(ENTRIES_LIMIT, `At most ${ENTRIES_LIMIT} works in one go.`)
    .refine((ids) => new Set(ids).size === ids.length, "Each work once."),
  // null is no section, as in the move body; so is leaving it out (Rummage R1).
  section: z.uuid().nullable().optional(),
});

/** `PATCH /api/v1/shelves/<id>/entries/<eid>` with a status. */
export const statusSchema = z.strictObject({ status: z.enum(entryStatuses) });

/** The same `PATCH` with a move: into a section (null: none) at a 0-based index. */
export const moveSchema = z.strictObject({
  section: z.uuid().nullable(),
  index: z.int("A whole number.").min(0, "Indexes start at 0."),
});

const ONE_CHANGE = "One change at a time: a status, or a section and an index.";

/**
 * The entry `PATCH`, one of two bodies told apart by their keys (A5): a
 * status alone, or a section and an index. Keys of both, or of neither, are
 * one 400; a body that picks one is checked by that one's schema.
 */
export const patchEntrySchema = z.unknown().transform((body, ctx) => {
  const keys = new Set(
    body && typeof body === "object" ? Object.keys(body) : [],
  );
  const schema =
    keys.has("status") && !keys.has("section") && !keys.has("index")
      ? statusSchema
      : !keys.has("status") && keys.has("section") && keys.has("index")
        ? moveSchema
        : null;
  if (!schema) {
    ctx.addIssue({ code: "custom", message: ONE_CHANGE });
    return z.NEVER;
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      if (issue.code === "unrecognized_keys") {
        for (const key of issue.keys) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "Not a field for this type.",
          });
        }
      } else {
        ctx.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
      }
    }
    return z.NEVER;
  }
  return parsed.data;
});

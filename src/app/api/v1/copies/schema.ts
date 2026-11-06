import { z } from "zod";
import { conditions, editionFormats } from "@/db/vocabulary";
import { localToday } from "@/lib/journal/forms";
import { EDGES, isoDate, NOTHING } from "../occurrences/schema";

// Postgres text can't hold a NUL byte, so it is a 400 here, never the
// database's 500 (1.5.1 Rummage R3).
const NUL = "That has a character the collection can't hold.";

const DOOR = "Say which printing, or which work and format.";
const NOT_YET = "A day you'll have it isn't a day you have it.";
const CONDITION = "A condition is new, fine, good, fair or poor.";

// One work in any case (1.4.3's R3).
const id = (message: string) =>
  z.uuid(message).transform((value) => value.toLowerCase());

/** The day it came: the shared date, and "today" read at parse time, never at import. */
const acquiredOn = isoDate.refine((day) => day <= localToday(), NOT_YET);

const condition = z.enum(conditions, CONDITION);

/** A copy's note: trimmed at its ends, line breaks inside kept. */
const note = z
  .string("A note is text.")
  .transform((text) => text.replace(EDGES, ""))
  .pipe(
    z
      .string()
      .max(2_000, "At most 2,000 characters.")
      .refine((text) => !text.includes("\0"), NUL),
  );

// null is the field left out, as on a PATCH (1.6.1 R3).
const fields = {
  condition: condition.nullable().optional(),
  acquiredOn: acquiredOn.nullable().optional(),
  note: note.optional(),
};

/**
 * Request body of `POST /api/v1/copies` (A3): exactly one door, the printing,
 * or the work and a format. The format's fit to the work is the lib's, which
 * has the work; here it is only a word of the vocabulary.
 */
export const createCopySchema = z
  .strictObject({
    edition: id("A printing's id.").optional(),
    item: id("A work's id.").optional(),
    format: z.enum(editionFormats, "That isn't a format.").optional(),
    ...fields,
  })
  .superRefine((body, ctx) => {
    const named = body.edition !== undefined;
    const asked = body.item !== undefined;
    if (named === asked || (named && body.format !== undefined)) {
      ctx.addIssue({ code: "custom", message: DOOR });
    } else if (asked && body.format === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["format"],
        message: "Say which format.",
      });
    }
  })
  .transform(({ edition, item, format, ...rest }) =>
    edition !== undefined
      ? { edition, ...rest }
      : {
          // The refinement above has seen to both.
          item: item as string,
          format: format as (typeof editionFormats)[number],
          ...rest,
        },
  );

/** `PATCH /api/v1/copies/<id>` (A3): `null` clears; a copy's printing never changes. */
export const patchCopySchema = z
  .strictObject(fields)
  .refine((body) => Object.keys(body).length > 0, NOTHING);

/** `GET /api/v1/copies?item=` (A4). */
export const copiesQuerySchema = z.strictObject({
  item: id("A work's id."),
});

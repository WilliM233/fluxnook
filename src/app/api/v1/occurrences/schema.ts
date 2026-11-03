import { z } from "zod";
import { anchorKinds, occurrenceStatuses } from "@/db/vocabulary";
import { FINISHED_BEFORE, STILL_GOING } from "@/lib/journal/errors";

// Postgres text can't hold a NUL byte, so it is a 400 here, never the
// database's 500 (1.5.1 Rummage R3).
const NUL = "That has a character the journal can't hold.";
const noNul = (text: string) => !text.includes("\0");

const HALF = "Stars go in half steps from 0.5 to 5.";
export const NOTHING = "Nothing to change.";
const BOTH = "Say where, or leave both out.";

/** Stars in half steps, 0.5 to 5 (A3); 4.3 is a 400 before the database. */
export const halfStep = z
  .number(HALF)
  .min(0.5, HALF)
  .max(5, HALF)
  .refine((stars) => Number.isInteger(stars * 2), HALF);

// The ISO shape has a year 0; Postgres doesn't, so it is a 400 here, never
// the database's 500 (Rummage R1, R2).
export const NO_YEAR_ZERO = "There was no year 0.";
export const notYearZero = (iso: string) => !iso.startsWith("0000");

const isoDate = z.iso
  .date("A date as YYYY-MM-DD.")
  .refine(notYearZero, NO_YEAR_ZERO);

// A paste from a page or a phone keyboard carries zero-width spaces and
// BOMs that `trim` keeps; nothing visible is nothing written (Rummage R5).
const EDGES = /^[\s​-‍⁠﻿]+|[\s​-‍⁠﻿]+$/g;

/** An entry's text: trimmed at its ends, line breaks inside kept (A4). */
export const entryBody = z
  .string("Write something.")
  .transform((body) => body.replace(EDGES, ""))
  .pipe(
    z
      .string()
      .min(1, "Write something.")
      .max(20_000, "At most 20,000 characters.")
      .refine(noNul, NUL),
  );

/** Where in the work: "112", "S02E03", "xii". */
export const anchorValue = z
  .string("Say where.")
  .trim()
  .min(1, "Say where.")
  .max(40, "At most 40 characters.")
  .refine(noNul, NUL);

/**
 * The anchor's two keys come together, and are both set or both null, as the
 * table's check says; the 400 lands on the one missing or cleared alone.
 */
export function bothOrNeither(
  body: { anchorKind?: unknown; anchorValue?: unknown },
  ctx: z.RefinementCtx,
) {
  const missing =
    (body.anchorKind === undefined) !== (body.anchorValue === undefined)
      ? body.anchorKind === undefined
      : (body.anchorKind == null) !== (body.anchorValue == null)
        ? body.anchorKind == null
        : null;
  if (missing === null) return;
  ctx.addIssue({
    code: "custom",
    path: [missing ? "anchorKind" : "anchorValue"],
    message: BOTH,
  });
}

/** A3's date rules, at `finishedOn` as the lib says them. */
function datesInOrder(
  body: {
    status?: string;
    startedOn?: string | null;
    finishedOn?: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (body.startedOn && body.finishedOn && body.finishedOn < body.startedOn) {
    ctx.addIssue({
      code: "custom",
      path: ["finishedOn"],
      message: FINISHED_BEFORE,
    });
  }
  if (body.status === "in_progress" && body.finishedOn) {
    ctx.addIssue({
      code: "custom",
      path: ["finishedOn"],
      message: STILL_GOING,
    });
  }
}

const firstEntry = z
  .strictObject({
    body: entryBody,
    anchorKind: z.enum(anchorKinds).optional(),
    anchorValue: anchorValue.optional(),
  })
  .superRefine((entry, ctx) => bothOrNeither(entry, ctx));

/** Request body of `POST /api/v1/occurrences` (A3): a read and, if you like, its first entry. */
export const createReadSchema = z
  .strictObject({
    // One work in any case (1.4.3's R3).
    item: z.uuid("A work's id.").transform((id) => id.toLowerCase()),
    status: z.enum(occurrenceStatuses),
    // null is the date left out, as on a PATCH (Rummage R3, S1).
    startedOn: isoDate.nullable().optional(),
    finishedOn: isoDate.nullable().optional(),
    stars: halfStep.nullable().optional(),
    entry: firstEntry.optional(),
  })
  .superRefine(datesInOrder);

/** `PATCH /api/v1/occurrences/<id>` (A3): `null` clears a date or the stars. */
export const patchReadSchema = z
  .strictObject({
    status: z.enum(occurrenceStatuses).optional(),
    startedOn: isoDate.nullable().optional(),
    finishedOn: isoDate.nullable().optional(),
    stars: halfStep.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, NOTHING)
  .superRefine(datesInOrder);

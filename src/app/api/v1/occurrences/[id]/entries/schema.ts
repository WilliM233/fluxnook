import { z } from "zod";
import { anchorKinds } from "@/db/vocabulary";
import {
  anchorValue,
  bothOrNeither,
  entryBody,
  NO_YEAR_ZERO,
  NOTHING,
  notYearZero,
} from "../../schema";

// A browser's clock runs a little ahead of the server's; more than a minute
// ahead is a date in the future (A4).
const AHEAD_MS = 60_000;

// Postgres holds a zone up to 15:59 either side of UTC; the ISO shape takes
// any hh:mm, so a wider one is a 400 here, never the database's 500
// (Rummage R2). The real zones run from -12:00 to +14:00.
const zoneHeld = (at: string) => {
  const zone = /([+-])(\d\d):?(\d\d)$/.exec(at);
  return !zone || Number(zone[2]) < 16;
};

/**
 * When an entry was written: an ISO timestamp with its zone, passed on as
 * the string given so its microseconds reach Postgres, and not in the future.
 */
const writtenAt = z.iso
  .datetime({ offset: true, message: "A timestamp, with its zone." })
  .refine(notYearZero, NO_YEAR_ZERO)
  .refine(zoneHeld, "No zone is that far from UTC.")
  .refine(
    (at) => Date.parse(at) <= Date.now() + AHEAD_MS,
    "That's in the future.",
  );

/** Request body of `POST /api/v1/occurrences/<id>/entries` (A4). */
export const createEntrySchema = z
  .strictObject({
    body: entryBody,
    anchorKind: z.enum(anchorKinds).optional(),
    anchorValue: anchorValue.optional(),
    writtenAt: writtenAt.optional(),
  })
  .superRefine(bothOrNeither);

/** `PATCH /api/v1/occurrences/<id>/entries/<eid>`: the anchor pair together, `null` both to clear. */
export const patchEntrySchema = z
  .strictObject({
    body: entryBody.optional(),
    anchorKind: z.enum(anchorKinds).nullable().optional(),
    anchorValue: anchorValue.nullable().optional(),
    writtenAt: writtenAt.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, NOTHING)
  .superRefine(bothOrNeither);

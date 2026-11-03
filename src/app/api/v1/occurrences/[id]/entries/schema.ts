import { z } from "zod";
import { anchorKinds } from "@/db/vocabulary";
import { anchorValue, bothOrNeither, entryBody, NOTHING } from "../../schema";

// A browser's clock runs a little ahead of the server's; more than a minute
// ahead is a date in the future (A4).
const AHEAD_MS = 60_000;

/**
 * When an entry was written: an ISO timestamp with its zone, passed on as
 * the string given so its microseconds reach Postgres, and not in the future.
 */
const writtenAt = z.iso
  .datetime({ offset: true, message: "A timestamp, with its zone." })
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

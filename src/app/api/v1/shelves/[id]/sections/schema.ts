import { z } from "zod";
import { shelfName } from "../../schema";

const name = shelfName("Give the section a name.");

/** Request body of `POST /api/v1/shelves/<id>/sections` (A4). */
export const createSectionSchema = z.strictObject({ name });

/**
 * Request body of `PATCH /api/v1/shelves/<id>/sections/<sid>` (A4): a new
 * name, a 1-based position among the shelf's sections, or both.
 */
export const patchSectionSchema = z
  .strictObject({
    name: name.optional(),
    position: z
      .int("A whole number.")
      .min(1, "Positions start at 1.")
      .optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "Nothing to change.");

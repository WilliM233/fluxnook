import { z } from "zod";

// The items API caps a series text at 200 (Rummage S2); no longer label names a run.
const label = z
  .string()
  .trim()
  .min(1, "Name the run you added by hand.")
  .max(200, "No run added by hand has a name that long.");

/**
 * Request body of `POST /api/v1/series/import` (A5, 1.4.2 C12): a Comic Vine
 * volume key as the catalog stores it, whether its issues are single issues
 * or collected editions, the format a collected run comes in, and the
 * hand-entered group it attaches to: `{ series }` by its series text,
 * `{ collected }` by its title stem, which only collected editions take.
 */
export const seriesImportSchema = z
  .strictObject({
    source: z.literal("comicvine"),
    key: z
      .string()
      .regex(
        /^volume\/[1-9][0-9]{0,9}$/,
        "A Comic Vine volume key is volume/<id>, with no 4050- in front.",
      ),
    form: z.enum(
      ["issue", "collected"],
      "A run is single issues or collected editions.",
    ),
    format: z
      .enum(
        ["tpb", "hardcover", "omnibus"],
        "A collected edition is a trade paperback, a hardcover or an omnibus.",
      )
      .optional(),
    attachTo: z
      .union(
        [
          z.strictObject({ series: label }),
          z.strictObject({ collected: label }),
        ],
        "Attach to a run as { series } or { collected }.",
      )
      .optional(),
  })
  .superRefine((body, context) => {
    if (body.form === "collected" && !body.format) {
      context.addIssue({
        code: "custom",
        path: ["format"],
        message:
          "A run of collected editions needs a format: trade paperback, hardcover or omnibus.",
      });
    }
    if (body.form === "issue" && body.format) {
      context.addIssue({
        code: "custom",
        path: ["format"],
        message: "Single issues take no format.",
      });
    }
    if (
      body.form === "issue" &&
      body.attachTo &&
      "collected" in body.attachTo
    ) {
      context.addIssue({
        code: "custom",
        path: ["attachTo"],
        message: "Single issues attach to a run, not to collected editions.",
      });
    }
  });

export type SeriesImport = z.infer<typeof seriesImportSchema>;

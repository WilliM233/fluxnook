import { z } from "zod";

/**
 * Request body of `POST /api/v1/items/import`. Only keys a provider could
 * return: TMDB's `movie/` and `tv/`, Open Library's `works/`.
 */
export const importRequestSchema = z.discriminatedUnion("source", [
  z.strictObject({
    source: z.literal("tmdb"),
    key: z.string().regex(/^(movie|tv)\/[0-9]+$/),
    attachTo: z.uuid().optional(),
  }),
  z.strictObject({
    source: z.literal("openlibrary"),
    key: z.string().regex(/^works\/OL[0-9]+W$/),
    attachTo: z.uuid().optional(),
  }),
]);

export type ImportRequest = z.infer<typeof importRequestSchema>;

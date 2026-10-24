import { z } from "zod";

/** Query string of `GET /api/v1/providers/tmdb/search`. */
export const searchQuerySchema = z.object({
  q: z
    .string("Search for at least two characters.")
    .trim()
    .min(2, "Search for at least two characters."),
  type: z.enum(["all", "film", "tv"]).default("all"),
  // TMDB serves pages 1 to 500.
  page: z.coerce
    .number("Pages are whole numbers from 1 to 500.")
    .int("Pages are whole numbers from 1 to 500.")
    .min(1, "Pages are whole numbers from 1 to 500.")
    .max(500, "Pages are whole numbers from 1 to 500.")
    .default(1),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

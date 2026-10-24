import { z } from "zod";

/** Query string of `GET /api/v1/providers/tmdb/search`. */
export const searchQuerySchema = z.object({
  q: z.string().trim().min(2),
  type: z.enum(["all", "film", "tv"]).default("all"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

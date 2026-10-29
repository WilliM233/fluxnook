import { z } from "zod";

/** Query string of `GET /api/v1/providers/comicvine/search`: one page of 20. */
export const comicVineSearchSchema = z.object({
  q: z
    .string("Search for at least two characters.")
    .trim()
    .min(2, "Search for at least two characters."),
});

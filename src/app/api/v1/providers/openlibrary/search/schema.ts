import { z } from "zod";

/** Query string of `GET /api/v1/providers/openlibrary/search`. */
export const openLibrarySearchSchema = z.object({
  q: z
    .string("Search for at least two characters.")
    .trim()
    .min(2, "Search for at least two characters."),
  // Twenty rows a page; past a hundred pages a search wants better words.
  page: z.coerce
    .number("Pages are whole numbers from 1 to 100.")
    .int("Pages are whole numbers from 1 to 100.")
    .min(1, "Pages are whole numbers from 1 to 100.")
    .max(100, "Pages are whole numbers from 1 to 100.")
    .default(1),
});

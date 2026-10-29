import { z } from "zod";

/**
 * Request body of `POST /api/v1/editions/import`: an Open Library edition key
 * and the four formats a book edition takes here (the shared vocabulary,
 * narrowed at the API).
 */
export const editionImportSchema = z.strictObject({
  source: z.literal("openlibrary"),
  key: z.string().regex(/^books\/OL[0-9]+M$/),
  format: z.enum(["paperback", "hardcover", "ebook", "audiobook"]),
  attachTo: z.uuid().optional(),
});

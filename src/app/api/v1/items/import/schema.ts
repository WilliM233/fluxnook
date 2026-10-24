import { z } from "zod";

/** Request body of `POST /api/v1/items/import`. Only keys TMDB could return. */
export const importRequestSchema = z.strictObject({
  source: z.literal("tmdb"),
  key: z.string().regex(/^(movie|tv)\/[0-9]+$/),
  attachTo: z.uuid().optional(),
});

export type ImportRequest = z.infer<typeof importRequestSchema>;

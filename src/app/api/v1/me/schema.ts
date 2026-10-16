import { z } from "zod";

/** Response body of `GET /api/v1/me`. Parsing strips every other user field. */
export const meResponseSchema = z.object({
  id: z.uuid(),
  email: z.email(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;

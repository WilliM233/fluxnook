import { z } from "zod";

/**
 * Response body of `GET /api/v1/me`. Parsing strips every other user field.
 * The email is whatever the auth server stored; it decides what a valid
 * address is, so this only checks there is one.
 */
export const meResponseSchema = z.object({
  id: z.uuid(),
  email: z.string().min(1),
});

export type MeResponse = z.infer<typeof meResponseSchema>;

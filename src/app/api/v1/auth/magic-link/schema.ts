import { z } from "zod";

/** Request body of `POST /api/v1/auth/magic-link`. */
export const magicLinkRequestSchema = z.object({
  email: z.email(),
});

export type MagicLinkRequest = z.infer<typeof magicLinkRequestSchema>;

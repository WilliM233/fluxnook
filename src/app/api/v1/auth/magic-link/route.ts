import { apiError } from "@/lib/api/errors";
import { createClient } from "@/lib/supabase/server";
import { magicLinkRequestSchema } from "./schema";

/** Emails a sign-in link. New addresses get an account on first click. */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = magicLinkRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "invalid_request",
      "That doesn't look like an email address.",
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: new URL("/api/v1/auth/callback", request.url).toString(),
    },
  });

  if (error?.status === 429) {
    return apiError(
      429,
      "rate_limited",
      "Too many links asked for. Wait a minute and try again.",
    );
  }
  if (error) {
    return apiError(
      502,
      "auth_error",
      "Couldn't send a link just now. Try again in a moment.",
    );
  }

  return new Response(null, { status: 204 });
}

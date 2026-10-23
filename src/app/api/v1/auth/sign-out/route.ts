import { apiError } from "@/lib/api/errors";
import { createClient } from "@/lib/supabase/server";

/** Ends the session and clears its cookies. Signing out twice is fine. */
export async function POST() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  // supabase-js keeps the session when the auth server errors, so say so
  // rather than let someone walk away from a shared computer still signed in.
  if (error) {
    return apiError(502, "auth_error", "Couldn't sign you out. Try again.");
  }
  return new Response(null, { status: 204 });
}

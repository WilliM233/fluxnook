import { apiError, noStore } from "@/lib/api/errors";
import { createClient } from "@/lib/supabase/server";
import { meResponseSchema } from "./schema";

/** The signed-in user's id and email; 401 when there is no session. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No user covers no cookie, an expired session and an unreachable auth server alike.
  if (!user) {
    return apiError(401, "unauthorized", "Sign in to see this.");
  }

  return Response.json(
    meResponseSchema.parse({ id: user.id, email: user.email }),
    { headers: noStore },
  );
}

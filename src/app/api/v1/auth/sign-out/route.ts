import { createClient } from "@/lib/supabase/server";

/** Ends the session and clears its cookies. Signing out twice is fine. */
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return new Response(null, { status: 204 });
}

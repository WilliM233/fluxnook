import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { readEnv } from "@/lib/env";

/** Supabase client for server components and route handlers, reading the session cookie. */
export async function createClient() {
  const { supabaseUrl, supabasePublishableKey } = readEnv();
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // Server components can't set cookies; the proxy refreshes the session for them.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {}
      },
    },
  });
}

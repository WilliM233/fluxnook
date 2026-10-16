import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { readEnv } from "@/lib/env";

/**
 * Refreshes the auth session on every matched request and passes the new
 * cookies both onward to the page and back to the browser. No redirects here;
 * pages and routes decide what a missing user means.
 */
export async function updateSession(request: NextRequest) {
  const { supabaseUrl, supabasePublishableKey } = readEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const callbackQuerySchema = z.object({ code: z.string().min(1) });

// Fixed destinations only: no `next` parameter, so the link can't be turned into an open redirect.
function redirectTo(request: NextRequest, path: "/nook" | "/?error=link") {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

/** Where the magic link lands: trades the code for a session cookie. */
export async function GET(request: NextRequest) {
  const parsed = callbackQuerySchema.safeParse({
    code: request.nextUrl.searchParams.get("code") ?? undefined,
  });
  if (!parsed.success) {
    return redirectTo(request, "/?error=link");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(
    parsed.data.code,
  );
  if (error) {
    return redirectTo(request, "/?error=link");
  }

  return redirectTo(request, "/nook");
}

import { serverDb } from "@/db/client";
import { apiError, noStore } from "@/lib/api/errors";
import { fieldErrors } from "@/lib/api/fields";
import { catalogStatuses } from "@/lib/catalog/match";
import { openLibraryFromEnv, ProviderError } from "@/lib/providers/openlibrary";
import { createClient } from "@/lib/supabase/server";
import { openLibrarySearchSchema } from "./schema";

/**
 * Open Library works for a query, each with where it stands in the catalog.
 * A book matches on title and author, never year (A4). Open Library's own
 * words never reach the response: a failed call is a plain 503.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return apiError(401, "unauthorized", "Sign in to search.");
  }

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = openLibrarySearchSchema.safeParse(params);
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error);
    return apiError(
      400,
      "invalid_request",
      fields.q ?? "That isn't a search this route takes.",
      fields,
    );
  }
  const { q, page } = parsed.data;

  try {
    const found = await openLibraryFromEnv().search(q, page);
    const statuses = await catalogStatuses(serverDb(), {
      userId: user.id,
      rows: found.results,
    });
    return Response.json(
      {
        page: found.page,
        totalPages: found.totalPages,
        results: found.results.map((row, i) => ({
          ...row,
          catalog: statuses[i],
        })),
      },
      { headers: noStore },
    );
  } catch (error) {
    if (error instanceof ProviderError) {
      return apiError(
        503,
        "provider_unavailable",
        "Open Library didn't answer. Try again in a moment.",
      );
    }
    throw error;
  }
}

import { serverDb } from "@/db/client";
import { apiError, noStore } from "@/lib/api/errors";
import { catalogStatuses } from "@/lib/catalog/match";
import {
  ProviderError,
  ProviderNotConfigured,
  type TmdbItem,
  tmdbFromEnv,
} from "@/lib/providers/tmdb";
import { createClient } from "@/lib/supabase/server";
import { searchQuerySchema } from "./schema";

/**
 * TMDB films and shows for a query, each with where it stands in the catalog.
 * TMDB's own words never reach the response: an unset token or a failed call
 * is a plain 503.
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
  const parsed = searchQuerySchema.safeParse(params);
  if (!parsed.success) {
    return apiError(
      400,
      "invalid_request",
      "Search for at least two characters.",
    );
  }
  const { q, type, page } = parsed.data;

  try {
    const tmdb = tmdbFromEnv();
    const found = await tmdb.search(q, page);
    const wanted = found.results.filter(
      (row) =>
        type === "all" ||
        (type === "film" ? row.kind === "movie" : row.kind === "tv"),
    );
    // Multi search carries no season count; a show's row needs its details.
    // A failed one leaves that row as searched, never the page.
    const details = await Promise.allSettled(
      wanted.map((row) =>
        row.kind === "tv" ? tmdb.details(row.key) : Promise.resolve(row),
      ),
    );
    const rows: TmdbItem[] = wanted.map((row, i) => {
      const settled = details[i];
      return settled.status === "fulfilled" ? settled.value : row;
    });
    const statuses = await catalogStatuses(serverDb(), {
      userId: user.id,
      rows,
    });
    return Response.json(
      {
        page: found.page,
        totalPages: found.totalPages,
        results: rows.map((row, i) => ({ ...row, catalog: statuses[i] })),
      },
      { headers: noStore },
    );
  } catch (error) {
    if (error instanceof ProviderNotConfigured) {
      return apiError(
        503,
        "provider_unavailable",
        "Search isn't set up on this nook yet.",
      );
    }
    if (error instanceof ProviderError) {
      return apiError(
        503,
        "provider_unavailable",
        "TMDB didn't answer. Try again in a moment.",
      );
    }
    throw error;
  }
}

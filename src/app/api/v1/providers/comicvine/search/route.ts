import { serverDb } from "@/db/client";
import { apiError, noStore } from "@/lib/api/errors";
import { fieldErrors } from "@/lib/api/fields";
import {
  groupOptions,
  seriesGroups,
  seriesStatuses,
} from "@/lib/catalog/match";
import {
  comicVineFromEnv,
  ProviderBusy,
  ProviderError,
  ProviderNotConfigured,
} from "@/lib/providers/comicvine";
import { createClient } from "@/lib/supabase/server";
import { comicVineSearchSchema } from "./schema";

/**
 * Comic Vine volumes for a query, each with where it stands in the catalog
 * (A4): a series matches a hand-entered run on name, first year and the
 * label's publisher, never the volume number. One page of 20, so no paging.
 * Beside them, every run entered by hand that no volume holds yet, which the
 * import sheet's "Same as a run you added by hand?" select lists (A8).
 * Comic Vine's own words never reach the response, and nothing here logs:
 * the URL a call used holds the key.
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
  const parsed = comicVineSearchSchema.safeParse(params);
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error);
    return apiError(
      400,
      "invalid_request",
      fields.q ?? "That isn't a search this route takes.",
      fields,
    );
  }

  try {
    const rows = await comicVineFromEnv().search(parsed.data.q);
    const db = serverDb();
    const groups = rows.length ? await seriesGroups(db) : [];
    const statuses = await seriesStatuses(db, {
      userId: user.id,
      rows,
      groups,
    });
    return Response.json(
      {
        results: rows.map((row, i) => ({ ...row, catalog: statuses[i] })),
        groups: groupOptions(groups),
      },
      { headers: noStore },
    );
  } catch (error) {
    if (error instanceof ProviderNotConfigured) {
      return apiError(
        503,
        "provider_unavailable",
        "Comic search isn't set up on this nook yet.",
      );
    }
    if (error instanceof ProviderBusy) {
      return apiError(
        503,
        "provider_unavailable",
        "Comic Vine is busy. Try again in a few minutes.",
      );
    }
    if (error instanceof ProviderError) {
      return apiError(
        503,
        "provider_unavailable",
        "Comic Vine didn't answer. Try again in a moment.",
      );
    }
    throw error;
  }
}

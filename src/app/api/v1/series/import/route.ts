import { serverDb } from "@/db/client";
import {
  apiError,
  isJsonRequest,
  noStore,
  unsupportedMediaType,
} from "@/lib/api/errors";
import { fieldErrors } from "@/lib/api/fields";
import { ConflictError, NotFoundError } from "@/lib/catalog/import";
import { importSeriesFromComicVine } from "@/lib/catalog/series";
import { coverStoreOrNull } from "@/lib/covers";
import {
  comicVineFromEnv,
  ProviderBusy,
  ProviderError,
  ProviderNotConfigured,
} from "@/lib/providers/comicvine";
import { createClient } from "@/lib/supabase/server";
import { seriesImportSchema } from "./schema";

/**
 * A Comic Vine volume and its issues into the catalog (A5). 201 with what
 * was created and attached; 200 when the volume was in already. Nothing is
 * logged on the way out: a Comic Vine URL holds the key (A2).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return apiError(401, "unauthorized", "Sign in to add to the catalog.");
  }
  if (!isJsonRequest(request)) return unsupportedMediaType();

  const body: unknown = await request.json().catch(() => null);
  const parsed = seriesImportSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "invalid_request",
      "That isn't a Comic Vine volume in a form a series takes.",
      fieldErrors(parsed.error),
    );
  }

  try {
    const { id, created, attached, known } = await importSeriesFromComicVine(
      serverDb(),
      comicVineFromEnv(),
      coverStoreOrNull(),
      parsed.data,
    );
    return known
      ? Response.json({ id }, { status: 200, headers: noStore })
      : Response.json(
          { id, created, attached },
          { status: 201, headers: noStore },
        );
  } catch (error) {
    if (error instanceof NotFoundError) {
      return apiError(
        404,
        "not_found",
        "Nothing by that key, here or at Comic Vine.",
      );
    }
    if (error instanceof ConflictError) {
      return apiError(409, "conflict", error.message);
    }
    if (error instanceof ProviderNotConfigured) {
      return apiError(
        503,
        "provider_unavailable",
        "Comic search isn't set up on this nook yet.",
      );
    }
    // Before ProviderError, its parent.
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
        "Comic Vine isn't reachable from this nook right now.",
      );
    }
    throw error;
  }
}

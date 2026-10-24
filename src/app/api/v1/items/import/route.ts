import { serverDb } from "@/db/client";
import {
  apiError,
  isJsonRequest,
  noStore,
  unsupportedMediaType,
} from "@/lib/api/errors";
import {
  ConflictError,
  importFromTmdb,
  NotFoundError,
} from "@/lib/catalog/import";
import { type CoverStore, coverStoreFromEnv } from "@/lib/covers";
import {
  ProviderError,
  ProviderNotConfigured,
  tmdbFromEnv,
} from "@/lib/providers/tmdb";
import { createClient } from "@/lib/supabase/server";
import { importRequestSchema } from "./schema";

function coversOrNull(): CoverStore | null {
  try {
    return coverStoreFromEnv();
  } catch (error) {
    console.warn(`import: covers off (${(error as Error).message})`);
    return null;
  }
}

/**
 * A TMDB film or show into the catalog, or onto the item `attachTo` names.
 * 201 with the new item's id; 200 when the key was already in the catalog,
 * or for an attach, since that item already existed.
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
  const parsed = importRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "invalid_request", "That isn't a TMDB film or show.");
  }

  try {
    const { id, created } = await importFromTmdb(
      serverDb(),
      tmdbFromEnv(),
      coversOrNull(),
      parsed.data,
    );
    return Response.json(
      { id },
      { status: created ? 201 : 200, headers: noStore },
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      return apiError(
        404,
        "not_found",
        "Nothing by that key, here or at TMDB.",
      );
    }
    if (error instanceof ConflictError) {
      return apiError(409, "conflict", error.message);
    }
    if (
      error instanceof ProviderNotConfigured ||
      error instanceof ProviderError
    ) {
      return apiError(
        503,
        "provider_unavailable",
        "TMDB isn't reachable from this nook right now.",
      );
    }
    throw error;
  }
}

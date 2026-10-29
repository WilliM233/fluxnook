import { serverDb } from "@/db/client";
import {
  apiError,
  isJsonRequest,
  noStore,
  unsupportedMediaType,
} from "@/lib/api/errors";
import {
  ConflictError,
  importFromOpenLibrary,
  importFromTmdb,
  NotFoundError,
} from "@/lib/catalog/import";
import { coverStoreOrNull } from "@/lib/covers";
import { openLibraryFromEnv } from "@/lib/providers/openlibrary";
import {
  ProviderError,
  ProviderNotConfigured,
  tmdbFromEnv,
} from "@/lib/providers/tmdb";
import { createClient } from "@/lib/supabase/server";
import { importRequestSchema } from "./schema";

const providerName = { tmdb: "TMDB", openlibrary: "Open Library" } as const;

/**
 * A TMDB film or show, or an Open Library work, into the catalog, or onto
 * the item `attachTo` names. 201 with the new item's id; 200 when the key was
 * already in the catalog, or for an attach, since that item already existed.
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
    return apiError(
      400,
      "invalid_request",
      "That isn't a TMDB film or show, or an Open Library work.",
    );
  }
  const { source, key, attachTo } = parsed.data;
  const provider = providerName[source];

  try {
    const { id, created } =
      source === "tmdb"
        ? await importFromTmdb(serverDb(), tmdbFromEnv(), coverStoreOrNull(), {
            key,
            attachTo,
          })
        : await importFromOpenLibrary(
            serverDb(),
            openLibraryFromEnv(),
            coverStoreOrNull(),
            { key, attachTo },
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
        `Nothing by that key, here or at ${provider}.`,
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
        `${provider} isn't reachable from this nook right now.`,
      );
    }
    throw error;
  }
}

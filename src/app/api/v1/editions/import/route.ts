import { serverDb } from "@/db/client";
import {
  apiError,
  isJsonRequest,
  noStore,
  unsupportedMediaType,
} from "@/lib/api/errors";
import { fieldErrors } from "@/lib/api/fields";
import { importEditionFromOpenLibrary } from "@/lib/catalog/editions";
import { ConflictError, NotFoundError } from "@/lib/catalog/import";
import { coverStoreOrNull } from "@/lib/covers";
import { openLibraryFromEnv, ProviderError } from "@/lib/providers/openlibrary";
import { createClient } from "@/lib/supabase/server";
import { editionImportSchema } from "./schema";

/**
 * An Open Library edition, and its work, into the catalog (A7). 201 with the
 * edition and its item; 200 when the key or any of its ISBNs was already in.
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
  const parsed = editionImportSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "invalid_request",
      "That isn't an Open Library edition in a format a book takes.",
      fieldErrors(parsed.error),
    );
  }

  try {
    const { id, itemId, created } = await importEditionFromOpenLibrary(
      serverDb(),
      openLibraryFromEnv(),
      coverStoreOrNull(),
      parsed.data,
    );
    return Response.json(
      { id, itemId },
      { status: created ? 201 : 200, headers: noStore },
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      return apiError(
        404,
        "not_found",
        "Nothing by that key, here or at Open Library.",
      );
    }
    if (error instanceof ConflictError) {
      return apiError(409, "conflict", error.message);
    }
    if (error instanceof ProviderError) {
      return apiError(
        503,
        "provider_unavailable",
        "Open Library isn't reachable from this nook right now.",
      );
    }
    throw error;
  }
}

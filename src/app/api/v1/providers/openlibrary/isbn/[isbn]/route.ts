import { serverDb } from "@/db/client";
import { apiError, noStore } from "@/lib/api/errors";
import { editionFor, editionIsbns } from "@/lib/catalog/editions";
import { catalogStatuses } from "@/lib/catalog/match";
import { normalizeIsbn } from "@/lib/isbn";
import { openLibraryFromEnv, ProviderError } from "@/lib/providers/openlibrary";
import { createClient } from "@/lib/supabase/server";

/**
 * The one edition an ISBN names, its work with where it stands in the
 * catalog, and whether the printing itself is in (A5). Text that isn't an
 * ISBN never reaches Open Library.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ isbn: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return apiError(401, "unauthorized", "Sign in to search.");
  }

  // Next hands the segment over decoded; decoding it again would throw on a
  // bare `%` (Rummage R1).
  const isbn = normalizeIsbn((await params).isbn);
  if (!isbn) {
    return apiError(400, "invalid_request", "That isn't a valid ISBN.");
  }

  try {
    const ol = openLibraryFromEnv();
    const edition = await ol.editionByIsbn(isbn);
    if (!edition.workKey) {
      return apiError(
        404,
        "not_found",
        "Open Library has no book for that ISBN.",
      );
    }
    const work = await ol.work(edition.workKey);
    const db = serverDb();
    const [catalog] = await catalogStatuses(db, {
      userId: user.id,
      rows: [work],
    });
    const held = await editionFor(db, edition.key, [
      ...new Set([isbn, ...editionIsbns(edition)]),
    ]);
    return Response.json(
      {
        edition,
        work: { ...work, catalog },
        editionCatalog: held
          ? { status: "in", editionId: held.editionId, itemId: held.itemId }
          : { status: "new" },
      },
      { headers: noStore },
    );
  } catch (error) {
    if (error instanceof ProviderError && error.status === 404) {
      return apiError(
        404,
        "not_found",
        "Open Library has no book for that ISBN.",
      );
    }
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

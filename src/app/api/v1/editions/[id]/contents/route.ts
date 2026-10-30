import { z } from "zod";
import { serverDb } from "@/db/client";
import {
  apiError,
  isJsonRequest,
  noStore,
  unsupportedMediaType,
} from "@/lib/api/errors";
import { fieldErrors } from "@/lib/api/fields";
import { BadContents, replaceEditionContents } from "@/lib/catalog/contents";
import { ConflictError, NotFoundError } from "@/lib/catalog/import";
import { createClient } from "@/lib/supabase/server";
import { editionContentsSchema } from "./schema";

const notFound = () => apiError(404, "not_found", "No edition by that id.");

/**
 * What an edition collects, replaced by the list given, in that order (A6).
 * The one write the contents picker makes; 200 with how many it now holds.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return apiError(401, "unauthorized", "Sign in to edit the catalog.");
  }

  const editionId = z.uuid().safeParse((await params).id);
  if (!editionId.success) return notFound();
  if (!isJsonRequest(request)) return unsupportedMediaType();

  const body: unknown = await request.json().catch(() => null);
  const parsed = editionContentsSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "invalid_request",
      "That isn't a list of comics.",
      fieldErrors(parsed.error),
    );
  }

  try {
    const { count } = await replaceEditionContents(serverDb(), {
      editionId: editionId.data,
      itemIds: parsed.data.items,
    });
    return Response.json({ count }, { headers: noStore });
  } catch (error) {
    if (error instanceof NotFoundError) return notFound();
    if (error instanceof BadContents) {
      return apiError(400, "invalid_request", "That isn't a list of comics.", {
        items: error.message,
      });
    }
    if (error instanceof ConflictError) {
      return apiError(409, "conflict", error.message);
    }
    throw error;
  }
}

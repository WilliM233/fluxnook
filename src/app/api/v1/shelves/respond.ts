import { z } from "zod";
import {
  apiError,
  isJsonRequest,
  unsupportedMediaType,
} from "@/lib/api/errors";
import { fieldErrors } from "@/lib/api/fields";
import { ConflictError, NotFoundError } from "@/lib/catalog/import";
import { BadItems } from "@/lib/shelves/entries";
import { createClient } from "@/lib/supabase/server";

// What every shelf, section and entry route shares (A3 to A5): the caller,
// the ids in the path, the body, and the errors the lib throws. Each handler
// reads top to bottom as the edition contents route does.

/** The signed-in caller's id, or null for a 401. */
export async function callerId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export const signInFirst = () =>
  apiError(401, "unauthorized", "Sign in to see your shelves.");

/**
 * The path's ids, or null when one isn't a uuid: such an id names nothing,
 * so it is the route's 404 without a query.
 */
export async function pathIds<K extends string>(
  params: Promise<Record<K, string>>,
): Promise<Record<K, string> | null> {
  const ids = await params;
  for (const id of Object.values<string>(ids)) {
    if (!z.uuid().safeParse(id).success) return null;
  }
  return ids;
}

/** The JSON body through its schema, or the 415 or 400 to answer instead. */
export async function readBody<T>(
  request: Request,
  schema: z.ZodType<T>,
  invalid: string,
): Promise<{ data: T } | { response: Response }> {
  if (!isJsonRequest(request)) return { response: unsupportedMediaType() };
  const body: unknown = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      response: apiError(
        400,
        "invalid_request",
        invalid,
        fieldErrors(parsed.error),
      ),
    };
  }
  return { data: parsed.data };
}

export const notFound = (message: string) =>
  apiError(404, "not_found", message);

/**
 * The lib's refusals as answers: never 403, since another person's shelf is
 * no shelf (A3). Anything else is rethrown for Next to log as a 500.
 */
export function refusal(error: unknown): Response {
  if (error instanceof NotFoundError) {
    return notFound(error.message || "Nothing by that id.");
  }
  if (error instanceof ConflictError) {
    return apiError(409, "conflict", error.message);
  }
  if (error instanceof BadItems) {
    return apiError(400, "invalid_request", "That isn't a list of works.", {
      items: error.message,
    });
  }
  throw error;
}

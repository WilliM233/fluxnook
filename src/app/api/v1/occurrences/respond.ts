import { apiError } from "@/lib/api/errors";
import { ConflictError, NotFoundError } from "@/lib/catalog/import";
import { RuleError } from "@/lib/journal/errors";
import { notFound } from "../shelves/respond";

// The read and entry routes share the shelves' caller, path ids and body
// (A3, A4); the 401 and the refusals are the journal's own.
export { callerId, notFound, pathIds, readBody } from "../shelves/respond";

export const NOT_A_READ = "That isn't a read.";
export const NOT_AN_ENTRY = "That isn't an entry.";

export const signInFirst = () =>
  apiError(401, "unauthorized", "Sign in to see your journal.");

/**
 * The lib's refusals as answers: never 403, since another person's read is
 * no read (A3). A rule is a 400 at its field under the route's sentence.
 * Anything else is rethrown for Next to log as a 500.
 */
export function refusal(error: unknown, invalid: string): Response {
  if (error instanceof NotFoundError) return notFound(error.message);
  if (error instanceof ConflictError) {
    return apiError(409, "conflict", error.message);
  }
  if (error instanceof RuleError) {
    return apiError(400, "invalid_request", invalid, {
      [error.field]: error.message,
    });
  }
  throw error;
}

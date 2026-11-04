import { apiError } from "@/lib/api/errors";

// The copy routes share the shelves' caller, path ids and body and the
// journal's refusals (A3); the 401 and the sentence over a 400 are the
// collection's own.
export { refusal } from "../occurrences/respond";
export { callerId, pathIds, readBody } from "../shelves/respond";

export const NOT_A_COPY = "That isn't a copy.";

export const signInFirst = () =>
  apiError(401, "unauthorized", "Sign in to see your collection.");

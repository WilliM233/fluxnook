/**
 * Error body for every `/api/v1` route: a code for clients, a message for
 * people, and for a validation error the first problem with each field.
 */
export type ApiErrorBody = {
  error: { code: string; message: string; fields?: Record<string, string> };
};

/** Never cached: errors and per-person bodies alike. Route handlers get no Cache-Control from Next. */
export const noStore = { "cache-control": "no-store" } as const;

export function apiError(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
) {
  return Response.json(
    {
      error: { code, message, ...(fields && { fields }) },
    } satisfies ApiErrorBody,
    { status, headers: noStore },
  );
}

/**
 * Mutations take JSON only: a page on another site can post a form or
 * text/plain without a preflight, application/json it can't (Ch 0.2).
 */
export function isJsonRequest(request: Request) {
  const mediaType = request.headers.get("content-type")?.split(";")[0].trim();
  return mediaType?.toLowerCase() === "application/json";
}

export const unsupportedMediaType = () =>
  apiError(
    415,
    "unsupported_media_type",
    "Send the request as application/json.",
  );

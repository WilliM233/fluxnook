/** Error body for every `/api/v1` route: a code for clients, a message for people. */
export type ApiErrorBody = {
  error: { code: string; message: string };
};

/** Never cached: errors and per-person bodies alike. Route handlers get no Cache-Control from Next. */
export const noStore = { "cache-control": "no-store" } as const;

export function apiError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } } satisfies ApiErrorBody, {
    status,
    headers: noStore,
  });
}

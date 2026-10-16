/** Error body for every `/api/v1` route: a code for clients, a message for people. */
export type ApiErrorBody = {
  error: { code: string; message: string };
};

export function apiError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } } satisfies ApiErrorBody, {
    status,
  });
}

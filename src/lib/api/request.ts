/** A JSON request to one of our routes, as every page's `fetch` sends it. */
export const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

/**
 * A delete whose thing is already gone (another tab) did what it asked: the
 * confirm closes and the page's read shows it (1.6.2 Rummage R3).
 */
export async function goneIsDone(sent: Promise<Response>) {
  const response = await sent;
  return response.status === 404
    ? new Response(null, { status: 204 })
    : response;
}

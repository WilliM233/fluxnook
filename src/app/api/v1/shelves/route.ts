import { serverDb } from "@/db/client";
import { apiError, noStore } from "@/lib/api/errors";
import { fieldErrors } from "@/lib/api/fields";
import { listShelves } from "@/lib/shelves/list";
import { createShelf } from "@/lib/shelves/shelves";
import { callerId, readBody, signInFirst } from "./respond";
import { createShelfSchema, listShelvesQuerySchema } from "./schema";

/**
 * The caller's shelves for the Add to shelf sheet (A3, C9), each saying how
 * many of `?item=` or `?items=` it holds. Never 404: no shelves is `[]`.
 */
export async function GET(request: Request) {
  const userId = await callerId();
  if (!userId) return signInFirst();

  const query = listShelvesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!query.success) {
    return apiError(
      400,
      "invalid_request",
      "That isn't a question about shelves.",
      fieldErrors(query.error),
    );
  }

  const shelves = await listShelves(serverDb(), {
    userId,
    items: query.data.items,
  });
  return Response.json(shelves, { headers: noStore });
}

/** A new shelf of the caller's (A3): 201 with its id. */
export async function POST(request: Request) {
  const userId = await callerId();
  if (!userId) return signInFirst();

  const body = await readBody(
    request,
    createShelfSchema,
    "That isn't a shelf.",
  );
  if ("response" in body) return body.response;

  const { id } = await createShelf(serverDb(), { userId, ...body.data });
  return Response.json({ id }, { status: 201, headers: noStore });
}

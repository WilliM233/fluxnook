import { serverDb } from "@/db/client";
import { noStore } from "@/lib/api/errors";
import { deleteShelf, updateShelf } from "@/lib/shelves/shelves";
import { NO_SHELF } from "@/lib/shelves/write";
import {
  callerId,
  notFound,
  pathIds,
  readBody,
  refusal,
  signInFirst,
} from "../respond";
import { patchShelfSchema } from "../schema";

type Params = { params: Promise<{ id: string }> };

/** A shelf's name or description (A3): 200 with the shelf as it now stands. */
export async function PATCH(request: Request, { params }: Params) {
  const userId = await callerId();
  if (!userId) return signInFirst();
  const ids = await pathIds(params);
  if (!ids) return notFound(NO_SHELF);

  const body = await readBody(request, patchShelfSchema, "That isn't a shelf.");
  if ("response" in body) return body.response;

  try {
    const shelf = await updateShelf(serverDb(), {
      shelfId: ids.id,
      userId,
      ...body.data,
    });
    return Response.json(shelf, { headers: noStore });
  } catch (error) {
    return refusal(error);
  }
}

/** The shelf, its sections and its entries gone (A3); the catalog untouched. */
export async function DELETE(_request: Request, { params }: Params) {
  const userId = await callerId();
  if (!userId) return signInFirst();
  const ids = await pathIds(params);
  if (!ids) return notFound(NO_SHELF);

  try {
    await deleteShelf(serverDb(), { shelfId: ids.id, userId });
    return new Response(null, { status: 204, headers: noStore });
  } catch (error) {
    return refusal(error);
  }
}

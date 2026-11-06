import { serverDb } from "@/db/client";
import { noStore } from "@/lib/api/errors";
import { deleteRead, NO_READ, updateRead } from "@/lib/journal/reads";
import {
  callerId,
  NOT_A_READ,
  pathIds,
  readBody,
  refusal,
  signInFirst,
} from "../respond";
import { patchReadSchema } from "../schema";

type Params = { params: Promise<{ id: string }> };
const missing = { id: NO_READ };

/** A change to the caller's read (A3), answered with the read as it now stands. */
export async function PATCH(request: Request, { params }: Params) {
  const userId = await callerId();
  if (!userId) return signInFirst();
  const ids = await pathIds(params, missing);
  if (ids instanceof Response) return ids;

  const body = await readBody(request, patchReadSchema, NOT_A_READ);
  if ("response" in body) return body.response;

  try {
    const read = await updateRead(serverDb(), {
      userId,
      readId: ids.id,
      ...body.data,
    });
    return Response.json(read, { headers: noStore });
  } catch (error) {
    return refusal(error, NOT_A_READ);
  }
}

/** The caller's read gone, its entries with it (A3). */
export async function DELETE(_request: Request, { params }: Params) {
  const userId = await callerId();
  if (!userId) return signInFirst();
  const ids = await pathIds(params, missing);
  if (ids instanceof Response) return ids;

  try {
    await deleteRead(serverDb(), { userId, readId: ids.id });
    return new Response(null, { status: 204, headers: noStore });
  } catch (error) {
    return refusal(error, NOT_A_READ);
  }
}

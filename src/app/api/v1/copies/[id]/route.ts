import { serverDb } from "@/db/client";
import { noStore } from "@/lib/api/errors";
import { deleteCopy, NO_COPY, updateCopy } from "@/lib/collection/copies";
import {
  callerId,
  NOT_A_COPY,
  pathIds,
  readBody,
  refusal,
  signInFirst,
} from "../respond";
import { patchCopySchema } from "../schema";

type Params = { params: Promise<{ id: string }> };
const missing = { id: NO_COPY };

/** A change to the caller's copy (A3), answered with the copy as it now stands. */
export async function PATCH(request: Request, { params }: Params) {
  const userId = await callerId();
  if (!userId) return signInFirst();
  const ids = await pathIds(params, missing);
  if (ids instanceof Response) return ids;

  const body = await readBody(request, patchCopySchema, NOT_A_COPY);
  if ("response" in body) return body.response;

  try {
    const copy = await updateCopy(serverDb(), {
      userId,
      copyId: ids.id,
      ...body.data,
    });
    return Response.json(copy, { headers: noStore });
  } catch (error) {
    return refusal(error, NOT_A_COPY);
  }
}

/** The caller's copy gone; the printing stays in the catalog (A3). */
export async function DELETE(_request: Request, { params }: Params) {
  const userId = await callerId();
  if (!userId) return signInFirst();
  const ids = await pathIds(params, missing);
  if (ids instanceof Response) return ids;

  try {
    await deleteCopy(serverDb(), { userId, copyId: ids.id });
    return new Response(null, { status: 204, headers: noStore });
  } catch (error) {
    return refusal(error, NOT_A_COPY);
  }
}

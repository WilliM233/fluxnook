import { serverDb } from "@/db/client";
import { noStore } from "@/lib/api/errors";
import {
  moveEntry,
  NO_ENTRY,
  removeEntry,
  setEntryStatus,
} from "@/lib/shelves/entries";
import { NO_SHELF } from "@/lib/shelves/write";
import {
  callerId,
  pathIds,
  readBody,
  refusal,
  signInFirst,
} from "../../../respond";
import { patchEntrySchema } from "../schema";

type Params = { params: Promise<{ id: string; eid: string }> };
const missing = { id: NO_SHELF, eid: NO_ENTRY };

/**
 * One change to an entry (A5): a status, answered with the entry, or a move,
 * answered with every position on the shelf after the server renumbered it.
 */
export async function PATCH(request: Request, { params }: Params) {
  const userId = await callerId();
  if (!userId) return signInFirst();
  const ids = await pathIds(params, missing);
  if (ids instanceof Response) return ids;

  const body = await readBody(
    request,
    patchEntrySchema,
    "That isn't a change to an entry.",
  );
  if ("response" in body) return body.response;

  const key = { shelfId: ids.id, entryId: ids.eid, userId };
  try {
    const answer =
      "status" in body.data
        ? await setEntryStatus(serverDb(), { ...key, ...body.data })
        : await moveEntry(serverDb(), { ...key, ...body.data });
    return Response.json(answer, { headers: noStore });
  } catch (error) {
    return refusal(error);
  }
}

/** A work off the shelf (A5); the catalog keeps it. */
export async function DELETE(_request: Request, { params }: Params) {
  const userId = await callerId();
  if (!userId) return signInFirst();
  const ids = await pathIds(params, missing);
  if (ids instanceof Response) return ids;

  try {
    await removeEntry(serverDb(), {
      shelfId: ids.id,
      entryId: ids.eid,
      userId,
    });
    return new Response(null, { status: 204, headers: noStore });
  } catch (error) {
    return refusal(error);
  }
}

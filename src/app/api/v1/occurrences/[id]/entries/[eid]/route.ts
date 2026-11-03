import { serverDb } from "@/db/client";
import { noStore } from "@/lib/api/errors";
import { deleteEntry, NO_ENTRY, updateEntry } from "@/lib/journal/entries";
import { NO_READ } from "@/lib/journal/errors";
import {
  callerId,
  NOT_AN_ENTRY,
  pathIds,
  readBody,
  refusal,
  signInFirst,
} from "../../../respond";
import { patchEntrySchema } from "../schema";

type Params = { params: Promise<{ id: string; eid: string }> };
const missing = { id: NO_READ, eid: NO_ENTRY };

/** A change to an entry on the caller's read (A4), answered with the entry. */
export async function PATCH(request: Request, { params }: Params) {
  const userId = await callerId();
  if (!userId) return signInFirst();
  const ids = await pathIds(params, missing);
  if (ids instanceof Response) return ids;

  const body = await readBody(request, patchEntrySchema, NOT_AN_ENTRY);
  if ("response" in body) return body.response;

  try {
    const entry = await updateEntry(serverDb(), {
      userId,
      readId: ids.id,
      entryId: ids.eid,
      ...body.data,
    });
    return Response.json(entry, { headers: noStore });
  } catch (error) {
    return refusal(error, NOT_AN_ENTRY);
  }
}

/** An entry off the caller's read (A4); the read stays. */
export async function DELETE(_request: Request, { params }: Params) {
  const userId = await callerId();
  if (!userId) return signInFirst();
  const ids = await pathIds(params, missing);
  if (ids instanceof Response) return ids;

  try {
    await deleteEntry(serverDb(), {
      userId,
      readId: ids.id,
      entryId: ids.eid,
    });
    return new Response(null, { status: 204, headers: noStore });
  } catch (error) {
    return refusal(error, NOT_AN_ENTRY);
  }
}

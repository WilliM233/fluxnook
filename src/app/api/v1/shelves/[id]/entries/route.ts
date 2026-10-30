import { serverDb } from "@/db/client";
import { noStore } from "@/lib/api/errors";
import { addEntries } from "@/lib/shelves/entries";
import { NO_SHELF } from "@/lib/shelves/write";
import {
  callerId,
  pathIds,
  readBody,
  refusal,
  signInFirst,
} from "../../respond";
import { addEntriesSchema } from "./schema";

/** Works onto the caller's shelf in the order given (A5): 201 with how many went on and how many were there already. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await callerId();
  if (!userId) return signInFirst();
  const ids = await pathIds(params, { id: NO_SHELF });
  if (ids instanceof Response) return ids;

  const body = await readBody(
    request,
    addEntriesSchema,
    "That isn't a list of works.",
  );
  if ("response" in body) return body.response;

  try {
    const counts = await addEntries(serverDb(), {
      shelfId: ids.id,
      userId,
      ...body.data,
    });
    return Response.json(counts, { status: 201, headers: noStore });
  } catch (error) {
    return refusal(error);
  }
}

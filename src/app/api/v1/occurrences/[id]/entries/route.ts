import { serverDb } from "@/db/client";
import { noStore } from "@/lib/api/errors";
import { createEntry } from "@/lib/journal/entries";
import { NO_READ } from "@/lib/journal/errors";
import {
  callerId,
  NOT_AN_ENTRY,
  pathIds,
  readBody,
  refusal,
  signInFirst,
} from "../../respond";
import { createEntrySchema } from "./schema";

type Params = { params: Promise<{ id: string }> };

/** An entry on the caller's read (A4): 201 with its id. */
export async function POST(request: Request, { params }: Params) {
  const userId = await callerId();
  if (!userId) return signInFirst();
  const ids = await pathIds(params, { id: NO_READ });
  if (ids instanceof Response) return ids;

  const body = await readBody(request, createEntrySchema, NOT_AN_ENTRY);
  if ("response" in body) return body.response;

  try {
    const { id } = await createEntry(serverDb(), {
      userId,
      readId: ids.id,
      ...body.data,
    });
    return Response.json({ id }, { status: 201, headers: noStore });
  } catch (error) {
    return refusal(error, NOT_AN_ENTRY);
  }
}

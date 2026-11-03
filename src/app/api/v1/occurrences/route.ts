import { serverDb } from "@/db/client";
import { noStore } from "@/lib/api/errors";
import { createRead } from "@/lib/journal/reads";
import {
  callerId,
  NOT_A_READ,
  readBody,
  refusal,
  signInFirst,
} from "./respond";
import { createReadSchema } from "./schema";

/**
 * A read of a work, and its first entry if the body carries one, in one
 * write (A3): 201 with their ids. A second open read of the work is a 409.
 */
export async function POST(request: Request) {
  const userId = await callerId();
  if (!userId) return signInFirst();

  const body = await readBody(request, createReadSchema, NOT_A_READ);
  if ("response" in body) return body.response;

  try {
    const { id, entryId } = await createRead(serverDb(), {
      userId,
      ...body.data,
    });
    return Response.json(entryId ? { id, entryId } : { id }, {
      status: 201,
      headers: noStore,
    });
  } catch (error) {
    return refusal(error, NOT_A_READ);
  }
}

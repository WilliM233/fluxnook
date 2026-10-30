import { serverDb } from "@/db/client";
import { noStore } from "@/lib/api/errors";
import { createShelf } from "@/lib/shelves/shelves";
import { callerId, readBody, signInFirst } from "./respond";
import { createShelfSchema } from "./schema";

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

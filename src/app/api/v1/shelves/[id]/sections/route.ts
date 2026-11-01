import { serverDb } from "@/db/client";
import { noStore } from "@/lib/api/errors";
import { createSection } from "@/lib/shelves/sections";
import { NO_SHELF } from "@/lib/shelves/write";
import {
  callerId,
  pathIds,
  readBody,
  refusal,
  signInFirst,
} from "../../respond";
import { createSectionSchema } from "./schema";

/** A new section, last on the caller's shelf (A4): 201 with its id. */
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
    createSectionSchema,
    "That isn't a section.",
  );
  if ("response" in body) return body.response;

  try {
    const { id } = await createSection(serverDb(), {
      shelfId: ids.id,
      userId,
      name: body.data.name,
    });
    return Response.json({ id }, { status: 201, headers: noStore });
  } catch (error) {
    return refusal(error);
  }
}

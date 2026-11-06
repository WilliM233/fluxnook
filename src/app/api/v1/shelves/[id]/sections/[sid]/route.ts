import { serverDb } from "@/db/client";
import { noStore } from "@/lib/api/errors";
import {
  deleteSection,
  NO_SECTION,
  updateSection,
} from "@/lib/shelves/sections";
import { NO_SHELF } from "@/lib/shelves/write";
import {
  callerId,
  pathIds,
  readBody,
  refusal,
  signInFirst,
} from "../../../respond";
import { patchSectionSchema } from "../schema";

type Params = { params: Promise<{ id: string; sid: string }> };
const missing = { id: NO_SHELF, sid: NO_SECTION };

/** A section renamed or moved (A4): 200 with the section as it now stands. */
export async function PATCH(request: Request, { params }: Params) {
  const userId = await callerId();
  if (!userId) return signInFirst();
  const ids = await pathIds(params, missing);
  if (ids instanceof Response) return ids;

  const body = await readBody(
    request,
    patchSectionSchema,
    "That isn't a section.",
  );
  if ("response" in body) return body.response;

  try {
    const section = await updateSection(serverDb(), {
      shelfId: ids.id,
      sectionId: ids.sid,
      userId,
      ...body.data,
    });
    return Response.json(section, { headers: noStore });
  } catch (error) {
    return refusal(error);
  }
}

/** The section gone; its works move above the first section (A4). */
export async function DELETE(_request: Request, { params }: Params) {
  const userId = await callerId();
  if (!userId) return signInFirst();
  const ids = await pathIds(params, missing);
  if (ids instanceof Response) return ids;

  try {
    await deleteSection(serverDb(), {
      shelfId: ids.id,
      sectionId: ids.sid,
      userId,
    });
    return new Response(null, { status: 204, headers: noStore });
  } catch (error) {
    return refusal(error);
  }
}

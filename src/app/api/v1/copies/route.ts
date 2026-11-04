import { serverDb } from "@/db/client";
import { apiError, noStore } from "@/lib/api/errors";
import { fieldErrors } from "@/lib/api/fields";
import { createCopy } from "@/lib/collection/copies";
import { loadOwnership } from "@/lib/collection/owned";
import {
  callerId,
  NOT_A_COPY,
  readBody,
  refusal,
  signInFirst,
} from "./respond";
import { copiesQuerySchema, createCopySchema } from "./schema";

const NOT_A_WORK = "That isn't a work.";

/**
 * What the caller holds of a work (A4): its printings' copies, and the copies
 * whose printing's contents hold it. A stranger's are never there; an id no
 * work has answers two empty lists, since an id tells nothing.
 */
export async function GET(request: Request) {
  const userId = await callerId();
  if (!userId) return signInFirst();

  const params = new URL(request.url).searchParams;
  if (params.getAll("item").length > 1) {
    return apiError(400, "invalid_request", NOT_A_WORK, {
      item: "Ask it once.",
    });
  }
  const parsed = copiesQuerySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success) {
    return apiError(
      400,
      "invalid_request",
      NOT_A_WORK,
      fieldErrors(parsed.error),
    );
  }

  const { held, via } = await loadOwnership(serverDb(), {
    itemId: parsed.data.item,
    userId,
  });
  return Response.json({ held, via }, { headers: noStore });
}

/**
 * A copy of a printing, or of the work's one printing of a format, found or
 * made in one write (A3): 201 with both ids. Two printings of that format is a
 * 409 that says to pick one on the page.
 */
export async function POST(request: Request) {
  const userId = await callerId();
  if (!userId) return signInFirst();

  const body = await readBody(request, createCopySchema, NOT_A_COPY);
  if ("response" in body) return body.response;

  try {
    const copy = await createCopy(serverDb(), { userId, ...body.data });
    return Response.json(copy, { status: 201, headers: noStore });
  } catch (error) {
    return refusal(error, NOT_A_COPY);
  }
}

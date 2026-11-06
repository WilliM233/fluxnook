import { serverDb } from "@/db/client";
import {
  apiError,
  isJsonRequest,
  noStore,
  unsupportedMediaType,
} from "@/lib/api/errors";
import { createManualItem } from "@/lib/catalog/manual";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, manualItemSchema } from "./schema";

/** An item by hand, for what no provider knows. 400 names each field that's wrong. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return apiError(401, "unauthorized", "Sign in to add to the catalog.");
  }
  if (!isJsonRequest(request)) return unsupportedMediaType();

  const body: unknown = await request.json().catch(() => null);
  const parsed = manualItemSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "invalid_request",
      "Some fields need another look.",
      fieldErrors(parsed.error),
    );
  }

  const id = await createManualItem(serverDb(), {
    userId: user.id,
    input: parsed.data,
  });
  return Response.json({ id }, { status: 201, headers: noStore });
}

import { notFound } from "next/navigation";
import { z } from "zod";
import { serverDb } from "@/db/client";
import { readEnv } from "@/lib/env";
import { loadShelfPage } from "@/lib/shelves/shelf-page";
import { createClient } from "@/lib/supabase/server";
import { ShelfView } from "./shelf-view";

/**
 * A shelf (A7): the guard and the read here, the shelf in hand in the view.
 * Another person's shelf is not found, as a bad uuid is.
 */
export default async function ShelfPageView({
  params,
}: PageProps<"/shelves/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The (app) layout has already sent anyone signed out to /.
  if (!user) notFound();

  const page = await loadShelfPage(serverDb(), { id, userId: user.id });
  if (!page) notFound();
  const { supabaseUrl } = readEnv();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-11">
      <ShelfView page={page} supabaseUrl={supabaseUrl} />
    </main>
  );
}

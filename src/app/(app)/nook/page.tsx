import { notFound } from "next/navigation";
import { serverDb } from "@/db/client";
import { readEnv } from "@/lib/env";
import { nookLine } from "@/lib/shelves/lines";
import { loadNook } from "@/lib/shelves/nook-page";
import { createClient } from "@/lib/supabase/server";
import { NewShelf } from "./new-shelf";
import { ShelfCard } from "./shelf-card";

/** The nook (A6): the caller's shelves as cards, newest change first. */
export default async function NookPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The (app) layout has already sent anyone signed out to /.
  if (!user) notFound();

  const { shelves, totals } = await loadNook(serverDb(), user.id);
  const { supabaseUrl } = readEnv();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-11">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-heading text-[34px] leading-tight font-normal">
            Your nook
          </h1>
          <p className="text-muted-foreground">{nookLine(totals)}</p>
        </div>
        <NewShelf />
      </div>

      {shelves.length > 0 && (
        <>
          <ul
            aria-label="Your shelves"
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
          >
            {shelves.map((shelf) => (
              <ShelfCard
                key={shelf.id}
                shelf={shelf}
                supabaseUrl={supabaseUrl}
              />
            ))}
          </ul>
          <p className="text-[13px] text-dim">
            A shelf is yours alone until Volume 2, when you can share one by
            link.
          </p>
        </>
      )}
    </main>
  );
}

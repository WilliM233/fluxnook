import { cn } from "cn";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { serverDb } from "@/db/client";
import { workLine } from "@/lib/catalog/work-line";
import { backupsLine, shoppingLede, toFindLine } from "@/lib/collection/lines";
import { loadShopping } from "@/lib/collection/shopping-page";
import { readEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { CollectionRow } from "../collection-row";
import { ShoppingOwn } from "./shopping-own";

/**
 * Shopping (Ch 1.7 A11): what the caller's shelves ask for and their copies
 * don't answer, by shelf, in the nook's order. Nothing here is stored and it
 * has no paging: every row is on the page. "Wishlist" isn't a word it uses.
 */
export default async function ShoppingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The (app) layout has already sent anyone signed out to /.
  if (!user) notFound();

  const { total, shelves } = await loadShopping(serverDb(), user.id);
  const { supabaseUrl } = readEnv();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-11">
      <div className="flex flex-col items-start gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-heading text-[34px] leading-tight font-normal">
            Shopping
          </h1>
          <p className="text-muted-foreground">
            {shoppingLede({ total, shelves: shelves.length })}
          </p>
        </div>
        <Link
          href="/collection"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
        >
          Back to your collection
        </Link>
      </div>

      {shelves.map((shelf) => {
        const backups = backupsLine(shelf.backups);
        return (
          <section
            key={shelf.id}
            aria-labelledby={`shelf-${shelf.id}`}
            data-testid="shopping-shelf"
            className="flex flex-col gap-3 border-t pt-6"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2
                id={`shelf-${shelf.id}`}
                className="font-heading text-[22px] leading-tight font-semibold"
              >
                <Link
                  href={`/shelves/${shelf.id}`}
                  className="hover:text-accent-hover"
                >
                  {shelf.name}
                </Link>
              </h2>
              <span className="text-[13px] text-dim">
                {toFindLine(shelf.toFind, shelf.works)}
              </span>
            </div>

            {shelf.groups.map((group) => (
              <div key={group.section ?? ""} className="flex flex-col gap-3">
                {group.section && (
                  <h3 className="mt-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    {group.section}
                  </h3>
                )}
                <ul className="flex flex-col gap-3">
                  {group.rows.map(({ work, printings, alsoOn }) => (
                    <CollectionRow
                      key={work.id}
                      testId="shopping-row"
                      work={work}
                      supabaseUrl={supabaseUrl}
                      line={workLine(work)}
                      action={
                        <ShoppingOwn
                          item={{
                            id: work.id,
                            title: work.title,
                            type: work.type,
                            form: work.form,
                          }}
                          printings={printings}
                        />
                      }
                    >
                      {alsoOn.length > 0 && (
                        <p className="text-[13px] text-dim">
                          Also on {alsoOn.join(", ")}
                        </p>
                      )}
                    </CollectionRow>
                  ))}
                </ul>
              </div>
            ))}

            {shelf.note && <p className="text-[13px] text-dim">{shelf.note}</p>}
            {backups && <p className="text-[13px] text-dim">{backups}</p>}
          </section>
        );
      })}

      <p className="border-t pt-6 text-[13px] text-dim">
        Nothing here is stored: it's what your shelves ask for and your copies
        don't answer. I own this opens the Own a copy sheet; the row leaves the
        list when it's saved.
      </p>
    </main>
  );
}

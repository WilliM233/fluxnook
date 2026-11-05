import { cn } from "cn";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { serverDb } from "@/db/client";
import { loadCollectionPage } from "@/lib/collection/collection-page";
import {
  collectionLede,
  copyRowLine,
  copyThirdLine,
  shoppingLabel,
} from "@/lib/collection/lines";
import { parseType } from "@/lib/collection/shopping";
import { readEnv } from "@/lib/env";
import { nextCursor, parseCursor } from "@/lib/journal/cursor";
import { createClient } from "@/lib/supabase/server";
import { ChipRail, chipHref } from "./chip-rail";
import { CollectionRow } from "./collection-row";
import { CopyActions } from "./copy-actions";

/**
 * The Collection (Ch 1.7 A10): what the caller holds, newest first, 50 a page
 * by keyset, with a chip rail by type. The lede counts the collection and a
 * chip only filters the rows. A `before` or a `type` off the list is the
 * shell's not-found: a page has no 400. Edit and Remove are the client's.
 */
export default async function CollectionPage({
  searchParams,
}: PageProps<"/collection">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The (app) layout has already sent anyone signed out to /.
  if (!user) notFound();

  const { before, type: asked } = await searchParams;
  const cursor = before === undefined ? undefined : parseCursor(before);
  const type = parseType(asked);
  if (cursor === null || type === null) notFound();

  const { totals, toFind, rows, older } = await loadCollectionPage(serverDb(), {
    userId: user.id,
    before: cursor,
    type,
  });
  const { supabaseUrl } = readEnv();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-11">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="font-heading text-[34px] leading-tight font-normal">
            Your collection
          </h1>
          <p className="text-muted-foreground">{collectionLede(totals)}</p>
        </div>
        <Link
          href="/collection/shopping"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
        >
          {shoppingLabel(toFind)}
        </Link>
      </div>

      {totals.copies > 0 && <ChipRail picked={type} />}

      {rows.length === 0 &&
        totals.copies > 0 &&
        (cursor ? (
          // Past the end: a page kept after a Remove, or a kept address (1.6.3 R4).
          <p className="text-[13px] text-dim">
            Nothing older than this.{" "}
            <Link
              href={chipHref(type)}
              className="text-primary hover:text-accent-hover"
            >
              Back to the newest
            </Link>
            .
          </p>
        ) : (
          <p className="text-[13px] text-dim">Nothing here yet.</p>
        ))}

      {rows.length > 0 && (
        <ul aria-label="Your copies" className="flex flex-col gap-3">
          {rows.map(({ copy, printing, work }) => {
            const third = copyThirdLine(copy);
            return (
              <CollectionRow
                key={copy.id}
                testId="collection-row"
                work={work}
                supabaseUrl={supabaseUrl}
                line={copyRowLine({ ...printing, work })}
                action={
                  <CopyActions
                    item={{
                      id: work.id,
                      title: work.title,
                      type: work.type,
                      form: work.form,
                    }}
                    copy={{
                      id: copy.id,
                      format: printing.format,
                      condition: copy.condition,
                      acquiredOn: copy.acquiredOn,
                      note: copy.note,
                    }}
                  />
                }
              >
                {third && (
                  <p
                    data-testid="row-third"
                    className="line-clamp-2 text-[13px] whitespace-pre-line text-dim"
                  >
                    {third}
                  </p>
                )}
              </CollectionRow>
            );
          })}
        </ul>
      )}

      {older && (
        <p className="flex flex-wrap items-baseline gap-3 text-sm">
          <Link
            href={`${chipHref(type)}${type === "all" ? "?" : "&"}before=${nextCursor(older)}`}
            className="text-primary hover:text-accent-hover"
          >
            Older copies
          </Link>
          <span className="text-[13px] text-dim">50 a page, newest first.</span>
        </p>
      )}

      <p className="text-[13px] text-dim">
        A copy is a thing you hold: one printing, one format, its condition and
        where it came from. What you've read is the journal's business, not the
        shelf's. Your copies are yours alone until Volume 2.
      </p>
    </main>
  );
}

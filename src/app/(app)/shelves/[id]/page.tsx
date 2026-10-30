import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { serverDb } from "@/db/client";
import { readEnv } from "@/lib/env";
import { countsLine } from "@/lib/shelves/lines";
import { loadShelfPage } from "@/lib/shelves/shelf-page";
import { createClient } from "@/lib/supabase/server";
import { ShelfRow } from "./shelf-row";

/**
 * A shelf as it reads (A7, Ch 1.5.1): its header, the works above the first
 * section, then each section with its own counts. The page's writes, the
 * grip and the status control come in 1.5.2. Another person's shelf is not
 * found, as a bad uuid is.
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
  const { shelf, counts, unsectioned, sections } = page;
  const { supabaseUrl } = readEnv();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-11">
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted-foreground">
          <Badge
            variant="outline"
            className="border-line-strong tracking-widest text-muted-foreground uppercase"
          >
            Shelf
          </Badge>
          <span>{countsLine(counts)}</span>
        </div>
        <h1 className="font-heading text-5xl leading-none font-semibold tracking-tight">
          {shelf.name}
        </h1>
        {shelf.description && (
          <p className="max-w-prose text-base whitespace-pre-line text-muted-foreground">
            {shelf.description}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-7 border-t pt-7">
        {counts.works === 0 && (
          <p className="text-muted-foreground">Nothing on it yet.</p>
        )}

        {unsectioned.length > 0 && (
          <div className="flex flex-col gap-3">
            <ol
              aria-label="Above the first section"
              className="flex flex-col gap-3"
            >
              {unsectioned.map((row) => (
                <ShelfRow key={row.id} row={row} supabaseUrl={supabaseUrl} />
              ))}
            </ol>
            {sections.length > 0 && (
              <p className="text-[13px] text-dim">
                A work above the first section is on the shelf, not in a
                section. Drag it into one, or leave it.
              </p>
            )}
          </div>
        )}

        {sections.map((section) => (
          <section
            key={section.id}
            aria-labelledby={`section-${section.id}`}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h2
                id={`section-${section.id}`}
                className="font-heading text-[19px] font-semibold"
              >
                {section.name}
              </h2>
              <span className="text-[13px] text-dim">
                {countsLine(section)}
              </span>
            </div>
            {section.rows.length > 0 && (
              <ol className="flex flex-col gap-3">
                {section.rows.map((row) => (
                  <ShelfRow key={row.id} row={row} supabaseUrl={supabaseUrl} />
                ))}
              </ol>
            )}
          </section>
        ))}

        {counts.works > 0 && (
          <p className="text-[13px] text-dim">
            Numbers are the shelf's order, counted through the sections.
          </p>
        )}
      </div>
    </main>
  );
}

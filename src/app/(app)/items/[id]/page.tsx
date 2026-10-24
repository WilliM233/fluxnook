import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { serverDb } from "@/db/client";
import {
  type ItemPage,
  loadItemPage,
  releasedLabel,
} from "@/lib/catalog/item-page";
import { coverPublicUrl } from "@/lib/covers";
import { readEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const typeLabel = { film: "Film", tv: "TV", book: "Book", comic: "Comic" };
const sourceLabel: Record<string, string> = {
  tmdb: "TMDB",
  letterboxd: "Letterboxd",
};

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const year = (date: string | null) => date?.slice(0, 4) ?? null;

/** The short facts beside the type pill, per type (A8). */
function facts(item: ItemPage["item"]): string[] {
  switch (item.type) {
    case "film":
      return item.runtime_minutes ? [`${item.runtime_minutes} min`] : [];
    case "tv":
      return [
        [
          item.seasons !== null && plural(item.seasons, "season"),
          item.episodes !== null && plural(item.episodes, "episode"),
        ]
          .filter(Boolean)
          .join(", "),
        item.ended ? "Ended" : "Returning",
      ].filter(Boolean);
    case "book":
      return [item.form && capital(item.form), item.author].filter(
        (f): f is string => Boolean(f),
      );
    case "comic":
      return [
        item.series,
        item.series_kind && capital(item.series_kind),
        item.number !== null && `#${item.number}`,
      ].filter((f): f is string => Boolean(f));
  }
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-semibold tracking-wider text-dim uppercase">
        {term}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

export default async function ItemPageView({
  params,
}: PageProps<"/items/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The (app) layout has already sent anyone signed out to /.
  if (!user) notFound();

  const page = await loadItemPage(serverDb(), { id, userId: user.id });
  if (!page) notFound();
  const { item, sources, relations, franchises, shelves } = page;
  const released = releasedLabel(item.released_on, item.released_precision);
  const fromTmdb = sources.some((s) => s.source === "tmdb");

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-11 px-6 py-11 md:grid-cols-[280px_1fr]">
      <div className="flex flex-col gap-3" data-testid="cover">
        {item.cover_path ? (
          // biome-ignore lint/performance/noImgElement: plain img this chapter (next/image is a Deferral)
          <img
            src={coverPublicUrl(readEnv().supabaseUrl, item.cover_path)}
            alt={`Poster for ${item.title}`}
            width={500}
            height={750}
            className="aspect-[2/3] w-full rounded-xl object-cover shadow-2xl"
          />
        ) : (
          <div className="flex aspect-[2/3] w-full items-center justify-center rounded-xl border border-dashed border-line-strong text-sm text-dim">
            No poster
          </div>
        )}
        {item.cover_path && fromTmdb && (
          <span className="text-xs text-dim">Poster via TMDB</span>
        )}
      </div>

      <article className="flex min-w-0 flex-col gap-8">
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted-foreground">
            <Badge
              variant="outline"
              className="border-line-strong tracking-widest text-muted-foreground uppercase"
            >
              {typeLabel[item.type]}
            </Badge>
            {[year(item.released_on), ...facts(item)]
              .filter(Boolean)
              .map((fact, i) => (
                <span key={fact} className="flex items-center gap-2.5">
                  {i > 0 && <span aria-hidden="true">·</span>}
                  {fact}
                </span>
              ))}
          </div>
          <h1 className="font-heading text-5xl leading-none font-semibold tracking-tight">
            {item.title}
          </h1>
          {item.summary && (
            <p className="max-w-prose text-base text-muted-foreground">
              {item.summary}
            </p>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-x-7 gap-y-4 text-sm sm:grid-cols-2">
          {released && <Fact term="Released">{released}</Fact>}
          {item.type === "tv" && item.first_aired && (
            <Fact term="First aired">
              {releasedLabel(item.first_aired, "day")}
            </Fact>
          )}
          {item.type === "tv" && item.last_aired && (
            <Fact term="Last aired">
              {releasedLabel(item.last_aired, "day")}
            </Fact>
          )}
          {item.original_title && item.original_title !== item.title && (
            <Fact term="Original title">{item.original_title}</Fact>
          )}
          {franchises.length > 0 && (
            <Fact term="Franchise">{franchises.join(", ")}</Fact>
          )}
          <Fact term="Sources">
            <span className="flex flex-wrap gap-3">
              {sources.map((s) =>
                s.source === "manual" ? (
                  <span key={`${s.source}/${s.key}`}>Added by hand</span>
                ) : s.url ? (
                  <a
                    key={`${s.source}/${s.key}`}
                    href={s.url}
                    rel="noreferrer"
                    className="text-primary hover:text-accent-hover"
                  >
                    {sourceLabel[s.source] ?? s.source}
                  </a>
                ) : (
                  <span key={`${s.source}/${s.key}`}>
                    {sourceLabel[s.source] ?? s.source}
                  </span>
                ),
              )}
            </span>
          </Fact>
        </dl>

        <section
          aria-labelledby="connected"
          className="flex flex-col gap-3 border-t pt-6"
        >
          <h2 id="connected" className="font-heading text-[22px] font-semibold">
            Connected
          </h2>
          {relations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {relations.map((r) => (
                <li
                  key={`${r.label}/${r.id}`}
                  className="flex flex-wrap items-baseline gap-2.5 rounded-xl border bg-card px-4 py-3"
                >
                  <span className="min-w-28 text-xs text-dim">{r.label}</span>
                  <span className="sr-only"> · </span>
                  <Link
                    href={`/items/${r.id}`}
                    className="font-heading text-lg font-semibold text-foreground hover:text-accent-hover"
                  >
                    {r.title}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {[
                      year(r.released_on),
                      typeLabel[r.type as keyof typeof typeLabel],
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="shelves"
          className="flex flex-col gap-3 border-t pt-6"
        >
          <h2 id="shelves" className="font-heading text-[22px] font-semibold">
            On your shelves
          </h2>
          {shelves.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Not on a shelf. Shelves arrive in a later chapter; this is where
              they'll show.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {shelves.map((s) => (
                <li
                  key={`${s.name}/${s.position}`}
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line-strong px-3.5 text-sm"
                >
                  {s.name}
                  <span className="text-dim">#{s.position}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </article>
    </main>
  );
}

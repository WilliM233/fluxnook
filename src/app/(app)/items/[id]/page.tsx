import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { serverDb } from "@/db/client";
import { contentsLine } from "@/lib/catalog/contents-line";
import {
  type ItemPage,
  loadItemPage,
  loadPickerComics,
  type PickerComic,
  releasedLabel,
} from "@/lib/catalog/item-page";
import { coverPublicUrl } from "@/lib/covers";
import { readEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { CollectedIn, formatLabel } from "./collected-in";
import { comicPills, SeriesLine } from "./comic-parts";
import { ContentsEditor } from "./contents-editor";

const typeLabel = { film: "Film", tv: "TV", book: "Book", comic: "Comic" };
const sourceLabel: Record<string, string> = {
  tmdb: "TMDB",
  letterboxd: "Letterboxd",
  openlibrary: "Open Library",
  comicvine: "Comic Vine",
};

// Who a cached cover came from, read off its path (`tmdb/…`, `openlibrary/…`).
const coverCaption: Record<string, string> = {
  tmdb: "Poster via TMDB",
  openlibrary: "Cover from Open Library",
  comicvine: "Cover from Comic Vine",
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
      // A comic's facts carry the series link: `comicPills` (Ch 1.4.3).
      return [];
  }
}

/** An edition's quiet line: publisher · year · pages, or a comic's issue count. */
function editionLine(edition: ItemPage["editions"][number]): string {
  return [
    edition.publisher,
    year(edition.released_on),
    edition.pages !== null && plural(edition.pages, "page"),
    edition.contents > 0 && plural(edition.contents, "issue"),
  ]
    .filter(Boolean)
    .join(" · ");
}

function Editions({
  editions,
  picker,
}: {
  editions: ItemPage["editions"];
  /** A collected comic's printings say what they hold and take the picker (A10, A11). */
  picker: PickerComic[] | null;
}) {
  return (
    <section
      aria-labelledby="editions"
      className="flex flex-col gap-3 border-t pt-6"
    >
      <h2 id="editions" className="font-heading text-[22px] font-semibold">
        Editions
      </h2>
      {editions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          None in the catalog yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {editions.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-xl border bg-card px-4 py-3"
            >
              <span className="font-heading text-lg font-semibold text-foreground">
                {formatLabel(e.format)}
              </span>
              <span className="sr-only"> · </span>
              <span className="text-sm text-muted-foreground">
                {[e.title, editionLine(e)].filter(Boolean).join(" · ")}
              </span>
              {e.isbn && (
                <span className="text-sm text-dim tabular-nums">
                  ISBN {e.isbn}
                </span>
              )}
              {e.openlibrary_url && (
                <a
                  href={e.openlibrary_url}
                  rel="noreferrer"
                  className="ml-auto text-sm text-primary hover:text-accent-hover"
                >
                  Open Library
                </a>
              )}
              {e.comicvine_url && (
                <a
                  href={e.comicvine_url}
                  rel="noreferrer"
                  className="ml-auto text-sm text-primary hover:text-accent-hover"
                >
                  Comic Vine
                </a>
              )}
              {picker && (
                <span className="flex basis-full flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">
                    Contents: {contentsLine(e.contentsRows) || "Nothing yet"}
                  </span>
                  <ContentsEditor
                    editionId={e.id}
                    format={e.format}
                    current={e.contentsRows}
                    comics={picker}
                  />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-dim">
        A printing the catalog knows about. Which ones you own comes with the
        collection chapter.
      </p>
    </section>
  );
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

  const db = serverDb();
  const page = await loadItemPage(db, { id, userId: user.id });
  if (!page) notFound();
  // Only a collected comic's printing takes the picker, so only it lists the catalog.
  const picker =
    page.item.type === "comic" && page.item.form === "collected"
      ? await loadPickerComics(db, { except: id })
      : null;
  const {
    item,
    series,
    collectedIn,
    sources,
    relations,
    franchises,
    shelves,
    editions,
  } = page;
  const released = releasedLabel(item.released_on, item.released_precision);
  const pills = [
    ...[year(item.released_on), ...facts(item)]
      .filter((fact): fact is string => Boolean(fact))
      .map((fact) => ({ key: fact, node: fact as React.ReactNode })),
    ...(item.type === "comic" ? comicPills(item, series) : []),
  ];
  const caption = item.cover_path
    ? coverCaption[item.cover_path.split("/")[0]]
    : undefined;
  const printed = item.type === "book" || item.type === "comic";
  const coverWord = printed ? "Cover" : "Poster";

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-11 px-6 py-11 md:grid-cols-[280px_1fr]">
      <div className="flex flex-col gap-3" data-testid="cover">
        {item.cover_path ? (
          // biome-ignore lint/performance/noImgElement: plain img this chapter (next/image is a Deferral)
          <img
            src={coverPublicUrl(readEnv().supabaseUrl, item.cover_path)}
            alt={`${coverWord} for ${item.title}`}
            width={500}
            height={750}
            className="aspect-2/3 w-full rounded-xl object-cover shadow-2xl"
          />
        ) : (
          <div className="flex aspect-2/3 w-full items-center justify-center rounded-xl border border-dashed border-line-strong text-sm text-dim">
            No {coverWord.toLowerCase()}
          </div>
        )}
        {caption && <span className="text-xs text-dim">{caption}</span>}
      </div>

      <article className="flex min-w-0 flex-col gap-8">
        <div className="flex flex-col gap-2.5">
          <div
            data-testid="pills"
            className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted-foreground"
          >
            <Badge
              variant="outline"
              className="border-line-strong tracking-widest text-muted-foreground uppercase"
            >
              {typeLabel[item.type]}
            </Badge>
            {pills.flatMap((pill, i) => [
              i > 0 && (
                <span key={`dot-${pill.key}`} aria-hidden="true">
                  ·
                </span>
              ),
              <span key={pill.key}>{pill.node}</span>,
            ])}
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
          {series && (
            <Fact term="Series">
              <SeriesLine series={series} number={item.number} />
            </Fact>
          )}
          {item.type === "book" && item.author && (
            <Fact term="Author">{item.author}</Fact>
          )}
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

        {item.type === "comic" && (
          <CollectedIn
            rows={collectedIn}
            line={{
              own: item.series_id
                ? { seriesId: item.series_id }
                : { series: item.series },
              omit: item.id,
            }}
            empty="Not collected in anything the catalog knows."
            note="An edition whose contents hold this issue. Owning one comes with the collection chapter, and then this line says “owned via”."
          />
        )}

        {printed && <Editions editions={editions} picker={picker} />}

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

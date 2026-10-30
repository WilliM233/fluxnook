import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CollectedIn } from "@/app/(app)/items/[id]/collected-in";
import { Badge } from "@/components/ui/badge";
import { serverDb } from "@/db/client";
import { releasedLabel } from "@/lib/catalog/released";
import { loadSeriesPage, type SeriesPage } from "@/lib/catalog/series-page";
import { coverPublicUrl } from "@/lib/covers";
import { readEnv } from "@/lib/env";

const sourceLabel: Record<string, string> = { comicvine: "Comic Vine" };

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** "1984 to 1993", or the start alone while a run has no end. */
function years({ year_began, year_ended }: SeriesPage["series"]) {
  if (year_began === null) return null;
  return year_ended !== null && year_ended !== year_began
    ? `${year_began} to ${year_ended}`
    : String(year_began);
}

/** A tile's quiet line: "#1 · May 1984", or whichever half is known. */
function tileLine(issue: SeriesPage["issues"][number]) {
  return [
    issue.number !== null && `#${issue.number}`,
    releasedLabel(issue.released_on, issue.released_precision),
  ]
    .filter(Boolean)
    .join(" · ");
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

function Tile({ issue }: { issue: SeriesPage["issues"][number] }) {
  const line = tileLine(issue);
  return (
    <li className="flex min-w-0 flex-col gap-2">
      {issue.cover_path ? (
        // biome-ignore lint/performance/noImgElement: plain img, as the item page (next/image is a Deferral)
        <img
          src={coverPublicUrl(readEnv().supabaseUrl, issue.cover_path)}
          alt={`Cover for ${issue.title}`}
          width={300}
          height={450}
          loading="lazy"
          className="aspect-2/3 w-full rounded-lg object-cover"
        />
      ) : (
        <div className="flex aspect-2/3 w-full items-center justify-center rounded-lg border border-dashed border-line-strong text-xs text-dim">
          no cover
        </div>
      )}
      {line && (
        <span className="text-[13px] text-dim tabular-nums">{line}</span>
      )}
      <Link
        href={`/items/${issue.id}`}
        className="font-heading text-lg leading-snug font-semibold text-foreground hover:text-accent-hover"
      >
        {issue.title}
      </Link>
    </li>
  );
}

export default async function SeriesPageView({
  params,
}: PageProps<"/series/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  // The (app) layout has already sent anyone signed out to /; a series is
  // catalog, the same for everyone.
  const page = await loadSeriesPage(serverDb(), { id });
  if (!page) notFound();
  const { series, sources, issues, collectedIn } = page;
  const header = [
    years(series),
    series.publisher,
    series.kind && capital(series.kind),
    plural(issues.length, "issue"),
  ].filter((fact): fact is string => Boolean(fact));
  const lede = [
    series.volume !== null && `Vol. ${series.volume}.`,
    series.summary,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-11">
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-muted-foreground">
          <Badge
            variant="outline"
            className="border-line-strong tracking-widest text-muted-foreground uppercase"
          >
            Series
          </Badge>
          {header.flatMap((fact, i) => [
            i > 0 && (
              <span key={`dot-${fact}`} aria-hidden="true">
                ·
              </span>
            ),
            <span key={fact}>{fact}</span>,
          ])}
        </div>
        <h1 className="font-heading text-5xl leading-none font-semibold tracking-tight">
          {series.name}
        </h1>
        {lede && (
          <p className="max-w-prose text-base text-muted-foreground">{lede}</p>
        )}
      </div>

      <dl className="grid grid-cols-1 gap-x-7 gap-y-4 text-sm sm:grid-cols-2">
        {series.publisher && <Fact term="Publisher">{series.publisher}</Fact>}
        <Fact term="Sources">
          <span className="flex flex-wrap gap-3">
            {sources.map((s) =>
              s.url ? (
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
        aria-labelledby="issues"
        className="flex flex-col gap-4 border-t pt-6"
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 id="issues" className="font-heading text-[22px] font-semibold">
            Issues
          </h2>
          <span className="text-[13px] text-dim">
            {issues.length} in the catalog, in cover-date order
          </span>
        </div>
        {issues.length === 0 ? (
          <p className="text-sm text-muted-foreground">None in the catalog.</p>
        ) : (
          <ul
            aria-label="Issues"
            className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-6"
          >
            {issues.map((issue) => (
              <Tile key={issue.id} issue={issue} />
            ))}
          </ul>
        )}
      </section>

      <CollectedIn
        rows={collectedIn}
        line={{ own: { seriesId: series.id } }}
        empty="Nothing collected yet."
        note="An edition whose contents hold an issue of this run. Which ones you own comes with the collection chapter."
      />
    </main>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CatalogStatus, SeriesStatus } from "@/lib/catalog/match";
import type { RecentItem } from "@/lib/catalog/recent";
import { looksLikeIsbn, normalizeIsbn } from "@/lib/isbn";
import type { ComicVineSeries } from "@/lib/providers/comicvine";
import type {
  EditionFormat,
  OpenLibraryWork,
} from "@/lib/providers/openlibrary";
import type { TmdbItem } from "@/lib/providers/tmdb";
import { IsbnCard, type IsbnLookup } from "./isbn-card";
import { looksLike } from "./looks-like";
import { MatchSheet, type SheetResult } from "./match-sheet";
import { Row, sourceLabel, typeLabel } from "./rows";

type Kind = "all" | "film" | "tv" | "book" | "comic";
type FilmResult = TmdbItem & { catalog: CatalogStatus };
type BookResult = OpenLibraryWork & { catalog: CatalogStatus };
type SeriesResult = ComicVineSeries & { catalog: SeriesStatus };
type State<T> =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "results"; results: T[] }
  | { kind: "unavailable"; message: string }
  | { kind: "error" };
// ISBN mode (A9): one lookup in place of both searches.
type Lookup =
  | { kind: "idle" }
  | { kind: "invalid" }
  | { kind: "loading" }
  | { kind: "found"; found: IsbnLookup }
  | { kind: "notFound" }
  | { kind: "unavailable"; message: string }
  | { kind: "error" };
type Matching =
  | { source: "tmdb"; result: FilmResult }
  | { source: "openlibrary"; result: BookResult }
  | {
      source: "isbn";
      result: BookResult;
      editionKey: string;
      format: EditionFormat;
    };

const kinds: { value: Kind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "film", label: "Films" },
  { value: "tv", label: "TV" },
  { value: "book", label: "Books" },
  { value: "comic", label: "Comics" },
];
const parseKind = (value: string | null): Kind =>
  value === "film" || value === "tv" || value === "book" || value === "comic"
    ? value
    : "all";

function searchUrl(q: string, type: Kind) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (type !== "all") params.set("type", type);
  const query = params.toString();
  return query ? `/search?${query}` : "/search";
}

const openLink = (id: string) => (
  <Link
    href={`/items/${id}`}
    className="inline-flex min-h-11 items-center rounded-[10px] border border-line-strong px-4.5 text-sm font-medium text-foreground hover:bg-muted"
  >
    Open
  </Link>
);

/** One provider's call: its rows, or its own 503 sentence. */
async function ask<T>(url: string, signal: AbortSignal): Promise<State<T>> {
  try {
    const response = await fetch(url, { signal });
    const body = await response.json();
    if (response.status === 503) {
      return { kind: "unavailable", message: body.error.message };
    }
    if (!response.ok) return { kind: "error" };
    return { kind: "results", results: body.results };
  } catch {
    return { kind: "error" };
  }
}

/** The one edition an ISBN names, or why there isn't one. */
async function lookUp(isbn: string, signal: AbortSignal): Promise<Lookup> {
  try {
    const response = await fetch(`/api/v1/providers/openlibrary/isbn/${isbn}`, {
      signal,
    });
    const body = await response.json();
    if (response.status === 404) return { kind: "notFound" };
    if (response.status === 503) {
      return { kind: "unavailable", message: body.error.message };
    }
    if (!response.ok) return { kind: "error" };
    return { kind: "found", found: body };
  } catch {
    return { kind: "error" };
  }
}

export function Search({
  recent,
  imageBaseUrl,
  coversBaseUrl,
  supabaseUrl,
}: {
  recent: RecentItem[];
  imageBaseUrl: string;
  coversBaseUrl: string;
  supabaseUrl: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [type, setType] = useState<Kind>(parseKind(params.get("type")));
  const [films, setFilms] = useState<State<FilmResult>>({ kind: "idle" });
  const [books, setBooks] = useState<State<BookResult>>({ kind: "idle" });
  const [comics, setComics] = useState<State<SeriesResult>>({ kind: "idle" });
  const [lookup, setLookup] = useState<Lookup>({ kind: "idle" });
  const [matching, setMatching] = useState<Matching | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(
    null,
  );

  const poster = (path: string | null) =>
    path ? `${imageBaseUrl.replace(/\/$/, "")}/w185${path}` : null;
  const bookCover = (id: number | null) =>
    id ? `${coversBaseUrl.replace(/\/$/, "")}/b/id/${id}-M.jpg` : null;
  const cover = (path: string | null) =>
    path
      ? `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/covers/${path}`
      : null;

  // Text shaped like an ISBN is one, valid or not: the box looks it up
  // instead of searching, and a bad check digit never leaves the browser.
  const isbnMode = looksLikeIsbn(q.trim());
  const wantsFilms =
    !isbnMode && (type === "all" || type === "film" || type === "tv");
  const wantsBooks = !isbnMode && (type === "all" || type === "book");
  const wantsComics = !isbnMode && (type === "all" || type === "comic");

  // The URL carries the search, so it can be shared or refreshed; the fetch
  // waits for 300 ms of quiet and drops an answer a newer one replaced. With
  // All, the three providers are asked at once and each group shows when its
  // own answer lands, so a slow or failing one never blanks the others.
  useEffect(() => {
    const query = q.trim();
    if (looksLikeIsbn(query)) {
      router.replace(searchUrl(query, "all"), { scroll: false });
      setFilms({ kind: "idle" });
      setBooks({ kind: "idle" });
      setComics({ kind: "idle" });
      const isbn = normalizeIsbn(query);
      if (!isbn) {
        setLookup({ kind: "invalid" });
        return;
      }
      setLookup({ kind: "loading" });
      const controller = new AbortController();
      lookUp(isbn, controller.signal).then((found) => {
        if (!controller.signal.aborted) setLookup(found);
      });
      return () => controller.abort();
    }
    setLookup({ kind: "idle" });
    router.replace(searchUrl(query, type), { scroll: false });
    const asksFilms = type === "all" || type === "film" || type === "tv";
    const asksBooks = type === "all" || type === "book";
    const asksComics = type === "all" || type === "comic";
    if (query.length < 2 || !asksFilms) setFilms({ kind: "idle" });
    if (query.length < 2 || !asksBooks) setBooks({ kind: "idle" });
    if (query.length < 2 || !asksComics) setComics({ kind: "idle" });
    if (query.length < 2) return;
    const controller = new AbortController();
    const settle =
      <T,>(set: (state: State<T>) => void) =>
      (state: State<T>) => {
        if (!controller.signal.aborted) set(state);
      };
    const timer = setTimeout(() => {
      if (asksFilms) {
        setFilms({ kind: "loading" });
        ask<FilmResult>(
          `/api/v1/providers/tmdb/search?${new URLSearchParams({ q: query, type })}`,
          controller.signal,
        ).then(settle(setFilms));
      }
      if (asksBooks) {
        setBooks({ kind: "loading" });
        ask<BookResult>(
          `/api/v1/providers/openlibrary/search?${new URLSearchParams({ q: query })}`,
          controller.signal,
        ).then(settle(setBooks));
      }
      if (asksComics) {
        setComics({ kind: "loading" });
        ask<SeriesResult>(
          `/api/v1/providers/comicvine/search?${new URLSearchParams({ q: query })}`,
          controller.signal,
        ).then(settle(setComics));
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, type, router]);

  async function add(
    source: "tmdb" | "openlibrary",
    key: string,
    attachTo?: string,
  ) {
    setBusy(key);
    setFailed(null);
    const response = await fetch("/api/v1/items/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source, key, attachTo }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    if (response?.ok && body?.id) {
      router.push(`/items/${body.id}`);
      return;
    }
    setBusy(null);
    setFailed({
      key,
      message:
        response?.status === 409
          ? body.error.message
          : "Couldn't add it just now. Try again.",
    });
  }

  async function addEdition(
    editionKey: string,
    format: EditionFormat,
    attachTo?: string,
  ) {
    setBusy(editionKey);
    setFailed(null);
    const response = await fetch("/api/v1/editions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "openlibrary",
        key: editionKey,
        format,
        attachTo,
      }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    if (response?.ok && body?.itemId) {
      router.push(`/items/${body.itemId}`);
      return;
    }
    setBusy(null);
    setFailed({
      key: editionKey,
      message:
        response?.status === 409
          ? body.error.message
          : "Couldn't add it just now. Try again.",
    });
  }

  // The work looks like one you have: the sheet asks first, as a row's Add does.
  function onAddEdition(found: IsbnLookup, format: EditionFormat) {
    if (found.work.catalog.status === "match") {
      setMatching({
        source: "isbn",
        result: found.work,
        editionKey: found.edition.key,
        format,
      });
      return;
    }
    addEdition(found.edition.key, format);
  }

  function filmStatus(result: FilmResult) {
    const c = result.catalog;
    if (c.status === "in") {
      return <span className="text-primary">In your catalog</span>;
    }
    if (c.status === "match") {
      return (
        <span className="text-muted-foreground">
          Looks like one you have: {c.title} ({c.year}), from{" "}
          {sourceLabel[c.source] ?? c.source}
        </span>
      );
    }
    return result.kind === "tv" && result.seasons !== null ? (
      <span className="text-dim">
        {result.seasons} {result.seasons === 1 ? "season" : "seasons"}
      </span>
    ) : null;
  }

  function bookStatus(result: BookResult) {
    const c = result.catalog;
    if (c.status === "in") {
      return <span className="text-primary">In your catalog</span>;
    }
    if (c.status !== "match") return null;
    return <span className="text-muted-foreground">{looksLike(c)}</span>;
  }

  // A series row's status (A7): in, a looks-like line for a hand-entered run
  // or a run of collected editions, or nothing. Add arrives with the import
  // sheet (1.4.2), so a match or a new row has no action yet.
  function seriesStatus(result: SeriesResult) {
    const c = result.catalog;
    if (c.status === "in") {
      return <span className="text-primary">In your catalog</span>;
    }
    if (c.status !== "match") return null;
    return (
      <span className="text-muted-foreground">
        {c.group === "collected"
          ? `Looks like one you have: ${c.count} collected ${c.count === 1 ? "edition" : "editions"} added by hand`
          : `Looks like one you have: ${c.label}, ${c.count} ${c.count === 1 ? "issue" : "issues"} added by hand`}
      </span>
    );
  }

  function action(
    catalog: CatalogStatus,
    key: string,
    onMatch: () => void,
    onAdd: () => void,
  ) {
    if (catalog.status === "in") return openLink(catalog.itemId);
    return (
      <Button
        size="lg"
        className="min-h-11 px-4.5"
        disabled={busy !== null}
        aria-busy={busy === key}
        onClick={catalog.status === "match" ? onMatch : onAdd}
      >
        Add
      </Button>
    );
  }

  const alert = (key: string) =>
    failed?.key === key && (
      <span role="alert" className="block text-destructive">
        {failed.message}
      </span>
    );

  const grouped = type === "all";

  return (
    <>
      <div className="flex flex-col gap-3.5">
        <label
          htmlFor="q"
          className="font-heading text-[34px] leading-tight tracking-tight"
        >
          What are you looking for?
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            id="q"
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="A film, a show, a book, a comic series or an ISBN"
            className="min-h-13 min-w-0 flex-[1_1_420px] rounded-xl border border-line-strong bg-card px-4 text-[17px] outline-none placeholder:text-dim focus-visible:border-ring"
          />
          <fieldset className="flex gap-1.5 rounded-xl border bg-card p-1">
            <legend className="sr-only">Type</legend>
            {kinds.map((k) => (
              <button
                key={k.value}
                type="button"
                aria-pressed={type === k.value}
                disabled={isbnMode}
                onClick={() => setType(k.value)}
                className={`disabled:pointer-events-none disabled:opacity-50 ${
                  type === k.value
                    ? "rounded-[9px] bg-primary px-3.5 py-2.5 text-[13px] font-semibold text-primary-foreground"
                    : "rounded-[9px] px-3.5 py-2.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
                }`}
              >
                {k.label}
              </button>
            ))}
          </fieldset>
        </div>
        {lookup.kind === "invalid" && (
          <p role="alert" className="text-sm text-destructive">
            That isn't a valid ISBN.
          </p>
        )}
        <p className="text-[13px] text-dim">
          Results from TMDB, Open Library and Comic Vine. Not there?{" "}
          <Link
            href="/items/new"
            className="text-primary hover:text-accent-hover"
          >
            Add one by hand
          </Link>
          .
        </p>
      </div>

      {wantsFilms && films.kind !== "idle" && (
        <Group
          label={grouped ? "Films and TV" : null}
          provider="TMDB"
          state={films}
          listName="Results"
        >
          {films.kind === "results" &&
            films.results.map((result) => (
              <Row
                key={result.key}
                thumb={poster(result.posterPath)}
                title={result.title}
                year={result.year}
                type={result.kind}
                summary={result.summary}
                status={
                  <>
                    {filmStatus(result)}
                    {alert(result.key)}
                  </>
                }
                action={action(
                  result.catalog,
                  result.key,
                  () => setMatching({ source: "tmdb", result }),
                  () => add("tmdb", result.key),
                )}
              />
            ))}
        </Group>
      )}

      {wantsBooks && books.kind !== "idle" && (
        <Group
          label={grouped ? "Books" : null}
          provider="Open Library"
          state={books}
          listName="Books"
        >
          {books.kind === "results" &&
            books.results.map((result) => (
              <Row
                key={result.key}
                thumb={bookCover(result.coverId)}
                title={result.title}
                year={result.year}
                type="book"
                line={[
                  result.authors.join(", "),
                  result.editionCount &&
                    `${result.editionCount} ${result.editionCount === 1 ? "edition" : "editions"}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                status={
                  <>
                    {bookStatus(result)}
                    {alert(result.key)}
                  </>
                }
                action={action(
                  result.catalog,
                  result.key,
                  () => setMatching({ source: "openlibrary", result }),
                  () => add("openlibrary", result.key),
                )}
              />
            ))}
        </Group>
      )}
      {wantsBooks && books.kind === "results" && books.results.length > 0 && (
        <p className="text-[13px] text-dim">
          A year on a book row is Open Library's and can be off. The catalog's
          own year is in the looks-like line.
        </p>
      )}

      {wantsComics && comics.kind !== "idle" && (
        <Group
          label="Comic series"
          provider="Comic Vine"
          providerHref="https://comicvine.gamespot.com"
          state={comics}
          listName="Comic series"
        >
          {comics.kind === "results" &&
            comics.results.map((result) => (
              <Row
                key={result.key}
                thumb={result.coverUrl}
                title={result.name}
                year={result.year}
                type="series"
                line={[
                  result.publisher,
                  result.issueCount !== null &&
                    `${result.issueCount} ${result.issueCount === 1 ? "issue" : "issues"}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                status={seriesStatus(result)}
                action={
                  result.catalog.status === "in" ? (
                    <Link
                      href={`/series/${result.catalog.seriesId}`}
                      className="inline-flex min-h-11 items-center rounded-[10px] border border-line-strong px-4.5 text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Open
                    </Link>
                  ) : null
                }
              />
            ))}
        </Group>
      )}
      {wantsComics &&
        comics.kind === "results" &&
        comics.results.length > 0 && (
          <p className="text-[13px] text-dim">
            Add brings the series and every issue Comic Vine lists for it into
            the catalog. A run of sixty issues takes a few seconds.
          </p>
        )}

      {lookup.kind !== "idle" && lookup.kind !== "invalid" && (
        <section aria-labelledby="isbn" className="flex flex-col gap-2.5">
          <h2 id="isbn" className="text-xs text-dim">
            <span className="font-semibold tracking-widest text-muted-foreground uppercase">
              That's an ISBN
            </span>{" "}
            · one edition, from Open Library
          </h2>
          {lookup.kind === "loading" && (
            <p className="text-dim" aria-live="polite">
              Looking…
            </p>
          )}
          {lookup.kind === "notFound" && (
            <p className="text-muted-foreground">
              Open Library has no book with that ISBN. Check the digits, or add
              it{" "}
              <Link
                href="/items/new"
                className="text-primary hover:text-accent-hover"
              >
                by hand
              </Link>
              .
            </p>
          )}
          {lookup.kind === "unavailable" && (
            <p className="text-muted-foreground">{lookup.message}</p>
          )}
          {lookup.kind === "error" && (
            <p className="text-muted-foreground">
              Search didn't answer. Try again in a moment.
            </p>
          )}
          {lookup.kind === "found" && (
            <IsbnCard
              key={lookup.found.edition.key}
              found={lookup.found}
              typed={q}
              coversBaseUrl={coversBaseUrl}
              busy={busy !== null}
              error={
                failed?.key === lookup.found.edition.key ? failed.message : null
              }
              onAdd={(format) => onAddEdition(lookup.found, format)}
            />
          )}
        </section>
      )}

      {films.kind === "idle" &&
        books.kind === "idle" &&
        comics.kind === "idle" &&
        lookup.kind === "idle" && (
          <section aria-labelledby="recent" className="flex flex-col gap-3">
            <h2
              id="recent"
              className="text-sm font-semibold text-muted-foreground"
            >
              Recently added to the catalog
            </h2>
            <ol className="flex flex-col gap-2.5">
              {recent.map((item) => (
                <Row
                  key={item.id}
                  thumb={cover(item.cover_path)}
                  title={item.title}
                  year={item.year}
                  type={item.type}
                  action={openLink(item.id)}
                />
              ))}
            </ol>
          </section>
        )}

      {matching?.result.catalog.status === "match" && (
        <MatchSheet
          result={sheetSide(matching)}
          candidates={matching.result.catalog.candidates}
          busy={busy !== null}
          error={failed?.key === matchingKey(matching) ? failed.message : null}
          onSame={(itemId) => accept(matching, itemId)}
          onDifferent={() => accept(matching)}
          onClose={() => {
            setMatching(null);
            setFailed(null);
          }}
        />
      )}
    </>
  );

  // What the sheet's Same or Different does: an item import, or for an
  // ISBN, the edition import with the work's answer as `attachTo`.
  function accept(m: Matching, attachTo?: string) {
    if (m.source === "isbn") {
      return addEdition(m.editionKey, m.format, attachTo);
    }
    return add(m.source, m.result.key, attachTo);
  }

  function matchingKey(m: Matching) {
    return m.source === "isbn" ? m.editionKey : m.result.key;
  }

  function sheetSide(m: Matching): SheetResult {
    if (m.source === "tmdb") {
      return {
        provider: "TMDB",
        title: m.result.title,
        year: m.result.year,
        kind: typeLabel[m.result.kind],
        thumb: poster(m.result.posterPath),
      };
    }
    return {
      provider: "Open Library",
      title: m.result.title,
      year: m.result.year,
      kind: "Book",
      thumb: bookCover(m.result.coverId),
      author: m.result.authors.join(", ") || null,
      editionCount: m.result.editionCount,
    };
  }
}

/**
 * One provider's group: its quiet label (under All, and always for comics,
 * whose label carries the link Comic Vine's terms ask for), and its own
 * states.
 */
function Group({
  label,
  provider,
  providerHref,
  state,
  listName,
  children,
}: {
  label: string | null;
  provider: string;
  providerHref?: string;
  state: State<unknown>;
  listName: string;
  children: ReactNode;
}) {
  const id = `group-${provider.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section
      aria-labelledby={label ? id : undefined}
      aria-label={label ? undefined : provider}
      className="flex flex-col gap-2.5"
    >
      {label && (
        <h2 id={id} className="text-xs text-dim">
          <span className="font-semibold tracking-widest text-muted-foreground uppercase">
            {label}
          </span>{" "}
          · from{" "}
          {providerHref ? (
            <a
              href={providerHref}
              rel="noreferrer"
              className="underline hover:text-accent-hover"
            >
              {provider}
            </a>
          ) : (
            provider
          )}
        </h2>
      )}
      {state.kind === "unavailable" && (
        <p className="text-muted-foreground">{state.message}</p>
      )}
      {state.kind === "error" && (
        <p className="text-muted-foreground">
          Search didn't answer. Try again in a moment.
        </p>
      )}
      {state.kind === "loading" && (
        <p className="text-dim" aria-live="polite">
          Looking…
        </p>
      )}
      {state.kind === "results" &&
        (state.results.length === 0 ? (
          <p className="text-muted-foreground">
            Nothing by that name at {provider}.
          </p>
        ) : (
          <ol aria-label={listName} className="flex flex-col gap-2.5">
            {children}
          </ol>
        ))}
    </section>
  );
}

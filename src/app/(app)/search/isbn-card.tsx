"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { CatalogStatus } from "@/lib/catalog/match";
import { releasedLabel } from "@/lib/catalog/released";
import type {
  EditionFormat,
  OpenLibraryEdition,
  OpenLibraryWork,
} from "@/lib/providers/openlibrary";
import { looksLike } from "./looks-like";
import { Thumb } from "./rows";

/** What `GET /api/v1/providers/openlibrary/isbn/<isbn>` answers (A5). */
export type IsbnLookup = {
  edition: OpenLibraryEdition;
  work: OpenLibraryWork & { catalog: CatalogStatus };
  editionCatalog:
    | { status: "in"; editionId: string; itemId: string }
    | { status: "new" };
};

const formats: { value: EditionFormat; label: string }[] = [
  { value: "paperback", label: "Paperback" },
  { value: "hardcover", label: "Hardcover" },
  { value: "ebook", label: "Ebook" },
  { value: "audiobook", label: "Audiobook" },
];

// The manual form's select, less its full width, so the two look alike.
export const selectClass =
  "h-11 rounded-[10px] border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * The ISBN pair as the person knows it: a 13 typed with its hyphens keeps
 * them, and the 10 takes the same groups. Anything else is plain digits; a
 * right hyphenation of an untyped number needs the ISBN range table.
 */
export function isbnPair(typed: string, edition: OpenLibraryEdition) {
  const isbn13 = edition.isbn13[0] ?? null;
  const isbn10 = edition.isbn10[0] ?? null;
  const parts = typed.trim().split("-");
  const grouped =
    parts.length === 5 &&
    parts[0] === "978" &&
    isbn13 !== null &&
    parts.join("") === isbn13;
  if (!grouped) return [isbn13, isbn10].filter(Boolean) as string[];
  const ten =
    isbn10 && isbn10.slice(0, 9) === isbn13.slice(3, 12)
      ? [...parts.slice(1, 4), isbn10.slice(9)].join("-")
      : isbn10;
  return [typed.trim(), ten].filter(Boolean) as string[];
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-dim">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** One edition, as an ISBN names it (A9), with its work and an Add. */
export function IsbnCard({
  found,
  typed,
  coversBaseUrl,
  busy,
  error,
  onAdd,
}: {
  found: IsbnLookup;
  typed: string;
  coversBaseUrl: string;
  busy: boolean;
  error: string | null;
  onAdd: (format: EditionFormat) => void;
}) {
  const { edition, work, editionCatalog } = found;
  const [format, setFormat] = useState<EditionFormat>(
    edition.format ?? "paperback",
  );
  const coverId = edition.coverId ?? work.coverId;
  const cover = coverId
    ? `${coversBaseUrl.replace(/\/$/, "")}/b/id/${coverId}-L.jpg`
    : null;
  const [isbn13, isbn10] = isbnPair(typed, edition);
  const author = work.authors.join(", ");
  const published = releasedLabel(
    edition.publishedOn,
    edition.publishedPrecision,
  );

  return (
    <article
      aria-label="That edition"
      className="flex flex-col gap-6 rounded-2xl border bg-card p-6 sm:flex-row"
    >
      <div className="w-35 flex-none">
        {cover ? (
          // biome-ignore lint/performance/noImgElement: plain img this chapter (next/image is a Deferral)
          <img
            src={cover}
            alt={`Cover for ${edition.title}`}
            width={140}
            height={210}
            className="aspect-2/3 w-35 rounded-md bg-background object-cover"
          />
        ) : (
          <Thumb src={null} empty="no cover" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h2 className="font-heading text-[28px] leading-tight font-semibold">
              {edition.title}
            </h2>
            <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
              Book
            </span>
          </div>
          {author && <p className="text-muted-foreground">{author}</p>}
        </div>

        <dl className="grid grid-cols-1 gap-x-7 gap-y-3 text-[15px] sm:grid-cols-2">
          {edition.publisher && (
            <Fact term="Publisher">{edition.publisher}</Fact>
          )}
          {published && <Fact term="Published">{published}</Fact>}
          {edition.pages !== null && <Fact term="Pages">{edition.pages}</Fact>}
          {isbn13 && (
            <Fact term="ISBN">
              <span className="whitespace-nowrap tabular-nums tracking-wide">
                {isbn13}
              </span>
              {isbn10 && (
                <span className="whitespace-nowrap text-dim tabular-nums tracking-wide">
                  {" "}
                  · {isbn10}
                </span>
              )}
            </Fact>
          )}
        </dl>

        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <label htmlFor="format" className="text-dim">
            Format
          </label>
          <select
            id="format"
            value={format}
            onChange={(event) => setFormat(event.target.value as EditionFormat)}
            className={selectClass}
          >
            {formats.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          {edition.formatWord && (
            <span className="text-dim">
              Open Library says "{edition.formatWord}"
            </span>
          )}
        </div>

        <section
          aria-label="The work"
          className="flex flex-col gap-1.5 rounded-xl border bg-background p-3.5"
        >
          <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
            The work
          </span>
          <p className="flex flex-wrap items-baseline gap-2">
            <span className="font-heading text-[19px] font-semibold">
              {work.title}
            </span>
            <span className="text-sm text-muted-foreground">
              {[work.year, author].filter(Boolean).join(" · ")}
            </span>
          </p>
          {work.catalog.status === "in" && (
            <p className="text-sm text-primary">In your catalog</p>
          )}
          {work.catalog.status === "match" && (
            <p className="text-sm text-muted-foreground">
              {looksLike(work.catalog)}. Add asks which.
            </p>
          )}
        </section>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {editionCatalog.status === "in" ? (
          <p className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-primary">
              This edition is in your catalog
            </span>
            <Link
              href={`/items/${editionCatalog.itemId}`}
              className="inline-flex min-h-11 items-center rounded-[10px] border border-line-strong px-4.5 text-sm font-medium text-foreground hover:bg-muted"
            >
              Open
            </Link>
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              className="min-h-11 self-start px-4.5"
              disabled={busy}
              onClick={() => onAdd(format)}
            >
              Add this edition
            </Button>
            <p className="text-[13px] text-dim">
              Adds the work to your catalog if it isn't there, and this printing
              under it. Owning a copy is a later chapter.
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Candidate } from "@/lib/catalog/match";
import { sourceLabel, Thumb } from "./rows";

/** The provider's side of the sheet. */
export type SheetResult = {
  provider: "TMDB" | "Open Library";
  title: string;
  year: number | null;
  kind: string;
  thumb: string | null;
  author?: string | null;
  editionCount?: number | null;
};

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

const where = (c: Candidate) =>
  [
    c.source === "manual"
      ? "Added by hand"
      : `From ${sourceLabel[c.source] ?? c.source}`,
    c.shelf &&
      `on ${c.shelf}${c.shelfPosition !== null ? ` #${c.shelfPosition}` : ""}`,
  ]
    .filter(Boolean)
    .join(" · ");

/** What a Same keeps on a book: the design's sentence, from what it holds. */
function keeps(c: Candidate) {
  const parts = ["its title", "its year"];
  if (c.form) parts.push(`that it's a ${c.form}`);
  if (c.contains > 0) {
    const stories = c.contains === 1 ? "story" : "stories";
    parts.push(`the ${c.contains} ${stories} contained in it`);
  }
  return `Keeps: ${parts.slice(0, -1).join(", ")}${parts.length > 2 ? "," : ""} and ${parts.at(-1)}.`;
}

/**
 * "Is this one already in your catalog?" (A7, Ch 1.2; A8, Ch 1.3): the
 * provider's result beside the item or items it looks like. Same attaches
 * the provider to that item; Different makes a new one. The person decides;
 * the nook never guesses.
 */
export function MatchSheet({
  result,
  candidates,
  busy,
  error,
  onSame,
  onDifferent,
  onClose,
}: {
  result: SheetResult;
  candidates: Candidate[];
  busy: boolean;
  error: string | null;
  onSame: (itemId: string) => void;
  onDifferent: () => void;
  onClose: () => void;
}) {
  const book = result.provider === "Open Library";
  const one = candidates.length === 1;
  const disagree =
    book &&
    result.year !== null &&
    candidates.find((c) => c.year !== null && c.year !== result.year);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-5 border border-line-strong p-7 sm:max-w-2xl">
        {book ? (
          <DialogHeader>
            <DialogTitle className="font-heading text-[28px] leading-tight font-semibold">
              Looks like one you have
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Same book? Then Open Library's details join the one you have.
              Different? It becomes a new item.
            </DialogDescription>
          </DialogHeader>
        ) : (
          <DialogHeader>
            <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              Adding from TMDB
            </span>
            <DialogTitle className="font-heading text-[28px] leading-tight font-semibold">
              Is this one already in your catalog?
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {one
                ? `One ${result.kind.toLowerCase()} in your catalog has the same title and year but no TMDB link yet.`
                : `${candidates.length} items in your catalog have the same title and a year close to it.`}{" "}
              If it's the same, the TMDB details and poster go onto that one
              instead of making a second.
            </DialogDescription>
          </DialogHeader>
        )}

        <div className="grid gap-3.5 sm:grid-cols-2">
          <section
            aria-label={`From ${result.provider}`}
            className="flex flex-col gap-2.5 rounded-xl border bg-background p-3.5"
          >
            <span
              className={`text-[11px] font-semibold tracking-widest uppercase ${book ? "text-primary" : "text-dim"}`}
            >
              From {result.provider}
            </span>
            <div className="flex gap-3">
              <Thumb
                src={result.thumb}
                size="sheet"
                empty={book ? "no cover" : "no poster"}
              />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-heading text-[19px] font-semibold">
                  {result.title}
                </span>
                {book ? (
                  <>
                    {result.author && (
                      <span className="text-sm text-muted-foreground">
                        {result.author}
                      </span>
                    )}
                    <span className="text-[13px] text-dim">
                      {[
                        result.year !== null &&
                          `First published ${result.year}`,
                        result.editionCount &&
                          plural(result.editionCount, "edition"),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {[result.year, result.kind].filter(Boolean).join(" · ")}
                  </span>
                )}
              </div>
            </div>
            {book && (
              <p className="text-[13px] text-dim">
                Brings: the cover, a summary, the Open Library link.
              </p>
            )}
          </section>
          {candidates.map((c) => (
            <section
              key={c.itemId}
              aria-label="In your catalog"
              className="flex flex-col gap-2.5 rounded-xl border border-primary bg-background p-3.5"
            >
              <span className="text-[11px] font-semibold tracking-widest text-primary uppercase">
                In your catalog
              </span>
              <div className="flex gap-3">
                <Thumb
                  src={null}
                  size="sheet"
                  empty={book ? "no cover" : "no poster"}
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-heading text-[19px] font-semibold">
                    {c.title}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {(book
                      ? [c.year, c.form && capital(c.form), c.author]
                      : [c.year, result.kind]
                    )
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="text-[13px] text-dim">{where(c)}</span>
                </div>
              </div>
              {book && <p className="text-[13px] text-dim">{keeps(c)}</p>}
              {!one && (
                <Button
                  size="lg"
                  disabled={busy}
                  onClick={() => onSame(c.itemId)}
                >
                  Same, add the {result.provider} details to this one
                </Button>
              )}
            </section>
          ))}
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          {one && (
            <Button
              size="lg"
              disabled={busy}
              onClick={() => onSame(candidates[0].itemId)}
            >
              Same, add the {result.provider} details to it
            </Button>
          )}
          <Button
            size="lg"
            variant="outline"
            disabled={busy}
            onClick={onDifferent}
          >
            Different, add as new
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="ml-auto text-muted-foreground"
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>

        {disagree && (
          <p className="text-[13px] text-dim">
            The years disagree ({result.year} against {disagree.year}). For
            books that's Open Library's first-publish year being off, which is
            common; the match is on title and author.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

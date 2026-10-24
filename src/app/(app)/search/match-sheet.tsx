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
import type { TmdbItem } from "@/lib/providers/tmdb";
import { sourceLabel, Thumb, typeLabel } from "./rows";

/**
 * "Is this one already in your catalog?" (A7): the TMDB result beside the
 * item or items it looks like. Same attaches TMDB to that item; Different
 * makes a new one. The person decides; the nook never guesses.
 */
export function MatchSheet({
  result,
  candidates,
  poster,
  busy,
  error,
  onSame,
  onDifferent,
  onClose,
}: {
  result: TmdbItem;
  candidates: Candidate[];
  poster: string | null;
  busy: boolean;
  error: string | null;
  onSame: (itemId: string) => void;
  onDifferent: () => void;
  onClose: () => void;
}) {
  const kind = typeLabel[result.kind];
  const one = candidates.length === 1;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-5 border border-line-strong p-7 sm:max-w-2xl">
        <DialogHeader>
          <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Adding from TMDB
          </span>
          <DialogTitle className="font-heading text-[28px] leading-tight font-semibold">
            Is this one already in your catalog?
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {one
              ? `One ${kind.toLowerCase()} in your catalog has the same title and year but no TMDB link yet.`
              : `${candidates.length} items in your catalog have the same title and a year close to it.`}{" "}
            If it's the same, the TMDB details and poster go onto that one
            instead of making a second.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <section
            aria-label="From TMDB"
            className="flex flex-col gap-2.5 rounded-xl border bg-background p-3.5"
          >
            <span className="text-[11px] font-semibold tracking-widest text-dim uppercase">
              From TMDB
            </span>
            <div className="flex gap-3">
              <Thumb src={poster} size="sheet" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-heading text-[19px] font-semibold">
                  {result.title}
                </span>
                <span className="text-sm text-muted-foreground">
                  {[result.year, kind].filter(Boolean).join(" · ")}
                </span>
              </div>
            </div>
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
                <Thumb src={null} size="sheet" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-heading text-[19px] font-semibold">
                    {c.title}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {c.year} · {kind}
                  </span>
                  <span className="text-[13px] text-dim">
                    From {sourceLabel[c.source] ?? c.source}
                    {c.shelf && ` · on ${c.shelf}`}
                  </span>
                </div>
              </div>
              {!one && (
                <Button
                  size="lg"
                  disabled={busy}
                  onClick={() => onSame(c.itemId)}
                >
                  Same, add the TMDB details to this one
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
              Same, add the TMDB details to it
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
      </DialogContent>
    </Dialog>
  );
}

import { Stars } from "@/components/ui/stars";
import { anchorLabel } from "@/lib/journal/anchor";
import type { ItemRead } from "@/lib/journal/item-reads";
import { journalHeading, readDates, writtenLabel } from "@/lib/journal/lines";
import { summarize } from "@/lib/journal/order";
import { type ItemType, words } from "@/lib/journal/words";

const CLOSING =
  "A read is one time through. Stars are how it felt, in half steps; the journal is what you wrote along the way, pinned to a page when you say which. Done on a shelf is the shelf's; a read is logged here.";

/**
 * The Journal section (Ch 1.6 A5) as it reads: the heading line, one card
 * per read of the caller's, newest first, each with its entries. Logging,
 * the star control and the entries' Edit and Delete arrive in 1.6.2.
 */
export function JournalSection({
  type,
  reads,
}: {
  type: ItemType;
  reads: ItemRead[];
}) {
  const status = words(type).status;
  return (
    <section
      aria-labelledby="journal"
      className="flex flex-col gap-3 border-t pt-6"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="journal" className="font-heading text-[22px] font-semibold">
          Journal
        </h2>
        <p className="text-[13px] text-dim">
          {journalHeading(type, summarize(reads))}
        </p>
      </div>
      {reads.length > 0 && (
        <ul className="flex flex-col gap-3">
          {reads.map((read) => {
            const dates = readDates(read);
            return (
              <li
                key={read.id}
                data-testid="read"
                className="flex flex-col gap-3 rounded-2xl border bg-card p-5"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-heading text-[19px] font-semibold">
                    {status[read.status]}
                  </span>
                  {dates && (
                    <span className="text-sm text-muted-foreground">
                      {dates}
                    </span>
                  )}
                  <Stars stars={read.stars} className="ml-auto" />
                </div>
                {read.entries.map((entry) => (
                  <div
                    key={entry.id}
                    data-testid="entry"
                    className="flex flex-col gap-2 border-t pt-3"
                  >
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-[13px] text-dim">
                        {writtenLabel(entry.writtenAt)}
                      </span>
                      {entry.anchorKind && entry.anchorValue && (
                        <span className="rounded-full border border-line-strong px-2 py-0.5 text-xs text-muted-foreground">
                          {anchorLabel(entry.anchorKind, entry.anchorValue)}
                        </span>
                      )}
                    </div>
                    <p className="max-w-[62ch] text-sm whitespace-pre-line">
                      {entry.body}
                    </p>
                  </div>
                ))}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[13px] text-dim">{CLOSING}</p>
    </section>
  );
}

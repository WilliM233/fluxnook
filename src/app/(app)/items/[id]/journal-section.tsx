import { anchorLabel } from "@/lib/journal/anchor";
import type { ItemRead } from "@/lib/journal/item-reads";
import { journalHeading, readDates, writtenLabel } from "@/lib/journal/lines";
import { summarize } from "@/lib/journal/order";
import { words } from "@/lib/journal/words";
import { type Card, JournalCards, type JournalItem } from "./journal-cards";

const CLOSING =
  "A read is one time through. Stars are how it felt, in half steps; the journal is what you wrote along the way, pinned to a page when you say which. Done on a shelf is the shelf's; a read is logged here.";

/**
 * The Journal section (Ch 1.6 A5): the heading line, one card per read of
 * the caller's, newest first, each with its entries. Every date and line is
 * printed here, on the server, so no zone can differ between the render and
 * the cards' hydration; the cards own the clicks.
 */
export function JournalSection({
  item,
  reads,
}: {
  item: JournalItem;
  reads: ItemRead[];
}) {
  const status = words(item.type).status;
  const cards: Card[] = reads.map((read) => ({
    ...read,
    statusWord: status[read.status],
    dates: readDates(read),
    entries: read.entries.map((entry) => ({
      ...entry,
      written: writtenLabel(entry.writtenAt),
      pill:
        entry.anchorKind && entry.anchorValue
          ? anchorLabel(entry.anchorKind, entry.anchorValue)
          : null,
    })),
  }));

  return (
    <section
      aria-labelledby="journal"
      className="flex flex-col gap-3 border-t pt-6"
    >
      <JournalCards
        item={item}
        heading={journalHeading(item.type, summarize(reads))}
        cards={cards}
      />
      <p className="text-[13px] text-dim">{CLOSING}</p>
    </section>
  );
}

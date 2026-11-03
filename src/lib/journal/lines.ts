import { releasedLabel } from "@/lib/catalog/released";
import type { ReadSummary } from "./order";
import { starText } from "./stars";
import { type ItemType, words } from "./words";

const dayLabel = (date: string) => releasedLabel(date, "day") as string;

/**
 * A read's dates on its card (Ch 1.6 A5): "Started 28 October 2026",
 * "3 March 2019 to 9 March 2019", "Finished 9 March 2019", the one date when
 * both are the same day (1.6.1 Q1 b), L), null with neither.
 */
export function readDates({
  startedOn,
  finishedOn,
}: {
  startedOn: string | null;
  finishedOn: string | null;
}): string | null {
  if (startedOn && finishedOn) {
    return startedOn === finishedOn
      ? dayLabel(finishedOn)
      : `${dayLabel(startedOn)} to ${dayLabel(finishedOn)}`;
  }
  if (startedOn) return `Started ${dayLabel(startedOn)}`;
  if (finishedOn) return `Finished ${dayLabel(finishedOn)}`;
  return null;
}

/**
 * The dim line beside "Journal" (A5, census C3): the count, the last finished
 * read's stars when it has them, then an open read; the empty sentence at 0.
 */
export function journalHeading(type: ItemType, summary: ReadSummary): string {
  const w = words(type);
  if (summary.reads === 0) return w.empty;
  return [
    w.count(summary.reads),
    summary.lastFinishedStars !== null &&
      `last finished at ${starText(summary.lastFinishedStars)}`,
    summary.readingNow && w.now,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The day an entry was written, in the server's zone: "1 November 2026".
 * Local parts, never `toISOString`, which is tomorrow after 18:00 in Chicago.
 */
export function writtenLabel(iso: string): string {
  const at = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return dayLabel(
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
  );
}

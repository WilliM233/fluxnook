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

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The day an entry was written, in the server's zone: "1 November 2026".
 * Local parts, never `toISOString`, which is tomorrow after 18:00 in Chicago.
 */
export function writtenLabel(iso: string): string {
  const at = new Date(iso);
  return dayLabel(
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
  );
}

/** The time an entry was written, 24-hour, in the server's zone: "21:14" (A8). */
export function writtenTime(iso: string): string {
  const at = new Date(iso);
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** A date as the Journal page prints it: the year left off in this year's. */
function shortDay(date: string, now: Date): string {
  const label = dayLabel(date);
  return date.startsWith(`${now.getFullYear()}-`)
    ? label.slice(0, label.lastIndexOf(" "))
    : label;
}

/**
 * A read's state on a Journal row (A8): "Reading since 28 October",
 * "Done, 9 March 2019 · ★ 4.5", "Abandoned, 2 May 2020"; the status word
 * alone when the read has no date for it (a fixture read has none).
 */
export function readState(
  type: ItemType,
  read: {
    status: "in_progress" | "done" | "abandoned";
    startedOn: string | null;
    finishedOn: string | null;
    stars: number | null;
  },
  now: Date = new Date(),
): string {
  const word = words(type).status[read.status];
  const date =
    read.status === "in_progress"
      ? read.startedOn
      : read.status === "done"
        ? read.finishedOn
        : (read.finishedOn ?? read.startedOn);
  const state =
    date === null
      ? word
      : read.status === "in_progress"
        ? `${word} since ${shortDay(date, now)}`
        : `${word}, ${shortDay(date, now)}`;
  return read.stars === null ? state : `${state} · ${starText(read.stars)}`;
}

/**
 * The Journal page's lede (A8): "51 entries across 2 works, newest first.",
 * then the drawing's second sentence; the empty sentence with none.
 */
export function journalLede({
  entries,
  works,
}: {
  entries: number;
  works: number;
}): string {
  if (entries === 0) {
    return "Nothing written yet. Open a work, log a read or a watch, and write the first line.";
  }
  const counted = `${entries} ${entries === 1 ? "entry" : "entries"} across ${works} ${works === 1 ? "work" : "works"}`;
  return `${counted}, newest first. An entry is written from a work's page, on the read or watch it belongs to.`;
}

import type { occurrenceStatuses } from "@/db/vocabulary";

/**
 * What the order rule reads of a read. `createdAt` is the UTC text the
 * queries print (`2026-11-02T21:14:03.512345Z`), so its first ten characters
 * are `created_at::date` and the text sorts as the timestamp does.
 */
export type ReadLike = {
  id: string;
  status: (typeof occurrenceStatuses)[number];
  startedOn: string | null;
  finishedOn: string | null;
  stars: number | null;
  createdAt: string;
};

const day = (read: ReadLike) =>
  read.finishedOn ?? read.startedOn ?? read.createdAt.slice(0, 10);

const desc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

/**
 * Newest first (Ch 1.6 A5): by `coalesce(finished_on, started_on,
 * created_at::date)`, then `created_at`, then id, so a read with no dates
 * sorts by when it was logged and the order is total. A new array.
 */
export function sortReads<T extends ReadLike>(reads: readonly T[]): T[] {
  return [...reads].sort(
    (a, b) =>
      desc(day(a), day(b)) ||
      desc(a.createdAt, b.createdAt) ||
      desc(a.id, b.id),
  );
}

/** The newest done read; an abandoned one isn't finished. */
export function latestFinished<T extends ReadLike>(reads: readonly T[]) {
  return sortReads(reads).find((read) => read.status === "done") ?? null;
}

/** The newest read with stars, whatever its status: a work's stars (A9). */
export function latestStarred<T extends ReadLike>(reads: readonly T[]) {
  return sortReads(reads).find((read) => read.stars !== null) ?? null;
}

export type ReadSummary = {
  reads: number;
  lastFinishedStars: number | null;
  readingNow: boolean;
};

/** What the Journal heading says about a work's reads (A5). */
export function summarize(reads: readonly ReadLike[]): ReadSummary {
  return {
    reads: reads.length,
    lastFinishedStars: latestFinished(reads)?.stars ?? null,
    readingNow: reads.some((read) => read.status === "in_progress"),
  };
}

import { z } from "zod";

/** A keyset page's size (1.6 A8, 1.7 A10): 50 rows a page. */
export const PAGE = 50;

/** Where a page starts: the last row of the one before it, by its time and id. */
export type Cursor = { at: string; id: string };

// UTC with microseconds, as `timestampText` prints it (census, C1).
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const uuid = z.uuid();

/**
 * `?before=<timestamp>,<id>` read back (1.6 A8, census C1); null for anything
 * else, which the page answers as its not-found. A repeated `?before=` is an
 * array and null too.
 */
export function parseCursor(before: unknown): Cursor | null {
  if (typeof before !== "string") return null;
  const comma = before.indexOf(",");
  if (comma < 0) return null;
  const at = before.slice(0, comma);
  const id = before.slice(comma + 1).toLowerCase();
  if (!TIMESTAMP.test(at) || !uuid.safeParse(id).success) return null;
  if (!isInstant(at)) return null;
  return { at, id };
}

/**
 * Whether the shape names a moment Postgres will read: February 30th, a
 * thirteenth month or hour 25 roll over in a Date, so its text no longer
 * matches; year zero doesn't exist in Postgres (1.6.3 Rummage R1). The
 * microseconds past the milliseconds are digits the shape already checked.
 */
function isInstant(at: string): boolean {
  const millis = `${at.slice(0, 23)}Z`;
  const date = new Date(millis);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() >= 1 &&
    date.toISOString() === millis
  );
}

/** An Older link's `before`, from the page's last row. */
export function nextCursor({ at, id }: Cursor): string {
  return `${at},${id}`;
}

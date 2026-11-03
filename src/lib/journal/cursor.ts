import { z } from "zod";

/** The Journal page's size (A8): 50 entries a page. */
export const PAGE = 50;

/** Where a Journal page starts: the last row of the one before it. */
export type Cursor = { writtenAt: string; id: string };

// UTC with microseconds, as `timestampText` prints it (census, C1).
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const uuid = z.uuid();

/**
 * `?before=<written_at>,<id>` read back (A8, census C1); null for anything
 * else, which the page answers as its not-found. A repeated `?before=` is an
 * array and null too.
 */
export function parseCursor(before: unknown): Cursor | null {
  if (typeof before !== "string") return null;
  const comma = before.indexOf(",");
  if (comma < 0) return null;
  const writtenAt = before.slice(0, comma);
  const id = before.slice(comma + 1).toLowerCase();
  if (!TIMESTAMP.test(writtenAt) || !uuid.safeParse(id).success) return null;
  return { writtenAt, id };
}

/** The Older entries link's `before`, from the page's last row. */
export function nextCursor({ writtenAt, id }: Cursor): string {
  return `${writtenAt},${id}`;
}

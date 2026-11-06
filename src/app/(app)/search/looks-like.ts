import type { CatalogStatus } from "@/lib/catalog/match";
import { sourceLabel } from "./rows";

/**
 * The looks-like line for a book (A8): the catalog's own title, year and
 * author, since Open Library's year beside it can be off.
 */
export function looksLike(
  c: Extract<CatalogStatus, { status: "match" }>,
): string {
  const year = c.year !== null ? ` (${c.year})` : "";
  const by = c.author ? ` by ${c.author}` : "";
  const from =
    c.source === "manual"
      ? "added by hand"
      : `from ${sourceLabel[c.source] ?? c.source}`;
  return `Looks like one you have: ${c.title}${year}${by}, ${from}`;
}

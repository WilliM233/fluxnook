import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { TmdbItem, TmdbKind } from "@/lib/providers/tmdb";
import { normalizeTitle } from "./normalize";

/** A catalog item a TMDB row looks like, with where it came from. */
export type Candidate = {
  itemId: string;
  title: string;
  year: number;
  source: string;
  shelf: string | null;
};

/**
 * Where a TMDB row stands against the catalog (A4): `in` when its key is
 * already an item's source; `match` when an item of the same type with no TMDB
 * source has the same normalized title and a year within 1 (the first
 * candidate's fields, and every candidate); `new` otherwise.
 */
export type CatalogStatus =
  | { status: "in"; itemId: string }
  | ({ status: "match"; candidates: Candidate[] } & Candidate)
  | { status: "new" };

const itemType: Record<TmdbKind, "film" | "tv"> = { movie: "film", tv: "tv" };

/** Two queries per page, whatever its size: the keys, then the candidates. */
export async function catalogStatuses(
  db: Db,
  { userId, rows }: { userId: string; rows: TmdbItem[] },
): Promise<CatalogStatus[]> {
  if (rows.length === 0) return [];

  const keys = rows.map((row) => row.key);
  const known = await db.execute<{ key: string; item: string }>(sql`
    select key, item from item_sources
    where source = 'tmdb' and key in (${sql.join(
      keys.map((key) => sql`${key}`),
      sql`, `,
    )})`);
  const byKey = new Map(known.map((row) => [row.key, row.item]));

  const years = rows
    .filter((row) => !byKey.has(row.key) && row.year !== null)
    .map((row) => row.year as number);
  const candidates = years.length
    ? await db.execute<Candidate & { type: string }>(sql`
        select i.id as "itemId", i.type, i.title,
          extract(year from i.released_on)::int as year,
          (select min(s.source) from item_sources s where s.item = i.id) as source,
          (select sh.name from shelf_entries e join shelves sh on sh.id = e.shelf
            where e.item = i.id and sh.owner = ${userId}
            order by sh.created_at, sh.id limit 1) as shelf
        from items i
        where i.type in ('film', 'tv')
          and extract(year from i.released_on)
            between ${Math.min(...years) - 1} and ${Math.max(...years) + 1}
          and not exists (
            select 1 from item_sources s where s.item = i.id and s.source = 'tmdb')
        order by i.released_on, i.id`)
    : [];
  const folded = candidates.map((c) => ({
    ...c,
    folded: normalizeTitle(c.title),
  }));

  return rows.map((row): CatalogStatus => {
    const itemId = byKey.get(row.key);
    if (itemId) return { status: "in", itemId };
    if (row.year === null) return { status: "new" };
    const title = normalizeTitle(row.title);
    // A title of only punctuation folds to nothing, and nothing is not a
    // title two works can share (R7).
    if (title === "") return { status: "new" };
    const found = folded
      .filter(
        (c) =>
          c.type === itemType[row.kind] &&
          c.folded === title &&
          Math.abs(c.year - (row.year as number)) <= 1,
      )
      .map(({ itemId, title, year, source, shelf }) => ({
        itemId,
        title,
        year,
        source,
        shelf,
      }));
    if (found.length === 0) return { status: "new" };
    return { status: "match", ...found[0], candidates: found };
  });
}

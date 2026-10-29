import { type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { OpenLibraryWork } from "@/lib/providers/openlibrary";
import type { TmdbItem } from "@/lib/providers/tmdb";
import { normalizeName, normalizeTitle } from "./normalize";

/** A catalog item a provider row looks like, with where it came from. */
export type Candidate = {
  itemId: string;
  title: string;
  year: number | null;
  author: string | null;
  form: string | null;
  source: string;
  shelf: string | null;
  shelfPosition: number | null;
  contains: number;
};

/**
 * Where a provider row stands against the catalog (A4): `in` when its key is
 * already an item's source; `match` when an item with no source from that
 * provider looks like the same work (`sameWork`; the first candidate's
 * fields, and every candidate); `new` otherwise.
 */
export type CatalogStatus =
  | { status: "in"; itemId: string }
  | ({ status: "match"; candidates: Candidate[] } & Candidate)
  | { status: "new" };

type MatchType = "film" | "tv" | "book";

/** A provider row in the terms the rule reads. */
export type MatchRow = {
  source: "tmdb" | "openlibrary";
  key: string;
  type: MatchType;
  title: string;
  year: number | null;
  authors: string[];
};

/** What the rule reads of a catalog item. */
export type MatchHeld = {
  type: string;
  title: string;
  year: number | null;
  author: string | null;
};

/** A TMDB row or an Open Library work as the rule reads it. */
export function matchRow(row: TmdbItem | OpenLibraryWork): MatchRow {
  if ("kind" in row) {
    const type = row.kind === "movie" ? "film" : "tv";
    return { ...row, source: "tmdb", type, authors: [] };
  }
  return { ...row, source: "openlibrary", type: "book" };
}

/**
 * The one "looks like the same work" rule, which the search, the sheet and
 * the attach all hold (Roadmap 2026-10-24 S1). Always the same type and the
 * same folded title, and a title that folds to nothing matches nothing (R7).
 * Films and shows: a year within 1 when both have one. Books: an author the
 * item holds among the row's names, or all of them joined; never the year,
 * since Open Library's first-publish year is too often wrong (2026-10-28).
 */
export function sameWork(row: MatchRow, held: MatchHeld): boolean {
  if (held.type !== row.type) return false;
  const title = normalizeTitle(row.title);
  if (title === "" || title !== normalizeTitle(held.title)) return false;
  if (row.type === "book") {
    const author = held.author ? normalizeName(held.author) : "";
    if (author === "" || row.authors.length === 0) return false;
    const names = [...row.authors, row.authors.join(", ")].map(normalizeName);
    return names.includes(author);
  }
  return (
    held.year === null ||
    row.year === null ||
    Math.abs(held.year - row.year) <= 1
  );
}

/** Two queries per page, whatever its size: the keys, then the candidates. */
export async function catalogStatuses(
  db: Db,
  {
    userId,
    rows: given,
  }: { userId: string; rows: (TmdbItem | OpenLibraryWork)[] },
): Promise<CatalogStatus[]> {
  if (given.length === 0) return [];
  const rows = given.map(matchRow);

  const known = await db.execute<{ source: string; key: string; item: string }>(
    sql`
    select source, key, item from item_sources
    where (source, key) in (${sql.join(
      rows.map((row) => sql`(${row.source}, ${row.key})`),
      sql`, `,
    )})`,
  );
  const byKey = new Map(known.map((r) => [`${r.source} ${r.key}`, r.item]));
  const unknown = rows.filter((row) => !byKey.has(`${row.source} ${row.key}`));

  // Films and shows inside the rows' year window; every book with no Open
  // Library source, since a book's year is never the test.
  const arms: SQL[] = [];
  const years = unknown
    .filter((row) => row.type !== "book" && row.year !== null)
    .map((row) => row.year as number);
  if (years.length) {
    arms.push(sql`(i.type in ('film', 'tv')
      and extract(year from i.released_on)
        between ${Math.min(...years) - 1} and ${Math.max(...years) + 1}
      and not exists (
        select 1 from item_sources s where s.item = i.id and s.source = 'tmdb'))`);
  }
  if (unknown.some((row) => row.type === "book")) {
    arms.push(sql`(i.type = 'book' and not exists (
      select 1 from item_sources s where s.item = i.id and s.source = 'openlibrary'))`);
  }
  const candidates = arms.length
    ? await db.execute<Candidate & { type: string }>(sql`
        select i.id as "itemId", i.type, i.title,
          extract(year from i.released_on)::int as year,
          b.author, i.form,
          (select min(s.source) from item_sources s where s.item = i.id) as source,
          first.name as shelf, first.position as "shelfPosition",
          (select count(*)::int from item_relations r
            where r.to_item = i.id and r.kind = 'contained-in') as contains
        from items i
        left join item_books b on b.item = i.id
        left join lateral (
          select sh.name, e.position from shelf_entries e
          join shelves sh on sh.id = e.shelf
          where e.item = i.id and sh.owner = ${userId}
          order by sh.created_at, sh.id limit 1
        ) first on true
        where ${sql.join(arms, sql` or `)}
        order by i.released_on nulls last, i.id`)
    : [];

  return rows.map((row): CatalogStatus => {
    const itemId = byKey.get(`${row.source} ${row.key}`);
    if (itemId) return { status: "in", itemId };
    // A film or show with no year has no window to look in.
    if (row.type !== "book" && row.year === null) return { status: "new" };
    const found = candidates
      .filter((c) => sameWork(row, c))
      .map(({ type: _type, ...candidate }) => candidate);
    if (found.length === 0) return { status: "new" };
    return { status: "match", ...found[0], candidates: found };
  });
}

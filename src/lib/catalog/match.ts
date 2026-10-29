import { type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { ComicVineSeries } from "@/lib/providers/comicvine";
import type { OpenLibraryWork } from "@/lib/providers/openlibrary";
import type { TmdbItem } from "@/lib/providers/tmdb";
import {
  collectedStem,
  normalizeName,
  normalizePublisher,
  normalizeSeries,
  normalizeTitle,
  seriesPublisher,
} from "./normalize";

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
 * Films and shows: a year within 1 when both have one. Books: the author the
 * item holds is one of the row's names, or the item holds the row's names in
 * any order, joined with ", "; never the year, since Open Library's
 * first-publish year is too often wrong (2026-10-28).
 */
export function sameWork(row: MatchRow, held: MatchHeld): boolean {
  if (held.type !== row.type) return false;
  const title = normalizeTitle(row.title);
  if (title === "" || title !== normalizeTitle(held.title)) return false;
  if (row.type === "book") {
    const author = held.author ? normalizeName(held.author) : "";
    const names = row.authors.map(normalizeName).filter(Boolean);
    if (author === "" || names.length === 0) return false;
    if (names.includes(author)) return true;
    // A multi-author work, held as an import joined them (Rummage R3).
    const heldNames = held.author?.split(",").map(normalizeName) ?? [];
    return names.length > 1 && sameNames(heldNames, names);
  }
  return (
    held.year === null ||
    row.year === null ||
    Math.abs(held.year - row.year) <= 1
  );
}

const sameNames = (a: string[], b: string[]) =>
  a.length === b.length &&
  [...a].sort().join("\n") === [...b].sort().join("\n");

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

/**
 * A run the person entered by hand, as a Comic Vine volume might match it:
 * comics sharing an `item_comics.series` text (`series`), or collected
 * editions sharing a title stem (`collected`, Ch 1.4 Q1, L). `shelf` is the
 * signed-in user's first shelf holding the group's earliest item.
 */
export type SeriesGroup = {
  group: "series" | "collected";
  label: string;
  count: number;
  earliest: number | null;
  shelf: string | null;
};

/**
 * Where a Comic Vine volume stands against the catalog (A4): `in` when its
 * key is already a series' source; `match` when a hand-entered group looks
 * like the same run (`sameSeries`; the first group's fields, and every
 * group); `new` otherwise.
 */
export type SeriesStatus =
  | { status: "in"; seriesId: string }
  | ({ status: "match"; candidates: SeriesGroup[] } & SeriesGroup)
  | { status: "new" };

/** What the rule reads of a volume. */
export type SeriesRow = Pick<ComicVineSeries, "name" | "year" | "publisher">;

/**
 * What the rule reads of a group: its label, its earliest year, and for a
 * collected group the series texts of what its editions already hold.
 */
export type SeriesHeld = {
  group: "series" | "collected";
  label: string;
  earliest: number | null;
  contains: string[];
};

// Whole words inside a fold: "ultimate collection" is in
// "teenage mutant ninja turtles the ultimate collection".
const holds = (folded: string, part: string) =>
  part !== "" && ` ${folded} `.includes(` ${part} `);

/**
 * The one "looks like the same run" rule, which the search, the sheet and
 * 1.4.2's attach hold (Roadmap 2026-10-29, 1.4.1 Q1 and Q2, L). A series
 * group: the label's series fold is the volume name's, both first years are
 * known and within 1, and a publisher the label names in parentheses is the
 * volume's. A collected group: its title stem is in the volume's name, and
 * so is the series of something its editions already hold. Never the
 * volume number, which Comic Vine doesn't carry.
 */
export function sameSeries(row: SeriesRow, held: SeriesHeld): boolean {
  const name = normalizeSeries(row.name);
  if (name === "") return false;
  if (held.group === "collected") {
    return (
      holds(name, collectedStem(held.label)) &&
      held.contains.some((series) => holds(name, normalizeSeries(series)))
    );
  }
  if (normalizeSeries(held.label) !== name) return false;
  if (held.earliest === null || row.year === null) return false;
  if (Math.abs(held.earliest - row.year) > 1) return false;
  const publisher = seriesPublisher(held.label);
  return (
    publisher === null ||
    (row.publisher !== null && normalizePublisher(row.publisher) === publisher)
  );
}

type HeldGroup = SeriesHeld & { count: number; first: string };

/**
 * A page of Comic Vine volumes against the catalog: the keys, the series
 * groups, the collected editions, then the shelves of the groups that
 * matched. Four queries per page, whatever its size.
 */
export async function seriesStatuses(
  db: Db,
  { userId, rows }: { userId: string; rows: ComicVineSeries[] },
): Promise<SeriesStatus[]> {
  if (rows.length === 0) return [];

  const known = await db.execute<{ key: string; series: string }>(sql`
    select key, series from series_sources
    where source = 'comicvine' and key in (${sql.join(
      rows.map((row) => sql`${row.key}`),
      sql`, `,
    )})`);
  const byKey = new Map(known.map((r) => [r.key, r.series]));

  // Every hand-entered run with no Comic Vine source, by its series text,
  // with its earliest item for the shelf.
  const series = await db.execute<HeldGroup>(sql`
    select c.series as label, count(*)::int as count,
      min(extract(year from i.released_on))::int as earliest,
      (array_agg(i.id order by i.released_on nulls last, c.number nulls last, i.id))[1] as first
    from items i join item_comics c on c.item = i.id
    where i.type = 'comic' and c.series is not null
      and not exists (
        select 1 from item_sources s where s.item = i.id and s.source = 'comicvine')
    group by c.series`);

  // Every hand-entered collected edition, with the series of what its
  // editions hold; grouped by title stem here, a fold SQL can't do.
  const collected = await db.execute<{
    id: string;
    title: string;
    contains: string[];
  }>(sql`
    select i.id, i.title,
      coalesce(array_agg(distinct cc.series) filter (where cc.series is not null), '{}') as contains
    from items i
    left join editions e on e.item = i.id
    left join edition_contents ec on ec.edition = e.id
    left join item_comics cc on cc.item = ec.item
    where i.type = 'comic' and i.form = 'collected'
      and not exists (
        select 1 from item_sources s where s.item = i.id and s.source = 'comicvine')
    group by i.id, i.title`);

  const groups: HeldGroup[] = series.map((g) => ({
    ...g,
    group: "series",
    contains: [],
  }));
  const stems = new Map<string, (typeof collected)[number][]>();
  for (const item of collected) {
    const stem = collectedStem(item.title);
    if (stem === "") continue;
    stems.set(stem, [...(stems.get(stem) ?? []), item]);
  }
  for (const items of stems.values()) {
    const ordered = [...items].sort(
      (a, b) =>
        trailingNumber(a.title) - trailingNumber(b.title) ||
        a.id.localeCompare(b.id),
    );
    groups.push({
      group: "collected",
      label: ordered[0].title.replace(/\s*[0-9]+\s*$/, "").trim(),
      count: ordered.length,
      earliest: null,
      first: ordered[0].id,
      contains: [...new Set(ordered.flatMap((item) => item.contains))],
    });
  }
  // The first candidate is the likeliest run: series by first year, then
  // collected by the longer stem and the larger count, so a generic
  // "Collection" never leads a run of "Ultimate Collection" (Rummage R3).
  groups.sort(
    (a, b) =>
      Number(a.group === "collected") - Number(b.group === "collected") ||
      (a.earliest ?? 0) - (b.earliest ?? 0) ||
      collectedStem(b.label).length - collectedStem(a.label).length ||
      b.count - a.count ||
      a.label.localeCompare(b.label),
  );

  const found = rows.map((row) =>
    byKey.has(row.key) ? [] : groups.filter((g) => sameSeries(row, g)),
  );
  const firsts = [...new Set(found.flat().map((g) => g.first))];
  const shelves = firsts.length
    ? await db.execute<{ item: string; name: string }>(sql`
        select distinct on (e.item) e.item, sh.name from shelf_entries e
        join shelves sh on sh.id = e.shelf
        where sh.owner = ${userId} and e.item in (${sql.join(
          firsts.map((id) => sql`${id}`),
          sql`, `,
        )})
        order by e.item, sh.created_at, sh.id`)
    : [];
  const shelfOf = new Map(shelves.map((s) => [s.item, s.name]));

  return rows.map((row, i): SeriesStatus => {
    const seriesId = byKey.get(row.key);
    if (seriesId) return { status: "in", seriesId };
    if (found[i].length === 0) return { status: "new" };
    const candidates = found[i].map(
      ({ group, label, count, earliest, first }): SeriesGroup => ({
        group,
        label,
        count,
        earliest,
        shelf: shelfOf.get(first) ?? null,
      }),
    );
    return { status: "match", ...candidates[0], candidates };
  });
}

const trailingNumber = (title: string) =>
  Number(title.match(/([0-9]+)\s*$/)?.[1] ?? Number.MAX_SAFE_INTEGER);

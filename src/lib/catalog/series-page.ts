import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { firstViaTitle, heldBy, heldEditions } from "@/lib/collection/owned";
import { type CollectedIn, collectedInRows } from "./item-page";

/** What `/series/<id>` shows (A9): the series, its sources, and its issues in the catalog. */
export type SeriesPage = {
  series: {
    id: string;
    name: string;
    volume: number | null;
    year_began: number | null;
    year_ended: number | null;
    publisher: string | null;
    kind: string | null;
    summary: string | null;
  };
  sources: { source: string; key: string; url: string | null }[];
  issues: {
    id: string;
    title: string;
    number: number | null;
    released_on: string | null;
    released_precision: string | null;
    cover_path: string | null;
    form: string | null;
    /** The caller holds a copy of this issue, in any format (Ch 1.7 A5). */
    held: boolean;
    /** The work of the first copy that holds it through contents or a host (A5). */
    via: string | null;
    /** The caller's floppy copies of this issue: the box and its label (A8). */
    floppies: number;
  }[];
  /** Every edition whose contents hold an issue of this run. */
  collectedIn: CollectedIn[];
  /** Which of those printings the caller holds (A8). */
  heldIn: string[];
};

/**
 * Everything `/series/<id>` shows to this caller, or null for an id the catalog
 * doesn't hold. The series is catalog, the same for everyone; `held`, `via`,
 * `floppies` and `heldIn` are the caller's alone.
 */
export async function loadSeriesPage(
  db: Db,
  { id, userId }: { id: string; userId: string },
): Promise<SeriesPage | null> {
  const [series] = await db.execute<SeriesPage["series"]>(sql`
    select id, name, volume, year_began, year_ended, publisher, kind, summary
    from series where id = ${id}`);
  if (!series) return null;

  const [sources, issues, collectedIn] = await Promise.all([
    db.execute<SeriesPage["sources"][number]>(sql`
      select source, key, url from series_sources
      where series = ${id} order by source, key`),
    // Cover-date order, as Comic Vine lists a run; the number settles a tie
    // (#16 and #15 share a month in the 1984 run).
    db.execute<SeriesPage["issues"][number]>(sql`
      select i.id, i.title, c.number, i.released_on::text as released_on,
        i.released_precision, i.cover_path, i.form,
        ${heldBy(sql`i.id`, userId)} as held,
        ${firstViaTitle(sql`i.id`, userId)} as via,
        (select count(*)::int from copies f join editions fe on fe.id = f.edition
          where f.owner = ${userId} and fe.item = i.id and fe.format = 'floppy') as floppies
      from item_comics c join items i on i.id = c.item
      where c.series_id = ${id}
      order by i.released_on nulls last, c.number nulls last, i.title`),
    // In run order: by the lowest issue of this series each one holds.
    db.execute<CollectedIn>(
      collectedInRows(
        sql`e.id in (select x.edition from edition_contents x
          join item_comics c on c.item = x.item where c.series_id = ${id})`,
        sql`(select min(c.number) from edition_contents x
          join item_comics c on c.item = x.item
          where x.edition = e.id and c.series_id = ${id}) nulls last, i.title, e.id`,
      ),
    ),
  ]);
  return {
    series,
    sources: [...sources],
    issues: [...issues],
    collectedIn: [...collectedIn],
    heldIn: await heldEditions(db, {
      editions: collectedIn.map((row) => row.editionId),
      userId,
    }),
  };
}

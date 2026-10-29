import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";

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
  }[];
};

/** Everything `/series/<id>` shows, or null for an id the catalog doesn't hold. */
export async function loadSeriesPage(
  db: Db,
  { id }: { id: string },
): Promise<SeriesPage | null> {
  const [series] = await db.execute<SeriesPage["series"]>(sql`
    select id, name, volume, year_began, year_ended, publisher, kind, summary
    from series where id = ${id}`);
  if (!series) return null;

  const [sources, issues] = await Promise.all([
    db.execute<SeriesPage["sources"][number]>(sql`
      select source, key, url from series_sources
      where series = ${id} order by source, key`),
    // Cover-date order, as Comic Vine lists a run; the number settles a tie
    // (#16 and #15 share a month in the 1984 run).
    db.execute<SeriesPage["issues"][number]>(sql`
      select i.id, i.title, c.number, i.released_on::text as released_on,
        i.released_precision, i.cover_path
      from item_comics c join items i on i.id = c.item
      where c.series_id = ${id}
      order by i.released_on nulls last, c.number nulls last, i.title`),
  ]);
  return { series, sources: [...sources], issues: [...issues] };
}

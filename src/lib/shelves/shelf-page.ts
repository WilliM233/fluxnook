import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { entryStatuses } from "@/db/vocabulary";
import type { WorkFacts } from "@/lib/catalog/work-line";
import { meanStars } from "@/lib/journal/stars";
import type { ItemType } from "@/lib/journal/words";
import type { Rated } from "./lines";

/**
 * One work on the shelf, with what its row prints (A7): and from Ch 1.6 the
 * work's stars, its latest starred read's, and how many reads it has (A9),
 * both the shelf owner's.
 */
export type ShelfRow = {
  id: string;
  position: number;
  status: (typeof entryStatuses)[number];
  // The column's check holds the four types the journal's words know.
  item: WorkFacts & {
    id: string;
    type: ItemType;
    title: string;
    cover_path: string | null;
  };
  stars: number | null;
  reads: number;
};

type Counts = { works: number; done: number; skipped: number };

export type ShelfSection = Counts & {
  id: string;
  name: string;
  position: number;
  rows: ShelfRow[];
};

export type ShelfPage = {
  shelf: {
    id: string;
    name: string;
    description: string;
    sourceUrl: string | null;
  };
  counts: Counts & { sections: number };
  unsectioned: ShelfRow[];
  sections: ShelfSection[];
};

/** A list's works, done and skipped: the header's and each section's counts. */
export const tally = (rows: Pick<ShelfRow, "status">[]): Counts => ({
  works: rows.length,
  done: rows.filter((r) => r.status === "done").length,
  skipped: rows.filter((r) => r.status === "skipped").length,
});

/**
 * A list's star part (1.6 A9): the mean over its works that have stars, and
 * how many. A skipped work counts like any other: its status is the shelf's,
 * its stars the journal's.
 */
export const ratedOf = (rows: Pick<ShelfRow, "stars">[]): Rated => {
  const starred = rows.flatMap((r) => (r.stars === null ? [] : [r.stars]));
  return { mean: meanStars(starred), n: starred.length };
};

type Read = ShelfPage["shelf"] & {
  sections: { id: string; name: string; position: number }[];
  rows: (ShelfRow & { section: string | null })[];
};

/**
 * A shelf of the caller's as its page reads it, or null: another person's
 * shelf is no shelf (A3, A7). One statement, so the sections and the rows
 * are one snapshot: a section deleted from another tab can't hide its rows
 * while the counts still hold them (1.5.1 N4). Rows come in position order,
 * which A2 keeps equal to the display order, and are grouped here.
 */
export async function loadShelfPage(
  db: Db,
  { id, userId }: { id: string; userId: string },
): Promise<ShelfPage | null> {
  const [read] = await db.execute<Read>(sql`
    select s.id, s.name, s.description, s.source_url as "sourceUrl",
      (select coalesce(json_agg(json_build_object(
          'id', x.id, 'name', x.name, 'position', x.position
        ) order by x.position), '[]')
        from shelf_sections x where x.shelf = s.id) as sections,
      (select coalesce(json_agg(json_build_object(
          'id', e.id, 'position', e.position, 'status', e.status,
          'section', e.section,
          'item', json_build_object(
            'id', i.id, 'type', i.type, 'title', i.title,
            'cover_path', i.cover_path, 'released_on', i.released_on::text,
            'form', i.form, 'runtime_minutes', f.runtime_minutes,
            'seasons', t.seasons, 'author', b.author,
            'series', nullif(c.series, ''), 'number', c.number),
          -- latestStarred in SQL: A5's order, as sortReads holds it
          'stars', (select o.stars::float8 from occurrences o
            where o.owner = s.owner and o.item = i.id and o.stars is not null
            order by coalesce(o.finished_on, o.started_on,
                (o.created_at at time zone 'UTC')::date) desc,
              o.created_at desc, o.id desc
            limit 1),
          'reads', (select count(*)::int from occurrences o
            where o.owner = s.owner and o.item = i.id)
        ) order by e.position), '[]')
        from shelf_entries e
        join items i on i.id = e.item
        left join item_films f on f.item = i.id
        left join item_tv t on t.item = i.id
        left join item_books b on b.item = i.id
        left join item_comics c on c.item = i.id
        where e.shelf = s.id) as rows
    from shelves s
    where s.id = ${id} and s.owner = ${userId}`);
  if (!read) return null;
  const { sections, rows, ...shelf } = read;

  const strip = ({ section: _, ...row }: ShelfRow & { section: unknown }) =>
    row;
  const unsectioned = rows.filter((r) => r.section === null).map(strip);
  return {
    shelf,
    counts: { ...tally(rows), sections: sections.length },
    unsectioned,
    sections: sections.map((section) => {
      const held = rows.filter((r) => r.section === section.id).map(strip);
      return { ...section, ...tally(held), rows: held };
    }),
  };
}

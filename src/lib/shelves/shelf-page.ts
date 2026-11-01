import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { entryStatuses } from "@/db/vocabulary";
import type { WorkFacts } from "@/lib/catalog/work-line";

/** One work on the shelf, with what its row prints (A7). */
export type ShelfRow = {
  id: string;
  position: number;
  status: (typeof entryStatuses)[number];
  item: WorkFacts & { id: string; title: string; cover_path: string | null };
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
            'series', nullif(c.series, ''), 'number', c.number)
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

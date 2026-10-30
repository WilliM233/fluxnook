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

const tally = (rows: ShelfRow[]): Counts => ({
  works: rows.length,
  done: rows.filter((r) => r.status === "done").length,
  skipped: rows.filter((r) => r.status === "skipped").length,
});

/**
 * A shelf of the caller's as its page reads it, or null: another person's
 * shelf is no shelf (A3, A7). Rows come in position order, which A2 keeps
 * equal to the display order, and are grouped here.
 */
export async function loadShelfPage(
  db: Db,
  { id, userId }: { id: string; userId: string },
): Promise<ShelfPage | null> {
  const [shelf] = await db.execute<ShelfPage["shelf"]>(sql`
    select id, name, description, source_url as "sourceUrl" from shelves
    where id = ${id} and owner = ${userId}`);
  if (!shelf) return null;

  const [sections, rows] = await Promise.all([
    db.execute<{ id: string; name: string; position: number }>(sql`
      select id, name, position from shelf_sections
      where shelf = ${id} order by position`),
    db.execute<ShelfRow & { section: string | null }>(sql`
      select e.id, e.position, e.status, e.section,
        json_build_object(
          'id', i.id, 'type', i.type, 'title', i.title, 'cover_path', i.cover_path,
          'released_on', i.released_on::text, 'form', i.form,
          'runtime_minutes', f.runtime_minutes, 'seasons', t.seasons,
          'author', b.author, 'series', nullif(c.series, ''), 'number', c.number
        ) as item
      from shelf_entries e
      join items i on i.id = e.item
      left join item_films f on f.item = i.id
      left join item_tv t on t.item = i.id
      left join item_books b on b.item = i.id
      left join item_comics c on c.item = i.id
      where e.shelf = ${id}
      order by e.position`),
  ]);

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

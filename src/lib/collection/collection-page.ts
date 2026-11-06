import { type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { WorkFacts } from "@/lib/catalog/work-line";
import { type Cursor, PAGE } from "@/lib/journal/cursor";
import { timestampText } from "@/lib/journal/entries";
import type { ItemType } from "./formats";
import { toFind, viaBy } from "./owned";
import type { ChipType } from "./shopping";

/** One copy on the Collection page, with its printing and its work (A10). */
export type CollectionRow = {
  copy: {
    id: string;
    /** UTC with microseconds, as the cursor carries it. */
    createdAt: string;
    condition: string | null;
    acquiredOn: string | null;
    note: string;
  };
  printing: {
    format: string;
    publisher: string | null;
    released_on: string | null;
    contents: number;
  };
  work: WorkFacts & {
    id: string;
    title: string;
    type: ItemType;
    form: string | null;
    cover_path: string | null;
  };
};

export type CollectionPage = {
  /** The whole collection's, whichever chip is picked. */
  totals: { copies: number; works: number; via: number };
  /** Shopping's total, from the fragment Shopping's read uses. */
  toFind: number;
  rows: CollectionRow[];
  /** The next page's cursor, row 50's; null on the last page. */
  older: Cursor | null;
};

/** The works on the caller's shelves left to find, one count per work. */
export const toFindCount = (userId: string): SQL => sql`(
  select count(distinct e.item)::int
  from shelf_entries e join shelves s on s.id = e.shelf
    join items i on i.id = e.item
  where s.owner = ${userId} and ${toFind(sql`i.id`, sql`i.form`, userId)})`;

/**
 * A page of the caller's copies (Ch 1.7 A10), newest first by
 * `created_at desc, id desc`, 50 a page by keyset, so the copies one load
 * writes at one instant never repeat or vanish at a page edge. Reads 51 to know
 * whether an older page exists. The totals count the collection and a chip only
 * filters the rows. Another person's copies never come back.
 */
export async function loadCollectionPage(
  db: Db,
  {
    userId,
    before,
    type = "all",
  }: { userId: string; before?: Cursor; type?: ChipType },
): Promise<CollectionPage> {
  const [{ copies, works, via, shopping }] = await db.execute<{
    copies: number;
    works: number;
    via: number;
    shopping: number;
  }>(sql`
    select
      (select count(*)::int from copies c where c.owner = ${userId}) as copies,
      (select count(distinct e.item)::int
        from copies c join editions e on e.id = c.edition
        where c.owner = ${userId}) as works,
      (select count(*)::int from items i where ${viaBy(sql`i.id`, userId)}) as via,
      ${toFindCount(userId)} as shopping`);
  const after = before
    ? sql`and (c.created_at, c.id) < (${before.at}::timestamptz, ${before.id}::uuid)`
    : sql``;
  const chip = type === "all" ? sql`` : sql`and i.type = ${type}`;
  const found = await db.execute<CollectionRow>(sql`
    select
      json_build_object(
        'id', c.id, 'createdAt', ${timestampText(sql`c.created_at`)},
        'condition', c.condition, 'acquiredOn', c.acquired_on::text,
        'note', c.note) as copy,
      json_build_object(
        'format', e.format, 'publisher', e.publisher,
        'released_on', e.released_on::text,
        'contents', (select count(*)::int from edition_contents x
          where x.edition = e.id)) as printing,
      json_build_object(
        'id', i.id, 'type', i.type, 'title', i.title, 'form', i.form,
        'cover_path', i.cover_path, 'released_on', i.released_on::text,
        'runtime_minutes', f.runtime_minutes, 'seasons', t.seasons,
        'author', b.author, 'series', nullif(k.series, ''),
        'number', k.number) as work
    from copies c
    join editions e on e.id = c.edition
    join items i on i.id = e.item
    left join item_films f on f.item = i.id
    left join item_tv t on t.item = i.id
    left join item_books b on b.item = i.id
    left join item_comics k on k.item = i.id
    where c.owner = ${userId} ${chip} ${after}
    order by c.created_at desc, c.id desc
    limit ${PAGE + 1}`);
  const rows = [...found].slice(0, PAGE);
  const last = rows.at(-1);
  return {
    totals: { copies, works, via },
    toFind: shopping,
    rows,
    older:
      found.length > PAGE && last
        ? { at: last.copy.createdAt, id: last.copy.id }
        : null,
  };
}

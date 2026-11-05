import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { NOOK_ORDER } from "@/lib/shelves/nook-page";
import { heldBy, toFind, viaBy } from "./owned";
import type { Printing } from "./sheet";
import {
  groupShopping,
  type Shopping,
  type ShoppingEntry,
  type ShoppingWork,
} from "./shopping";

type Read = {
  shelfId: string;
  shelfName: string;
  sectionId: string | null;
  sectionName: string | null;
  /** Null on the one row an empty shelf reads. */
  work: ShoppingWork | null;
  printings: Printing[];
  toFind: boolean;
  backup: boolean;
  backupHeld: boolean;
};

/**
 * Shopping (Ch 1.7 A11): every entry on the caller's shelves in the nook's
 * order, the unsectioned first, with whether it's to find, whether it's a
 * backup, and the printings a row's sheet lists. Nothing is stored. One
 * statement, so the counts and the rows are one snapshot; `groupShopping` does
 * the rest. A skipped entry stays: skipped is the shelf's reading word.
 */
export async function loadShopping(db: Db, userId: string): Promise<Shopping> {
  const found = await db.execute<Read>(sql`
    select s.id as "shelfId", s.name as "shelfName",
      x.id as "sectionId", x.name as "sectionName",
      case when i.id is null then null else json_build_object(
        'id', i.id, 'type', i.type, 'title', i.title, 'form', i.form,
        'cover_path', i.cover_path, 'released_on', i.released_on::text,
        'runtime_minutes', f.runtime_minutes, 'seasons', t.seasons,
        'author', b.author, 'series', nullif(k.series, ''),
        'number', k.number) end as work,
      case when wanted.yes then (
        select coalesce(json_agg(json_build_object(
            'id', p.id, 'format', p.format, 'title', p.title,
            'publisher', p.publisher, 'released_on', p.released_on::text
          ) order by p.released_on nulls last, p.created_at, p.id), '[]'::json)
        from editions p where p.item = i.id)
      else '[]'::json end as printings,
      coalesce(wanted.yes, false) as "toFind",
      i.form is not distinct from 'backup' as backup,
      i.form is not distinct from 'backup' and (
        ${heldBy(sql`i.id`, userId)} or ${viaBy(sql`i.id`, userId)}) as "backupHeld"
    from shelves s
    left join shelf_entries e on e.shelf = s.id
    left join shelf_sections x on x.id = e.section
    left join items i on i.id = e.item
    left join item_films f on f.item = i.id
    left join item_tv t on t.item = i.id
    left join item_books b on b.item = i.id
    left join item_comics k on k.item = i.id
    left join lateral (
      select ${toFind(sql`i.id`, sql`i.form`, userId)} as yes) wanted on true
    where s.owner = ${userId}
    order by ${NOOK_ORDER}, s.id, x.position nulls first, e.position`);

  const shelves = new Map<string, string>();
  const entries: ShoppingEntry[] = [];
  for (const row of found) {
    shelves.set(row.shelfId, row.shelfName);
    if (!row.work) continue;
    entries.push({
      shelfId: row.shelfId,
      section:
        row.sectionId && row.sectionName
          ? { id: row.sectionId, name: row.sectionName }
          : null,
      work: row.work,
      printings: row.printings,
      toFind: row.toFind,
      backup: row.backup,
      backupHeld: row.backupHeld,
    });
  }
  return groupShopping(
    [...shelves].map(([id, name]) => ({ id, name })),
    entries,
  );
}

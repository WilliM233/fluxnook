import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { normalizeName } from "./normalize";

/** A catalog work as the Add works picker lists it (Ch 1.5 A11). */
export type PickerWork = {
  id: string;
  type: string;
  title: string;
  released_on: string | null;
  author: string | null;
  series: string | null;
  number: number | null;
};

/**
 * Every work in the catalog, newest added first, then by year, then title
 * (C2): a fresh load writes every item at one moment, so the fixture reads
 * in year order. No cap here; the sheet shows fifty.
 */
export async function loadPickerWorks(db: Db): Promise<PickerWork[]> {
  const rows = await db.execute<PickerWork>(sql`
    select i.id, i.type, i.title, i.released_on::text as released_on,
      b.author, nullif(c.series, '') as series, c.number
    from items i
    left join item_books b on b.item = i.id
    left join item_comics c on c.item = i.id
    order by i.created_at desc, i.released_on asc nulls last, i.title, i.id`);
  return [...rows];
}

/**
 * Whether a work answers the Find box, already folded: its title, author and
 * series text folded together, the 1.4 picker's fold with the author added.
 */
export function matchesFind(work: PickerWork, folded: string): boolean {
  if (!folded) return true;
  const text = [work.title, work.author, work.series].filter(Boolean).join(" ");
  return normalizeName(text).includes(folded);
}

/** The year, then a book's author or a comic's "<series> #<n>". */
export function pickerLine(work: PickerWork): string {
  const issue =
    work.series &&
    [work.series, work.number != null && `#${work.number}`]
      .filter(Boolean)
      .join(" ");
  return [work.released_on?.slice(0, 4), work.author, issue]
    .filter(Boolean)
    .join(" · ");
}

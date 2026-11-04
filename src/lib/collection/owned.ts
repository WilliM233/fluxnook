import { type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db/client";

/**
 * Owned via (Ch 1.7 A5), one rule every page reads and nothing ever writes.
 * A work is held when the caller has a copy of one of its editions; via when
 * the caller has a copy of an edition whose contents hold it. A backup is via
 * when its contained-in host is held or via, one hop, since the host's pages
 * hold it. Narrative and physical containment coincide nowhere else.
 */

/** Contents only, no hop: the rule a host is judged by. */
const inContents = (item: SQL, userId: string) => sql`exists (
  select 1 from copies c join edition_contents x on x.edition = c.edition
  where c.owner = ${userId} and x.item = ${item})`;

/** Whether the caller holds a copy of one of the work's editions. */
export const heldBy = (item: SQL, userId: string) => sql`exists (
  select 1 from copies c join editions e on e.id = c.edition
  where c.owner = ${userId} and e.item = ${item})`;

/** Whether the caller's copies hold the work through contents, or a backup through its host. */
export const viaBy = (
  item: SQL,
  userId: string,
) => sql`(${inContents(item, userId)}
  or exists (
    select 1 from item_relations r join items b on b.id = r.from_item
    where r.from_item = ${item} and r.kind = 'contained-in' and b.form = 'backup'
      and (${heldBy(sql`r.to_item`, userId)} or ${inContents(sql`r.to_item`, userId)})))`;

/** A copy of one of the work's own printings (A4). */
export type HeldCopy = {
  id: string;
  editionId: string;
  format: string;
  condition: string | null;
  acquiredOn: string | null;
  note: string;
};

/** A copy whose printing holds the work (A4), named by that printing's work. */
export type ViaCopy = {
  copyId: string;
  editionId: string;
  itemId: string;
  title: string;
  format: string;
};

export type Ownership = {
  /** Oldest first, printings in the page's order. */
  held: HeldCopy[];
  /** By the edition's work title, then edition, then the copy's age: the first names the line. */
  via: ViaCopy[];
  /** The host the first via copy reaches a backup through; null on anything else. */
  host: { id: string; title: string } | null;
};

/** What the caller holds of one work, and how; empty for an id no work has. */
export async function loadOwnership(
  db: Db,
  { itemId, userId }: { itemId: string; userId: string },
): Promise<Ownership> {
  const [held, via] = await Promise.all([
    db.execute<HeldCopy>(sql`
      select c.id, c.edition as "editionId", e.format, c.condition,
        c.acquired_on::text as "acquiredOn", c.note
      from copies c join editions e on e.id = c.edition
      where c.owner = ${userId} and e.item = ${itemId}
      order by e.released_on nulls last, e.created_at, e.id, c.created_at, c.id`),
    db.execute<
      ViaCopy & { hostId: string | null; hostTitle: string | null }
    >(sql`
      select c.id as "copyId", e.id as "editionId", w.id as "itemId", w.title,
        e.format, h.id as "hostId", h.title as "hostTitle"
      from copies c join editions e on e.id = c.edition
        join items w on w.id = e.item
        left join lateral (
          select t.id, t.title
          from item_relations r join items t on t.id = r.to_item
            join items b on b.id = r.from_item
          where r.from_item = ${itemId} and r.kind = 'contained-in'
            and b.form = 'backup'
            and (e.item = r.to_item or exists (
              select 1 from edition_contents x
              where x.edition = e.id and x.item = r.to_item))
          order by t.title, t.id limit 1
        ) h on true
      where c.owner = ${userId} and (h.id is not null or exists (
        select 1 from edition_contents x
        where x.edition = e.id and x.item = ${itemId}))
      order by w.title, e.id, c.created_at, c.id`),
  ]);
  const first = via[0];
  return {
    held: [...held],
    via: via.map(({ copyId, editionId, itemId, title, format }) => ({
      copyId,
      editionId,
      itemId,
      title,
      format,
    })),
    host:
      first?.hostId && first.hostTitle
        ? { id: first.hostId, title: first.hostTitle }
        : null,
  };
}

/** Which of these printings the caller holds, for a page's Collected in rows (A6). */
export async function heldEditions(
  db: Db,
  { editions, userId }: { editions: string[]; userId: string },
): Promise<string[]> {
  if (editions.length === 0) return [];
  const asked = sql`array[${sql.join(
    editions.map((id) => sql`${id}`),
    sql`, `,
  )}]::uuid[]`;
  const rows = await db.execute<{ edition: string }>(sql`
    select distinct edition from copies
    where owner = ${userId} and edition = any(${asked})`);
  return rows.map((row) => row.edition);
}

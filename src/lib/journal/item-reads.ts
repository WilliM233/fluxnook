import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { timestampText } from "./entries";
import { type ReadLike, sortReads } from "./order";
import type { AnchorKind } from "./words";

/** One entry under a read on the item page, `writtenAt` as UTC text. */
export type ItemEntry = {
  id: string;
  writtenAt: string;
  body: string;
  anchorKind: AnchorKind | null;
  anchorValue: string | null;
};

/**
 * One of the caller's reads of a work, with its entries newest first and
 * its version (`updatedAt`, as the PATCH answers it).
 */
export type ItemRead = ReadLike & { updatedAt: string; entries: ItemEntry[] };

/**
 * The caller's reads of a work for its Journal section (Ch 1.6 A5): one
 * query, each read with its entries by `written_at` desc, then the reads in
 * A5's order by `sortReads`, so the rule lives once. Another person's reads
 * never come back.
 */
export async function loadItemReads(
  db: Db,
  { itemId, userId }: { itemId: string; userId: string },
): Promise<ItemRead[]> {
  const rows = await db.execute<ItemRead>(sql`
    select o.id, o.status, o.started_on::text as "startedOn",
      o.finished_on::text as "finishedOn", o.stars::float8 as stars,
      ${timestampText(sql`o.created_at`)} as "createdAt",
      ${timestampText(sql`o.updated_at`)} as "updatedAt",
      coalesce(json_agg(json_build_object(
          'id', j.id, 'writtenAt', ${timestampText(sql`j.written_at`)},
          'body', j.body, 'anchorKind', j.anchor_kind, 'anchorValue', j.anchor_value)
        order by j.written_at desc, j.id desc) filter (where j.id is not null),
        '[]') as entries
    from occurrences o left join journal_entries j on j.occurrence = o.id
    where o.item = ${itemId} and o.owner = ${userId}
    group by o.id`);
  return sortReads([...rows]);
}

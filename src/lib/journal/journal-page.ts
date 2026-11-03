import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { occurrenceStatuses } from "@/db/vocabulary";
import type { WorkFacts } from "@/lib/catalog/work-line";
import { type Cursor, PAGE } from "./cursor";
import { timestampText } from "./entries";
import type { AnchorKind, ItemType } from "./words";

/** One entry on the Journal page, with its read and its work (A8). */
export type JournalRow = {
  entry: {
    id: string;
    /** UTC with microseconds, as the cursor carries it. */
    writtenAt: string;
    body: string;
    anchorKind: AnchorKind | null;
    anchorValue: string | null;
  };
  read: {
    id: string;
    status: (typeof occurrenceStatuses)[number];
    startedOn: string | null;
    finishedOn: string | null;
    stars: number | null;
  };
  work: WorkFacts & { id: string; title: string; type: ItemType };
};

export type JournalPage = {
  totals: { entries: number; works: number };
  rows: JournalRow[];
  /** The next page's cursor, row 50's; null on the last page. */
  older: Cursor | null;
};

/**
 * A page of the caller's journal (Ch 1.6 A8): every entry across every work,
 * newest first by `written_at desc, id desc`, 50 a page by keyset, so two
 * entries written at one moment never repeat or vanish at a page edge
 * (census, C1). Reads 51 to know whether an older page exists. Another
 * person's entries never come back: the owner is the read's.
 */
export async function loadJournalPage(
  db: Db,
  { userId, before }: { userId: string; before?: Cursor },
): Promise<JournalPage> {
  const [totals] = await db.execute<JournalPage["totals"]>(sql`
    select count(*)::int as entries, count(distinct o.item)::int as works
    from journal_entries e join occurrences o on o.id = e.occurrence
    where o.owner = ${userId}`);
  const after = before
    ? sql`and (e.written_at, e.id) < (${before.writtenAt}::timestamptz, ${before.id}::uuid)`
    : sql``;
  const found = await db.execute<JournalRow>(sql`
    select
      json_build_object(
        'id', e.id, 'writtenAt', ${timestampText(sql`e.written_at`)},
        'body', e.body, 'anchorKind', e.anchor_kind,
        'anchorValue', e.anchor_value) as entry,
      json_build_object(
        'id', o.id, 'status', o.status, 'startedOn', o.started_on::text,
        'finishedOn', o.finished_on::text, 'stars', o.stars::float8) as read,
      json_build_object(
        'id', i.id, 'type', i.type, 'title', i.title,
        'released_on', i.released_on::text, 'form', i.form,
        'runtime_minutes', f.runtime_minutes, 'seasons', t.seasons,
        'author', b.author, 'series', nullif(c.series, ''),
        'number', c.number) as work
    from journal_entries e
    join occurrences o on o.id = e.occurrence
    join items i on i.id = o.item
    left join item_films f on f.item = i.id
    left join item_tv t on t.item = i.id
    left join item_books b on b.item = i.id
    left join item_comics c on c.item = i.id
    where o.owner = ${userId} ${after}
    order by e.written_at desc, e.id desc
    limit ${PAGE + 1}`);
  const rows = [...found].slice(0, PAGE);
  const last = rows.at(-1);
  return {
    totals,
    rows,
    older:
      found.length > PAGE && last
        ? { writtenAt: last.entry.writtenAt, id: last.entry.id }
        : null,
  };
}

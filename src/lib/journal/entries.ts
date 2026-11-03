import { type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { NotFoundError, type Tx } from "@/lib/catalog/import";
import { NO_READ, RuleError } from "./errors";
import {
  type AnchorKind,
  anchorKindSentence,
  anchorKindsFor,
  type ItemType,
} from "./words";

export const NO_ENTRY = "No entry by that id on this read.";

/**
 * A timestamp as the one text every read returns: UTC with microseconds,
 * `2026-11-02T21:14:03.512345Z`, so a cursor built from it never passes
 * through a JavaScript Date, which keeps milliseconds (census, C1).
 */
export const timestampText = (column: SQL) =>
  sql`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/** An entry as a write gives it; the anchor is both or neither. */
export type NewEntry = {
  body: string;
  anchorKind?: AnchorKind | null;
  anchorValue?: string | null;
  writtenAt?: string;
};

/** An entry as the routes answer it. */
export type Entry = {
  id: string;
  occurrence: string;
  writtenAt: string;
  body: string;
  anchorKind: AnchorKind | null;
  anchorValue: string | null;
};

/** The work a read is of, which decides the anchor kinds its entries take. */
export type WorkKind = { type: ItemType; form: string | null };

/** A kind the work doesn't take is a 400 naming the ones it does (A4). */
export function checkAnchorKind(
  work: WorkKind,
  kind: AnchorKind | null,
  field = "anchorKind",
) {
  if (kind && !anchorKindsFor(work.type, work.form).includes(kind)) {
    throw new RuleError(field, anchorKindSentence(work.type, work.form));
  }
}

/**
 * The one entry writer: the kind checked against the work, then the row.
 * `writtenAt` goes to Postgres as the text given, so its microseconds stay.
 */
export async function insertEntry(
  tx: Tx,
  { readId, work, entry }: { readId: string; work: WorkKind; entry: NewEntry },
): Promise<{ id: string }> {
  checkAnchorKind(work, entry.anchorKind ?? null);
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into journal_entries (occurrence, body, anchor_kind, anchor_value, written_at)
    values (${readId}, ${entry.body}, ${entry.anchorKind ?? null},
      ${entry.anchorValue ?? null}, coalesce(${entry.writtenAt ?? null}::timestamptz, now()))
    returning id`);
  return row;
}

type EntryKey = { userId: string; readId: string; entryId: string };

const ENTRY_COLUMNS = sql`e.id, e.occurrence, ${timestampText(sql`e.written_at`)} as "writtenAt",
  e.body, e.anchor_kind as "anchorKind", e.anchor_value as "anchorValue"`;

/** An entry on the caller's read (A4). The read must be the caller's. */
export async function createEntry(
  db: Db,
  { userId, readId, ...entry }: NewEntry & { userId: string; readId: string },
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [work] = await tx.execute<WorkKind>(sql`
      select i.type, i.form from occurrences o join items i on i.id = o.item
      where o.id = ${readId} and o.owner = ${userId}`);
    if (!work) throw new NotFoundError(NO_READ);
    return insertEntry(tx, { readId, work, entry });
  });
}

/**
 * A change to an entry on the caller's read: the body, the anchor pair
 * together (`null` both to clear), the time it was written.
 */
export async function updateEntry(
  db: Db,
  {
    userId,
    readId,
    entryId,
    ...change
  }: EntryKey & {
    body?: string;
    anchorKind?: AnchorKind | null;
    anchorValue?: string | null;
    writtenAt?: string;
  },
): Promise<Entry> {
  return db.transaction(async (tx) => {
    const [row] = await tx.execute<Entry & WorkKind>(sql`
      select ${ENTRY_COLUMNS}, i.type, i.form
      from journal_entries e join occurrences o on o.id = e.occurrence
        join items i on i.id = o.item
      where e.id = ${entryId} and e.occurrence = ${readId} and o.owner = ${userId}
      for update of e`);
    if (!row) throw new NotFoundError(NO_ENTRY);
    const anchorKind =
      change.anchorKind === undefined ? row.anchorKind : change.anchorKind;
    const anchorValue =
      change.anchorValue === undefined ? row.anchorValue : change.anchorValue;
    checkAnchorKind(row, anchorKind);
    const [entry] = await tx.execute<Entry>(sql`
      update journal_entries e set body = ${change.body ?? row.body},
        anchor_kind = ${anchorKind}, anchor_value = ${anchorValue},
        written_at = coalesce(${change.writtenAt ?? null}::timestamptz, e.written_at)
      where e.id = ${entryId}
      returning ${ENTRY_COLUMNS}`);
    return entry;
  });
}

/** An entry off the caller's read; the read and its other entries stay. */
export async function deleteEntry(
  db: Db,
  { userId, readId, entryId }: EntryKey,
) {
  const gone = await db.execute(sql`
    delete from journal_entries e using occurrences o
    where e.id = ${entryId} and e.occurrence = ${readId}
      and o.id = e.occurrence and o.owner = ${userId}
    returning e.id`);
  if (gone.length === 0) throw new NotFoundError(NO_ENTRY);
}

import { sql } from "drizzle-orm";
import type { Tx } from "@/lib/catalog/import";
import { RuleError } from "./errors";
import {
  type AnchorKind,
  anchorKindSentence,
  anchorKindsFor,
  type ItemType,
} from "./words";

/** An entry as a write gives it; the anchor is both or neither. */
export type NewEntry = {
  body: string;
  anchorKind?: AnchorKind | null;
  anchorValue?: string | null;
  writtenAt?: string;
};

/** The work a read is of, which decides the anchor kinds its entries take. */
export type WorkKind = { type: ItemType; form: string | null };

/** A kind the work doesn't take is a 400 naming the ones it does (A4). */
export function checkAnchorKind(work: WorkKind, kind: AnchorKind | null) {
  if (kind && !anchorKindsFor(work.type, work.form).includes(kind)) {
    throw new RuleError("anchorKind", anchorKindSentence(work.type, work.form));
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

import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { shelfEntries, shelfSections } from "@/db/schema";
import { NotFoundError, type Tx } from "@/lib/catalog/import";
import {
  type EntryRow,
  renumber as inDisplayOrder,
  type Placed,
  type Renumber,
  type SectionRow,
} from "./order";

export const NO_SHELF = "No shelf by that id.";

/** A shelf as its owner names it; anyone else's id is no shelf at all (A3). */
export type ShelfKey = { shelfId: string; userId: string };

/**
 * The shape of every write to a shelf's sections and entries: the caller's
 * shelf locked, the write, the whole shelf renumbered (A2), the shelf's
 * `updated_at` touched (C1: its trigger fires on the shelf row alone), all
 * in one transaction. Not the caller's and doesn't exist are one answer.
 * `renumber` is the order rule; a test passes one that throws.
 */
export async function withShelf<T>(
  db: Db,
  { shelfId, userId }: ShelfKey,
  write: (tx: Tx) => Promise<T>,
  renumber: Renumber = inDisplayOrder,
): Promise<T> {
  return db.transaction(async (tx) => {
    const [shelf] = await tx.execute(sql`
      select id from shelves where id = ${shelfId} and owner = ${userId}
      for update`);
    if (!shelf) throw new NotFoundError(NO_SHELF);
    const result = await write(tx);
    await renumberShelf(tx, shelfId, renumber);
    await tx.execute(
      sql`update shelves set updated_at = now() where id = ${shelfId}`,
    );
    return result;
  });
}

/** A shelf's sections and entries as the order rule reads them. */
export async function readShelf(
  tx: Tx,
  shelfId: string,
): Promise<{ sections: SectionRow[]; entries: EntryRow[] }> {
  const sections = await tx
    .select({ id: shelfSections.id, position: shelfSections.position })
    .from(shelfSections)
    .where(eq(shelfSections.shelf, shelfId));
  const entries = await tx
    .select({
      id: shelfEntries.id,
      section: shelfEntries.section,
      position: shelfEntries.position,
    })
    .from(shelfEntries)
    .where(eq(shelfEntries.shelf, shelfId));
  return { sections, entries };
}

/**
 * Stores what the order rule placed, the rows that changed only, in one
 * statement: a 326-row renumber is one update.
 */
export async function writePlaced(
  tx: Tx,
  before: EntryRow[],
  placed: Placed[],
) {
  const held = new Map(before.map((e) => [e.id, e]));
  const changed = placed.filter((p) => {
    const was = held.get(p.id);
    return was?.position !== p.position || was.section !== p.section;
  });
  if (changed.length === 0) return;
  const rows = sql.join(
    changed.map(
      (p) => sql`(${p.id}::uuid, ${p.section}::uuid, ${p.position}::int)`,
    ),
    sql`, `,
  );
  await tx.execute(sql`
    update shelf_entries e set section = v.section, position = v.position
    from (values ${rows}) as v(id, section, position)
    where e.id = v.id`);
}

/** Stores section positions the order rule computed, the changed ones only. */
export async function writeSections(
  tx: Tx,
  before: SectionRow[],
  after: SectionRow[],
) {
  const held = new Map(before.map((s) => [s.id, s.position]));
  const changed = after.filter((s) => held.get(s.id) !== s.position);
  if (changed.length === 0) return;
  const rows = sql.join(
    changed.map((s) => sql`(${s.id}::uuid, ${s.position}::int)`),
    sql`, `,
  );
  await tx.execute(sql`
    update shelf_sections s set position = v.position
    from (values ${rows}) as v(id, position)
    where s.id = v.id`);
}

/** The shelf read, placed by `renumber`, and stored; what it placed comes back. */
export async function renumberShelf(
  tx: Tx,
  shelfId: string,
  renumber: Renumber = inDisplayOrder,
): Promise<Placed[]> {
  const { sections, entries } = await readShelf(tx, shelfId);
  const placed = renumber(sections, entries);
  await writePlaced(tx, entries, placed);
  return placed;
}

import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { items, shelfEntries } from "@/db/schema";
import type { entryStatuses } from "@/db/vocabulary";
import { NotFoundError, type Tx } from "@/lib/catalog/import";
import { moveEntry as placeMove } from "./order";
import { sectionOn } from "./sections";
import { readShelf, type ShelfKey, withShelf, writePlaced } from "./write";

export const NO_ENTRY = "No entry by that id on this shelf.";

/** A work to add that isn't in the catalog: nothing is added (A5). */
export class BadItems extends Error {}

type EntryKey = ShelfKey & { entryId: string };

async function entryOn(tx: Tx, shelfId: string, entryId: string) {
  const [entry] = await tx
    .select({ id: shelfEntries.id })
    .from(shelfEntries)
    .where(and(eq(shelfEntries.id, entryId), eq(shelfEntries.shelf, shelfId)));
  if (!entry) throw new NotFoundError(NO_ENTRY);
}

/**
 * Works onto the shelf in the order given, after the last entry of the
 * section (or of the unsectioned part), unmarked and private. A work the
 * shelf already holds is skipped and stays where it is, never an error, so a
 * run can be added twice (A5). One id not in the catalog adds nothing.
 */
export async function addEntries(
  db: Db,
  {
    items: itemIds,
    section,
    ...key
  }: ShelfKey & { items: string[]; section?: string },
): Promise<{ added: number; skipped: number }> {
  return withShelf(db, key, async (tx) => {
    if (section) await sectionOn(tx, key.shelfId, section);

    const found = await tx
      .select({ id: items.id })
      .from(items)
      .where(inArray(items.id, itemIds));
    if (found.length !== new Set(itemIds).size) {
      throw new BadItems("Every work must be in the catalog.");
    }

    // Above every position the shelf holds, so the renumber withShelf ends
    // with puts them after the section's last entry, in this order.
    const [{ last }] = await tx.execute<{ last: number }>(sql`
      select coalesce(max(position), 0)::int as last from shelf_entries
      where shelf = ${key.shelfId}`);
    const added = await tx
      .insert(shelfEntries)
      .values(
        itemIds.map((item, i) => ({
          shelf: key.shelfId,
          section: section ?? null,
          item,
          position: last + i + 1,
        })),
      )
      .onConflictDoNothing({ target: [shelfEntries.shelf, shelfEntries.item] })
      .returning({ id: shelfEntries.id });
    return { added: added.length, skipped: itemIds.length - added.length };
  });
}

/** The shelf's own mark on a work; it writes no occurrence (2026-10-30 call). */
export async function setEntryStatus(
  db: Db,
  {
    entryId,
    status,
    ...key
  }: EntryKey & { status: (typeof entryStatuses)[number] },
) {
  return withShelf(db, key, async (tx) => {
    const [entry] = await tx
      .update(shelfEntries)
      .set({ status })
      .where(
        and(eq(shelfEntries.id, entryId), eq(shelfEntries.shelf, key.shelfId)),
      )
      .returning({
        id: shelfEntries.id,
        item: shelfEntries.item,
        section: shelfEntries.section,
        position: shelfEntries.position,
        status: shelfEntries.status,
      });
    if (!entry) throw new NotFoundError(NO_ENTRY);
    return entry;
  });
}

/**
 * A work into a section (null: above the first) at a 0-based index; the
 * server numbers the whole shelf and answers every position (A5).
 */
export async function moveEntry(
  db: Db,
  {
    entryId,
    section,
    index,
    ...key
  }: EntryKey & { section: string | null; index: number },
): Promise<{ positions: { id: string; position: number }[] }> {
  return withShelf(db, key, async (tx) => {
    await entryOn(tx, key.shelfId, entryId);
    if (section) await sectionOn(tx, key.shelfId, section);
    const { sections, entries } = await readShelf(tx, key.shelfId);
    const placed = placeMove(sections, entries, {
      id: entryId,
      section,
      index,
    });
    await writePlaced(tx, entries, placed);
    return { positions: placed.map(({ id, position }) => ({ id, position })) };
  });
}

/** A work off the shelf, the catalog untouched; the gap closes. */
export async function removeEntry(db: Db, { entryId, ...key }: EntryKey) {
  await withShelf(db, key, async (tx) => {
    const gone = await tx
      .delete(shelfEntries)
      .where(
        and(eq(shelfEntries.id, entryId), eq(shelfEntries.shelf, key.shelfId)),
      )
      .returning({ id: shelfEntries.id });
    if (gone.length === 0) throw new NotFoundError(NO_ENTRY);
  });
}

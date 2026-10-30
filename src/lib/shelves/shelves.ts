import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { shelves } from "@/db/schema";
import { NotFoundError } from "@/lib/catalog/import";
import { NO_SHELF, type ShelfKey, withShelf } from "./write";

/** A new shelf of the caller's, private by the column's default (Volume 2 adds the control). */
export async function createShelf(
  db: Db,
  {
    userId,
    name,
    description,
  }: { userId: string; name: string; description: string },
): Promise<{ id: string }> {
  const [shelf] = await db
    .insert(shelves)
    .values({ owner: userId, name, description })
    .returning({ id: shelves.id });
  return shelf;
}

/**
 * A shelf's name or description, as it now stands. An unchanged Save writes
 * nothing, since the shelf's trigger stamps `updated_at` on any update and
 * the card would jump to the top of the nook (Rummage R2).
 */
export async function updateShelf(
  db: Db,
  {
    name,
    description,
    ...key
  }: ShelfKey & { name?: string; description?: string },
) {
  return withShelf(db, key, async (tx) => {
    const [held] = await tx
      .select({
        id: shelves.id,
        name: shelves.name,
        description: shelves.description,
      })
      .from(shelves)
      .where(eq(shelves.id, key.shelfId));
    const next = {
      ...held,
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
    };
    if (next.name === held.name && next.description === held.description) {
      return held;
    }
    await tx
      .update(shelves)
      .set({ name: next.name, description: next.description })
      .where(eq(shelves.id, key.shelfId));
    return next;
  });
}

/** The shelf gone; the schema's cascade takes its sections and entries, never a catalog row. */
export async function deleteShelf(db: Db, { shelfId, userId }: ShelfKey) {
  const gone = await db
    .delete(shelves)
    .where(and(eq(shelves.id, shelfId), eq(shelves.owner, userId)))
    .returning({ id: shelves.id });
  if (gone.length === 0) throw new NotFoundError(NO_SHELF);
}

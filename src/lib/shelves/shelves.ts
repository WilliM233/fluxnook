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

/** A shelf's name or description, as it now stands. */
export async function updateShelf(
  db: Db,
  {
    name,
    description,
    ...key
  }: ShelfKey & { name?: string; description?: string },
) {
  return withShelf(db, key, async (tx) => {
    const [shelf] = await tx
      .update(shelves)
      .set({ name, description })
      .where(eq(shelves.id, key.shelfId))
      .returning({
        id: shelves.id,
        name: shelves.name,
        description: shelves.description,
      });
    return shelf;
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

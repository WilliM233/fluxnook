import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { editionContents, items } from "@/db/schema";
import { ConflictError, NotFoundError } from "./import";

/** A pick the contents can't hold: not in the catalog, not a comic, or the edition's own item. */
export class BadContents extends Error {}

/**
 * Replaces an edition's contents with `itemIds`, positions 1..n in the order
 * given (A6). One transaction with the edition locked, so two saves at once
 * end with one list whole and one bad id writes nothing.
 */
export async function replaceEditionContents(
  db: Db,
  { editionId, itemIds }: { editionId: string; itemIds: string[] },
): Promise<{ count: number }> {
  return db.transaction(async (tx) => {
    const [edition] = await tx.execute<{ item: string; type: string }>(sql`
      select e.item, i.type from editions e join items i on i.id = e.item
      where e.id = ${editionId}
      for update of e`);
    if (!edition) throw new NotFoundError();
    if (edition.type !== "comic") {
      throw new ConflictError("Only a comic's edition has contents.");
    }

    const picked = new Set(itemIds);
    const found = itemIds.length
      ? await tx
          .select({ id: items.id })
          .from(items)
          .where(
            and(
              inArray(items.id, itemIds),
              eq(items.type, "comic"),
              ne(items.id, edition.item),
            ),
          )
      : [];
    if (picked.size !== itemIds.length || found.length !== picked.size) {
      throw new BadContents(
        "Every pick must be a comic in the catalog, and not this edition's own item.",
      );
    }

    await tx
      .delete(editionContents)
      .where(eq(editionContents.edition, editionId));
    if (itemIds.length) {
      await tx.insert(editionContents).values(
        itemIds.map((item, i) => ({
          edition: editionId,
          item,
          position: i + 1,
        })),
      );
    }
    return { count: itemIds.length };
  });
}

import { type ManualItem, releasedFrom } from "@/app/api/v1/items/schema";
import type { Db } from "@/db/client";
import {
  itemBooks,
  itemComics,
  itemFilms,
  itemSources,
  items,
  itemTv,
} from "@/db/schema";

/**
 * An item by hand (A6): the row with `created_by` set to whoever added it,
 * its `manual` source keyed by its own uuid, and its type's row, in one
 * transaction.
 */
export async function createManualItem(
  db: Db,
  { userId, input }: { userId: string; input: ManualItem },
): Promise<string> {
  return db.transaction(async (tx) => {
    const [{ id }] = await tx
      .insert(items)
      .values({
        type: input.type,
        title: input.title,
        form:
          input.type === "book" || input.type === "comic" ? input.form : null,
        ...releasedFrom(input),
        summary: input.summary || null,
        createdBy: userId,
      })
      .returning({ id: items.id });
    await tx
      .insert(itemSources)
      .values({ item: id, source: "manual", key: id });

    switch (input.type) {
      case "book":
        await tx.insert(itemBooks).values({ item: id, author: input.author });
        break;
      case "comic":
        await tx.insert(itemComics).values({
          item: id,
          series: input.series ?? null,
          seriesKind: input.seriesKind ?? null,
          number: input.number ?? null,
        });
        break;
      case "film":
        await tx
          .insert(itemFilms)
          .values({ item: id, runtimeMinutes: input.runtimeMinutes ?? null });
        break;
      case "tv":
        await tx.insert(itemTv).values({
          item: id,
          seasons: input.seasons ?? null,
          episodes: input.episodes ?? null,
        });
        break;
    }
    return id;
  });
}

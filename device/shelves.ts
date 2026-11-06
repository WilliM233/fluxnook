import { desc, eq, sql } from "drizzle-orm";
import { createShelfSchema } from "@/app/api/v1/shelves/schema";
import { shelves } from "@/db/schema";
import { DEVICE_USER_ID, type DeviceDb } from "./db";

export type DeviceShelf = { id: string; name: string };

/** A name the shelf rule refuses; the message is the words to show. */
export class ShelfNameRefused extends Error {}

/**
 * Adds a shelf for the device's one person, private as every shelf starts. The
 * name goes through the hosted route's rule, so a name a device holds is one a
 * hosted nook would take when the nook moves (Volume 3).
 */
export async function addShelf(
  db: DeviceDb,
  name: string,
): Promise<DeviceShelf> {
  const parsed = createShelfSchema.safeParse({ name });
  if (!parsed.success) {
    throw new ShelfNameRefused(parsed.error.issues[0].message);
  }
  // Named first, by Postgres, since `crypto.randomUUID` needs a secure context
  // and the shell's origin isn't known to be one (C6).
  const { rows } = await db.execute<{ id: string }>(
    sql`select gen_random_uuid() as id`,
  );
  const { id } = rows[0];
  try {
    const [row] = await db
      .insert(shelves)
      .values({ id, owner: DEVICE_USER_ID, name: parsed.data.name })
      .returning({ id: shelves.id, name: shelves.name });
    return row;
  } catch (error) {
    // PGlite flushes after Postgres commits, so a refused flush (a full phone)
    // rejects with the row in the live database and not on the device. Taking it
    // back makes "didn't save" true, and a second try can't make two. If this
    // flush is refused too, the row is still gone from both.
    await db
      .delete(shelves)
      .where(eq(shelves.id, id))
      .catch(() => {});
    throw error;
  }
}

/** The device person's shelves, newest first, as the nook lists them. */
export function listShelves(db: DeviceDb): Promise<DeviceShelf[]> {
  return db
    .select({ id: shelves.id, name: shelves.name })
    .from(shelves)
    .where(eq(shelves.owner, DEVICE_USER_ID))
    .orderBy(desc(shelves.createdAt), desc(shelves.id));
}

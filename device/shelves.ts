import { desc, eq } from "drizzle-orm";
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
  const [row] = await db
    .insert(shelves)
    .values({ owner: DEVICE_USER_ID, name: parsed.data.name })
    .returning({ id: shelves.id, name: shelves.name });
  return row;
}

/** The device person's shelves, newest first, as the nook lists them. */
export function listShelves(db: DeviceDb): Promise<DeviceShelf[]> {
  return db
    .select({ id: shelves.id, name: shelves.name })
    .from(shelves)
    .where(eq(shelves.owner, DEVICE_USER_ID))
    .orderBy(desc(shelves.createdAt), desc(shelves.id));
}

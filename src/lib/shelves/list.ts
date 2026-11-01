import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";

/** A shelf as the Add to shelf sheet lists it (A3, A10, A11). */
export type ShelfListed = {
  id: string;
  name: string;
  count: number;
  sections: { id: string; name: string }[];
  /** How many of the works asked about the shelf already holds. */
  has: number;
};

/**
 * The caller's shelves in the nook's order (C1), each with its count, its
 * sections in position order, and how many of `items` it holds. One count
 * serves both doors: 0 or 1 for a work's page, k of a run for a series'.
 */
export async function listShelves(
  db: Db,
  { userId, items }: { userId: string; items: string[] },
): Promise<ShelfListed[]> {
  const asked = sql`array[${sql.join(
    items.map((id) => sql`${id}`),
    sql`, `,
  )}]::uuid[]`;
  const rows = await db.execute<ShelfListed>(sql`
    select s.id, s.name,
      (select count(*)::int from shelf_entries e where e.shelf = s.id) as count,
      (select coalesce(json_agg(json_build_object('id', x.id, 'name', x.name)
          order by x.position), '[]'::json)
        from shelf_sections x where x.shelf = s.id) as sections,
      (select count(*)::int from shelf_entries e
        where e.shelf = s.id and e.item = any(${asked})) as has
    from shelves s
    where s.owner = ${userId}
    order by s.updated_at desc, s.created_at desc, s.name`);
  return [...rows];
}

import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";

export type RecentItem = {
  id: string;
  type: "film" | "tv" | "book" | "comic";
  title: string;
  year: number | null;
  cover_path: string | null;
};

/** What `/search` lists before anything is typed (A7): the newest items. */
export async function recentItems(db: Db, limit = 12): Promise<RecentItem[]> {
  const rows = await db.execute<RecentItem>(sql`
    select id, type, title, extract(year from released_on)::int as year, cover_path
    from items order by created_at desc, id limit ${limit}`);
  return [...rows];
}

import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { heldBy, viaBy } from "@/lib/collection/owned";

/** One slot of a card's strip: the cover, or the type that says which empty box to draw. */
export type StripCover = { cover_path: string | null; type: string };

/** A shelf as its nook card prints it (A6). */
export type NookShelf = {
  id: string;
  name: string;
  description: string;
  sourceUrl: string | null;
  works: number;
  done: number;
  skipped: number;
  sections: number;
  /** The shelf's works held or via (1.7 A10, A5); each counts once. */
  owned: number;
  covers: StripCover[];
};

export type Nook = {
  shelves: NookShelf[];
  totals: { shelves: number; works: number; done: number };
};

/**
 * The nook's order, alias `s` for `shelves`: newest change first, then newest
 * made, then by name (C1: one load writes every shelf at the same instant).
 * Shopping groups by it too (1.7 A11), so the two can't drift.
 */
export const NOOK_ORDER = sql`s.updated_at desc, s.created_at desc, s.name`;

/**
 * The caller's shelves in the nook's order, each with its counts and its first
 * five covers in shelf order (A6).
 */
export async function loadNook(db: Db, userId: string): Promise<Nook> {
  const shelves = await db.execute<NookShelf>(sql`
    select s.id, s.name, s.description, s.source_url as "sourceUrl",
      (select count(*)::int from shelf_entries e where e.shelf = s.id) as works,
      (select count(*)::int from shelf_entries e
        where e.shelf = s.id and e.status = 'done') as done,
      (select count(*)::int from shelf_entries e
        where e.shelf = s.id and e.status = 'skipped') as skipped,
      (select count(*)::int from shelf_sections x where x.shelf = s.id) as sections,
      (select count(*)::int from shelf_entries e
        where e.shelf = s.id and (${heldBy(sql`e.item`, userId)}
          or ${viaBy(sql`e.item`, userId)})) as owned,
      (select coalesce(json_agg(json_build_object(
          'cover_path', f.cover_path, 'type', f.type) order by f.position), '[]'::json)
        from (select i.cover_path, i.type, e.position
          from shelf_entries e join items i on i.id = e.item
          where e.shelf = s.id order by e.position limit 5) f) as covers
    from shelves s
    where s.owner = ${userId}
    order by ${NOOK_ORDER}`);
  return {
    shelves,
    totals: {
      shelves: shelves.length,
      works: shelves.reduce((sum, s) => sum + s.works, 0),
      done: shelves.reduce((sum, s) => sum + s.done, 0),
    },
  };
}

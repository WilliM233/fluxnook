import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";

export { releasedLabel } from "./released";

export type ItemPage = {
  item: {
    id: string;
    type: "film" | "tv" | "book" | "comic";
    title: string;
    form: string | null;
    released_on: string | null;
    released_precision: string | null;
    summary: string | null;
    cover_path: string | null;
    // The type's row, whichever it is; null columns where a type has none.
    runtime_minutes: number | null;
    original_title: string | null;
    seasons: number | null;
    episodes: number | null;
    first_aired: string | null;
    last_aired: string | null;
    ended: boolean | null;
    author: string | null;
    series: string | null;
    series_kind: string | null;
    number: number | null;
  };
  sources: { source: string; key: string; url: string | null }[];
  relations: {
    label: string;
    id: string;
    title: string;
    type: string;
    released_on: string | null;
    released_precision: string | null;
  }[];
  franchises: string[];
  shelves: { name: string; position: number }[];
  editions: {
    id: string;
    format: string;
    title: string | null;
    released_on: string | null;
    released_precision: string | null;
    publisher: string | null;
    pages: number | null;
    isbn: string | null;
    openlibrary_url: string | null;
    contents: number;
  }[];
};

/** Everything `/items/<id>` shows, or null for an id the catalog doesn't hold. */
export async function loadItemPage(
  db: Db,
  { id, userId }: { id: string; userId: string },
): Promise<ItemPage | null> {
  const [item] = await db.execute<ItemPage["item"]>(sql`
    select i.id, i.type, i.title, i.form, i.released_on::text as released_on,
      i.released_precision, i.summary, i.cover_path,
      f.runtime_minutes, coalesce(f.original_title, t.original_title) as original_title,
      t.seasons, t.episodes, t.first_aired::text as first_aired,
      t.last_aired::text as last_aired, t.ended,
      b.author, c.series, c.series_kind, c.number
    from items i
    left join item_films f on f.item = i.id
    left join item_tv t on t.item = i.id
    left join item_books b on b.item = i.id
    left join item_comics c on c.item = i.id
    where i.id = ${id}`);
  if (!item) return null;

  const [sources, relations, franchises, shelves, editions] = await Promise.all(
    [
      db.execute<ItemPage["sources"][number]>(sql`
      select source, key, url from item_sources
      where item = ${id} order by source, key`),
      // Both directions, each labelled from this item's side.
      db.execute<ItemPage["relations"][number]>(sql`
      select case r.kind when 'adaptation-of' then 'Adaptation of' else 'Contained in' end as label,
        o.id, o.title, o.type, o.released_on::text as released_on, o.released_precision
      from item_relations r join items o on o.id = r.to_item
      where r.from_item = ${id}
      union all
      select case r.kind when 'adaptation-of' then 'Adapted as' else 'Contains' end,
        o.id, o.title, o.type, o.released_on::text, o.released_precision
      from item_relations r join items o on o.id = r.from_item
      where r.to_item = ${id}
      order by label, released_on nulls last, title`),
      db.execute<{ name: string }>(sql`
      select f.name from item_franchises i join franchises f on f.id = i.franchise
      where i.item = ${id} order by f.name`),
      db.execute<ItemPage["shelves"][number]>(sql`
      select s.name, e.position from shelf_entries e join shelves s on s.id = e.shelf
      where e.item = ${id} and s.owner = ${userId}
      order by s.name, e.position`),
      // The printings the catalog knows (Ch 1.3, A10), oldest first.
      db.execute<ItemPage["editions"][number]>(sql`
      select e.id, e.format, e.title, e.released_on::text as released_on,
        e.released_precision, e.publisher, e.pages,
        (select key from edition_sources
          where edition = e.id and source = 'isbn' order by key limit 1) as isbn,
        (select url from edition_sources
          where edition = e.id and source = 'openlibrary' limit 1) as openlibrary_url,
        (select count(*)::int from edition_contents where edition = e.id) as contents
      from editions e
      where e.item = ${id}
      order by e.released_on nulls last, e.created_at, e.id`),
    ],
  );

  return {
    item,
    sources: [...sources],
    relations: [...relations],
    franchises: franchises.map((f) => f.name),
    shelves: [...shelves],
    editions: [...editions],
  };
}

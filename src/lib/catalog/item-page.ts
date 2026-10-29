import { type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { ContentRow } from "./contents-line";

export { releasedLabel } from "./released";

/** An edition whose contents hold the page's comic, with all it holds (A9, A10). */
export type CollectedIn = {
  editionId: string;
  itemId: string;
  title: string;
  format: string;
  released_on: string | null;
  released_precision: string | null;
  contents: ContentRow[];
};

/** One comic the contents picker lists (A11). */
export type PickerComic = {
  id: string;
  title: string;
  number: number | null;
  series: string | null;
  released_on: string | null;
  released_precision: string | null;
};

/** An edition's contents as `ContentRow`s in position order, one json array. */
export function contentsOf(edition: SQL): SQL {
  return sql`(select coalesce(json_agg(json_build_object(
      'itemId', ci.id, 'title', ci.title, 'number', cc.number,
      'series', cc.series, 'seriesId', cc.series_id, 'position', x.position)
      order by x.position), '[]'::json)
    from edition_contents x join items ci on ci.id = x.item
    left join item_comics cc on cc.item = ci.id
    where x.edition = ${edition})`;
}

/** The editions `where` picks, each as a `CollectedIn` row. */
export function collectedInRows(where: SQL, order: SQL): SQL {
  return sql`
    select e.id as "editionId", i.id as "itemId", i.title, e.format,
      e.released_on::text as released_on, e.released_precision,
      ${contentsOf(sql`e.id`)} as contents
    from editions e join items i on i.id = e.item
    where ${where}
    order by ${order}`;
}

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
    series_id: string | null;
    series_kind: string | null;
    number: number | null;
  };
  /** The run a comic is attached to, with its neighbours by number (A10). */
  series: {
    id: string;
    name: string;
    volume: number | null;
    count: number;
    previous: { id: string; number: number } | null;
    next: { id: string; number: number } | null;
  } | null;
  collectedIn: CollectedIn[];
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
    comicvine_url: string | null;
    contents: number;
    contentsRows: ContentRow[];
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
      b.author, c.series, c.series_id, c.series_kind, c.number
    from items i
    left join item_films f on f.item = i.id
    left join item_tv t on t.item = i.id
    left join item_books b on b.item = i.id
    left join item_comics c on c.item = i.id
    where i.id = ${id}`);
  if (!item) return null;

  const [
    sources,
    relations,
    franchises,
    shelves,
    editions,
    series,
    collectedIn,
  ] = await Promise.all([
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
        (select url from edition_sources
          where edition = e.id and source = 'comicvine' limit 1) as comicvine_url,
        (select count(*)::int from edition_contents where edition = e.id) as contents,
        ${contentsOf(sql`e.id`)} as "contentsRows"
      from editions e
      where e.item = ${id}
      order by e.released_on nulls last, e.created_at, e.id`),
    // The neighbours go by number; a comic with none has neither.
    item.series_id
      ? db.execute<NonNullable<ItemPage["series"]>>(sql`
      select s.id, s.name, s.volume,
        (select count(*)::int from item_comics where series_id = s.id) as count,
        (select json_build_object('id', c.item, 'number', c.number)
          from item_comics c where c.series_id = s.id and c.number < ${item.number}
          order by c.number desc limit 1) as previous,
        (select json_build_object('id', c.item, 'number', c.number)
          from item_comics c where c.series_id = s.id and c.number > ${item.number}
          order by c.number limit 1) as next
      from series s where s.id = ${item.series_id}`)
      : Promise.resolve([]),
    db.execute<CollectedIn>(
      collectedInRows(
        sql`e.id in (select edition from edition_contents where item = ${id})`,
        sql`i.title, e.id`,
      ),
    ),
  ]);

  return {
    item,
    series: series[0] ?? null,
    collectedIn: [...collectedIn],
    sources: [...sources],
    relations: [...relations],
    franchises: franchises.map((f) => f.name),
    shelves: [...shelves],
    editions: [...editions],
  };
}

/**
 * Every comic in the catalog but `except`, as the picker lists them: the
 * series groups by their text, each in number order, then everything with
 * no series. Its own query, so only a collected comic's page runs it.
 */
export async function loadPickerComics(
  db: Db,
  { except }: { except: string },
): Promise<PickerComic[]> {
  const rows = await db.execute<PickerComic>(sql`
    select i.id, i.title, c.number, c.series,
      i.released_on::text as released_on, i.released_precision
    from items i left join item_comics c on c.item = i.id
    where i.type = 'comic' and i.id <> ${except}
    order by c.series nulls last, c.number nulls last,
      i.released_on nulls last, i.title, i.id`);
  return [...rows];
}

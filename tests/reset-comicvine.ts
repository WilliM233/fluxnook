// Undo the Browse's three imports on the fixture rows (Ch 1.4.2), for the db
// file and the e2e spec that attach onto them. Scoped to the three real
// volumes and to rows the loader made, since other db files import rekeyed
// copies beside them: the created issues go, the attached ones lose their
// series and Comic Vine sources and what the attach filled (summary, cover,
// an edition's date and publisher; the fixture holds none of these), then
// the series.
//
// The two updates read the attach through `series_id`, so they run before the
// statement that nulls it. Over every loaded comic they took row locks on rows
// another worker was loading or adding to a shelf, for no reason (A15 a).

/** The volumes the Browse imports: the Mirage run, Tales of the TMNT, the Ultimate Collection. */
export const BROWSE_VOLUMES = ["volume/20281", "volume/18785", "volume/50804"];

const mine = `select series from series_sources
  where source = 'comicvine' and key in (${BROWSE_VOLUMES.map((k) => `'${k}'`).join(", ")})`;
const attached = `select item from item_comics where series_id in (${mine})`;
const loaded = `select item from item_sources where source = 'manual'`;
const loadedEditions = `select edition from edition_sources where source = 'manual'`;

/** One statement each, in order; plain SQL for postgres.js and psql alike. */
export const RESET_COMICVINE = [
  // A copy restricts its printing, so one person's copy of an issue this deletes
  // would stop the whole reset (1.7.1 Rummage R3).
  `delete from copies where edition in (
    select id from editions where item in (${attached}) and item not in (${loaded}))`,
  // A tick on an attached issue: A3's printing carries no source (a loaded one
  // carries `manual`, an imported one its source), so "no source" is A3's
  // alone. It reads the attach, so it runs before `series_id` is nulled (1.7.2).
  `delete from copies where edition in (
    select id from editions where item in (${attached})
      and id not in (select edition from edition_sources))`,
  `delete from editions where item in (${attached})
    and id not in (select edition from edition_sources)`,
  `delete from items where id in (${attached})
    and id not in (${loaded})`,
  `update editions set released_on = null, released_precision = null, publisher = null
    where id in (${loadedEditions}) and item in (${attached})
    and (released_on is not null or publisher is not null)`,
  `update items set summary = null, cover_path = null
    where type = 'comic' and id in (${loaded}) and id in (${attached})
    and (summary is not null or cover_path is not null)`,
  `update item_comics set series_id = null where series_id in (${mine})`,
  // An edition an import hung on a loaded comic (Rummage R5 saw 62 on the
  // fixture's issues before B1's fix); the loader's own carry a manual source.
  `delete from editions where item in (${loaded})
    and id not in (${loadedEditions})
    and id in (select edition from edition_sources where source = 'comicvine')`,
  `delete from item_sources where source = 'comicvine' and item in (${loaded})`,
  `delete from edition_sources where source = 'comicvine' and edition in (${loadedEditions})`,
  `delete from series where id in (${mine})`,
];

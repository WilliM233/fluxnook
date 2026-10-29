// Undo the Browse's three imports on the fixture rows (Ch 1.4.2), for the db
// file and the e2e spec that attach onto them. Scoped to the three real
// volumes and to rows the loader made, since other db files import rekeyed
// copies beside them: the created issues go, the attached ones lose their
// series and Comic Vine sources and what the attach filled (summary, cover,
// an edition's date and publisher; the fixture holds none of these), then
// the series.

/** The volumes the Browse imports: the Mirage run, Tales of the TMNT, the Ultimate Collection. */
export const BROWSE_VOLUMES = ["volume/20281", "volume/18785", "volume/50804"];

const mine = `select series from series_sources
  where source = 'comicvine' and key in (${BROWSE_VOLUMES.map((k) => `'${k}'`).join(", ")})`;
const loaded = `select item from item_sources where source = 'manual'`;
const loadedEditions = `select edition from edition_sources where source = 'manual'`;

/** One statement each, in order; plain SQL for postgres.js and psql alike. */
export const RESET_COMICVINE = [
  `delete from items where id in (
    select item from item_comics where series_id in (${mine}))
    and id not in (${loaded})`,
  `update item_comics set series_id = null where series_id in (${mine})`,
  // An edition an import hung on a loaded comic (Rummage R5 saw 62 on the
  // fixture's issues before B1's fix); the loader's own carry a manual source.
  `delete from editions where item in (${loaded})
    and id not in (${loadedEditions})
    and id in (select edition from edition_sources where source = 'comicvine')`,
  `delete from item_sources where source = 'comicvine' and item in (${loaded})`,
  `delete from edition_sources where source = 'comicvine' and edition in (${loadedEditions})`,
  `update editions set released_on = null, released_precision = null, publisher = null
    where id in (${loadedEditions})
    and (released_on is not null or publisher is not null)`,
  `update items set summary = null, cover_path = null
    where type = 'comic' and id in (${loaded})
    and (summary is not null or cover_path is not null)`,
  `delete from series where id in (${mine})`,
];

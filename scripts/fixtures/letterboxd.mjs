/**
 * Turns a Letterboxd list export into fixture items and one shelf.
 *
 * Each film row becomes a `film` item with id `letterboxd:<boxd key>`, the
 * key from its boxd.it URL: Letterboxd's own identity for the film, the same
 * in every list. The list becomes a shelf whose entries keep the export's
 * order. Anything the export didn't have last time stops the build, so a
 * re-export that changed shape can't produce a quiet variant.
 */
import { isDeepStrictEqual } from "node:util";
import { parseCsv } from "./csv.mjs";

const LIST_HEADER = ["Date", "Name", "Tags", "URL", "Description"];
const FILM_HEADER = ["Position", "Name", "Year", "URL", "Description"];
const BOXD = /^https:\/\/boxd\.it\/([A-Za-z0-9]+)$/;

export function letterboxdList(text, rawPath) {
  const fail = (index, message) => {
    throw new Error(`${rawPath}: record ${index}: ${message}`);
  };
  const expectRecord = (index, expected) => {
    if (!isDeepStrictEqual(records[index], expected)) {
      fail(
        index,
        `expected ${JSON.stringify(expected)}, found ${JSON.stringify(records[index])}`,
      );
    }
  };
  const integer = (index, name, value) => {
    const number = Number(value);
    if (value === "" || !Number.isInteger(number)) {
      fail(index, `${name} ${JSON.stringify(value)} is not a whole number`);
    }
    return number;
  };

  const records = parseCsv(text);
  if (!records[0]?.[0]?.startsWith("Letterboxd list export")) {
    fail(0, "not a Letterboxd list export");
  }
  expectRecord(1, LIST_HEADER);
  expectRecord(3, []);
  expectRecord(4, FILM_HEADER);
  const [date, name, tags, url, description] = records[2] ?? [];
  // A3 has no place for tags; refusing them beats dropping them.
  if (tags !== "") fail(2, `Tags ${JSON.stringify(tags)} has nowhere to go`);

  const rows = records.slice(5);
  while (rows.length > 0 && rows.at(-1).length === 0) rows.pop();

  const items = new Map();
  const entries = rows.map((row, offset) => {
    const index = offset + 5;
    if (row.length !== FILM_HEADER.length) {
      fail(index, `expected ${FILM_HEADER.length} fields, found ${row.length}`);
    }
    const [positionText, title, yearText, filmUrl, note] = row;
    const key = BOXD.exec(filmUrl)?.[1];
    if (!key) fail(index, `URL ${JSON.stringify(filmUrl)} is not a boxd.it link`);
    const id = `letterboxd:${key}`;
    if (!items.has(id)) {
      items.set(id, {
        id,
        type: "film",
        title,
        year: integer(index, "Year", yearText),
        providers: { letterboxd: filmUrl },
        source_note: note,
      });
    }
    return { item: id, position: integer(index, "Position", positionText) };
  });

  return {
    items: [...items.values()],
    shelves: [{ name, date, url, description, entries }],
  };
}

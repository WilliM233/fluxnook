// Small inline raw files for the builder tests, one helper per export
// grammar. Not a test file: vitest.config.ts collects *.test.ts only.

export const LIST_ROW = "2024-04-01,X,,https://boxd.it/upKRw,d";

// A Letterboxd list export around the given film rows. A film at index i is
// record i + 5.
export function exportOf(films: string[], listRow = LIST_ROW): string {
  return [
    "Letterboxd list export v7",
    "Date,Name,Tags,URL,Description",
    listRow,
    "",
    "Position,Name,Year,URL,Description",
    ...films,
    "",
  ].join("\n");
}

// The Mirage tab's column header and title row around the given rows, so a
// row at index i is record i + 2. Write header and data rows as the sheet
// does: `Volume 1,Main Series,,,,` and
// `TRUE,#1,Title,"May, 1984",TRUE,Ultimate Collection 1`.
export function sheetOf(rows: string[]): string {
  return [
    "Read,Issue,Name,Publish Date,Owned,Format",
    "Mirage Run,,,,,",
    ...rows,
  ].join("\n");
}

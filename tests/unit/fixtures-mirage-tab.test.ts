import { describe, expect, it } from "vitest";
import { mirageTab } from "../../scripts/fixtures/mirage-tab.mjs";
import { sheetOf } from "./fixtures/helpers";

// The Mirage tab builder on small inline sheets. A row at index i is record
// i + 2, so the first header passed is record 2 and the row after it 3.

const RAW = "raw/mirage.csv";
const build = (rows: string[]) => mirageTab(sheetOf(rows), RAW);
const V1_MAIN = "Volume 1,Main Series,,,,";

describe("mirageTab, the rows", () => {
  it("reads a Main Series row into one issue, one section and nothing else", () => {
    const tab = build([
      V1_MAIN,
      'FALSE,#7,All is Revealed,"March, 1986",FALSE,',
    ]);
    expect(tab.items).toEqual([
      {
        id: "manual:tmnt-mirage-v1-7",
        type: "comic",
        form: "issue",
        series: "Teenage Mutant Ninja Turtles (Mirage) Vol. 1",
        series_kind: "ongoing",
        number: 7,
        title: "All is Revealed",
        year: 1986,
        month: 3,
        source_date: "March, 1986",
        source_note: "",
        providers: {},
      },
    ]);
    for (const key of [
      "relations",
      "editions",
      "copies",
      "occurrences",
      "gaps",
    ] as const) {
      expect(tab[key], key).toEqual([]);
    }
    expect(tab.shelves).toHaveLength(1);
    expect(tab.shelves[0].sections).toEqual([
      {
        name: "Volume 1 · Main Series",
        entries: [{ item: "manual:tmnt-mirage-v1-7", position: 1 }],
      },
    ]);
  });

  it("names the six numbered runs from the series table", () => {
    const row = 'FALSE,#1,A title,"May, 1984",FALSE,';
    const tab = build([
      V1_MAIN,
      row,
      ",Tales of the Teenage Mutant Ninja Turtles,,,,",
      row,
      "Volume 2,Main Series,,,Volume 2,",
      row,
      "Volume 3,Image Series,,,Volume 3,",
      row,
      "Volume 4,Main Series,,,Volume 4,",
      row,
      ",Tales of the Teenage Mutant Ninja Turtles 2,,,,",
      row,
    ]);
    expect(
      tab.items.map(({ id, series }: { id: string; series: string }) => [
        id,
        series,
      ]),
    ).toEqual([
      [
        "manual:tmnt-mirage-v1-1",
        "Teenage Mutant Ninja Turtles (Mirage) Vol. 1",
      ],
      [
        "manual:tmnt-mirage-tales-v1-1",
        "Tales of the Teenage Mutant Ninja Turtles",
      ],
      [
        "manual:tmnt-mirage-v2-1",
        "Teenage Mutant Ninja Turtles (Mirage) Vol. 2",
      ],
      [
        "manual:tmnt-mirage-v3-1",
        "Teenage Mutant Ninja Turtles (Image) Vol. 3",
      ],
      [
        "manual:tmnt-mirage-v4-1",
        "Teenage Mutant Ninja Turtles (Mirage) Vol. 4",
      ],
      [
        "manual:tmnt-mirage-tales-v2-1",
        "Tales of the Teenage Mutant Ninja Turtles Vol. 2",
      ],
    ]);
    // Volume 1's header doesn't repeat the volume in Owned; a later one may
    // not either.
    expect(
      build([V1_MAIN, row, "Volume 2,Main Series,,,,", row]).items[1].id,
    ).toBe("manual:tmnt-mirage-v2-1");
  });

  it("reads a Micro Series row as a one-shot titled <Issue>: <Name>", () => {
    const [raphael] = build([
      "Volume 1,Micro Series,,,,",
      'TRUE,Raphael,"Me, Myself and I","April, 1985",TRUE,Ultimate Collection 1',
    ]).items;
    expect(raphael).toMatchObject({
      id: "manual:tmnt-mirage-micro-raphael-me-myself-and-i",
      form: "one-shot",
      series_kind: "micro-series",
      series: null,
      number: null,
      title: "Raphael: Me, Myself and I",
    });
  });

  it("reads a Mini Series row's series from its Name and its number from Issue", () => {
    const mini = "Volume 3,Mini Series,,,,";
    const [bodycount] = build([
      mini,
      'FALSE,#3,Bodycount #3,"May, 1996",FALSE,',
    ]).items;
    expect(bodycount).toMatchObject({
      id: "manual:tmnt-mirage-bodycount-3",
      form: "issue",
      series: "Bodycount",
      series_kind: "mini-series",
      number: 3,
      title: "Bodycount #3",
    });
    const [third] = build([
      mini,
      'FALSE,#1,"Michelangelo: The Third Kind, part 1","May, 2006",FALSE,',
    ]).items;
    expect(third).toMatchObject({
      id: "manual:tmnt-mirage-michelangelo-the-third-kind-1",
      series: "Michelangelo: The Third Kind",
      number: 1,
    });
    expect(() =>
      build([mini, 'FALSE,#2,Bodycount #3,"May, 1996",FALSE,']),
    ).toThrow(`${RAW}: record 3:`);
  });

  it("reads a Short Stories row as a backup titled by its Issue cell", () => {
    const [backup] = build([
      "Volume 1,Short Stories,,,,",
      'FALSE,You Had to Be There,Teenage Mutant Ninja Turtles #7,"March, 1986",FALSE,',
    ]).items;
    expect(backup).toMatchObject({
      id: "manual:tmnt-mirage-backup-you-had-to-be-there",
      form: "backup",
      title: "You Had to Be There",
      series: null,
      series_kind: null,
      number: null,
      year: 1986,
    });
  });

  it("reads Minor Titles and tie-ins slid left, numbered when the title ends #<n>", () => {
    const tab = build([
      "Volume 1,Minor Titles,,,,",
      'FALSE,Gobbledygook (Vol. 2) #1,"December, 1986",,FALSE,',
      'FALSE,Shell Shock,"December, 1989",,FALSE,',
      'FALSE,"North by Downeast, part 1 of 2","May, 1991",,FALSE,',
      ",Movie tie-ins,,,,",
      'FALSE,Bungle in the Jungle,"March, 2007",,FALSE,',
      'FALSE,Movie Prequel #2,"February, 2007",,FALSE,',
    ]);
    expect(tab.items[0]).toEqual({
      id: "manual:tmnt-mirage-gobbledygook-vol-2-1",
      type: "comic",
      form: "issue",
      series: "Gobbledygook (Vol. 2)",
      series_kind: "minor",
      number: 1,
      title: "Gobbledygook (Vol. 2) #1",
      year: 1986,
      month: 12,
      source_date: "December, 1986",
      source_note: "",
      providers: {},
    });
    expect(tab.items[1]).toMatchObject({
      id: "manual:tmnt-mirage-minor-shell-shock",
      form: "one-shot",
      series: null,
      number: null,
      series_kind: "minor",
    });
    // The `, part <n>` rule is Mini Series only.
    expect(tab.items[2]).toMatchObject({
      id: "manual:tmnt-mirage-minor-north-by-downeast-part-1-of-2",
      form: "one-shot",
    });
    expect(tab.items[3]).toMatchObject({
      id: "manual:tmnt-mirage-tie-in-bungle-in-the-jungle",
      form: "one-shot",
      series_kind: "tie-in",
    });
    expect(tab.items[4]).toMatchObject({
      id: "manual:tmnt-mirage-movie-prequel-2",
      form: "issue",
      series: "Movie Prequel",
      number: 2,
      series_kind: "tie-in",
    });
  });

  it("reads Crossover rows undated, keeps the stray Name, and makes two items of the repeat", () => {
    const tab = build([
      "Volume 3,Supplemental/Crossover,,,,",
      "FALSE,Savage Dragon #2,,,FALSE,",
      "FALSE,Savage Dragon #2,#22,,FALSE,",
      "FALSE,Gen 13(Vol.2) #13B,,,FALSE,",
    ]);
    expect(tab.items[0]).toEqual({
      id: "manual:tmnt-mirage-savage-dragon-2",
      type: "comic",
      form: "issue",
      series: "Savage Dragon",
      series_kind: "crossover",
      number: 2,
      title: "Savage Dragon #2",
      year: null,
      source_date: "",
      source_note: "",
      providers: {},
    });
    expect(tab.items[1]).toMatchObject({
      id: "manual:tmnt-mirage-savage-dragon-2-r4",
      source_note: "#22",
      number: 2,
    });
    expect(tab.items[2]).toMatchObject({
      id: "manual:tmnt-mirage-crossover-gen-13-vol-2-13b",
      form: "one-shot",
      number: null,
    });
    expect(tab.gaps).toEqual(
      [
        "manual:tmnt-mirage-savage-dragon-2",
        "manual:tmnt-mirage-savage-dragon-2-r4",
        "manual:tmnt-mirage-crossover-gen-13-vol-2-13b",
      ].map((item) => ({ item, reason: "no readable year" })),
    );
  });

  it("reads the year and month from every date shape, keeping the cell", () => {
    const cells = [
      ['"May, 1984"', 1984, 5],
      ["January 2004", 2004, 1],
      ["1985", 1985, undefined],
      ['"September 22, 2009"', 2009, 9],
      ['"October, 2010 (online) 1"', 2010, 10],
      ["Summer 1993", 1993, undefined],
    ] as const;
    const tab = build([
      V1_MAIN,
      ...cells.map(([cell], i) => `FALSE,#${i + 1},T,${cell},FALSE,`),
    ]);
    cells.forEach(([cell, year, month], i) => {
      const item = tab.items[i];
      expect(item.year, cell).toBe(year);
      expect(item.source_date, cell).toBe(cell.replaceAll('"', ""));
      if (month === undefined) expect(item, cell).not.toHaveProperty("month");
      else expect(item.month, cell).toBe(month);
    });
    expect(tab.gaps).toEqual([]);
  });

  it("stops on a repeated id outside Crossover, naming both records", () => {
    expect(() =>
      build([
        V1_MAIN,
        'FALSE,#7,A,"March, 1986",FALSE,',
        'FALSE,#7,B,"March, 1986",FALSE,',
      ]),
    ).toThrow(/record 4: .*manual:tmnt-mirage-v1-7.*record 3/);
  });

  it("stops on what it can't read, naming the file and the record", () => {
    const row = 'FALSE,#1,A,"May, 1984",FALSE,';
    const stops: [string, string[], number][] = [
      ["not the header", ["Read,Issue,Name,Date,Owned,Format"], 0],
      ["not the title row", ["Archie Run,,,,,"], 1],
      ["an unknown header", ["Volume 1,Archie Series,,,,", row], 2],
      ["a header before any volume", [",Main Series,,,,", row], 2],
      ["a row before any header", [row], 2],
      ["Read of yes", [V1_MAIN, 'yes,#1,A,"May, 1984",FALSE,'], 3],
      ["Owned of yes", [V1_MAIN, 'FALSE,#1,A,"May, 1984",yes,'], 3],
      ["#x under Main Series", [V1_MAIN, 'FALSE,#x,A,"May, 1984",FALSE,'], 3],
      [
        "a Mini Name with no number",
        ["Volume 3,Mini Series,,,,", 'FALSE,#1,Bodycount,"May, 1996",FALSE,'],
        3,
      ],
    ];
    for (const [what, rows, record] of stops) {
      // The first two replace the header or title row, so they get no sheetOf.
      const text =
        record === 0
          ? [...rows, "Mirage Run,,,,,"].join("\n")
          : record === 1
            ? ["Read,Issue,Name,Publish Date,Owned,Format", ...rows].join("\n")
            : sheetOf(rows);
      expect(() => mirageTab(text, RAW), what).toThrow(
        `${RAW}: record ${record}:`,
      );
    }
  });

  it("makes one shelf with a section per header, positions restarting", () => {
    const row = (n: number) => `FALSE,#${n},A,"May, 1984",FALSE,`;
    const minor = (t: string) => `FALSE,${t},"May, 1984",,FALSE,`;
    const tab = build([
      V1_MAIN,
      row(1),
      row(2),
      ",,,,,",
      ",Minor Titles,,,,",
      minor("Shell Shock"),
      minor("Grunts #1"),
      ",,,,,",
      "Volume 2,Main Series,,,Volume 2,",
      row(1),
      row(2),
    ]);
    expect(tab.shelves).toHaveLength(1);
    const [shelf] = tab.shelves;
    expect(shelf).toMatchObject({
      name: "TMNT, the Mirage run",
      date: "2026-10-23",
    });
    expect(shelf).not.toHaveProperty("entries");
    expect(shelf).not.toHaveProperty("url");
    // One sentence: a single full stop, at the end.
    expect(shelf.description.split(".")).toHaveLength(2);
    expect(shelf.description.endsWith(".")).toBe(true);
    expect(shelf.sections).toEqual([
      {
        name: "Volume 1 · Main Series",
        entries: [
          { item: "manual:tmnt-mirage-v1-1", position: 1 },
          { item: "manual:tmnt-mirage-v1-2", position: 2 },
        ],
      },
      {
        name: "Volume 1 · Minor Titles",
        entries: [
          { item: "manual:tmnt-mirage-minor-shell-shock", position: 1 },
          { item: "manual:tmnt-mirage-grunts-1", position: 2 },
        ],
      },
      {
        name: "Volume 2 · Main Series",
        entries: [
          { item: "manual:tmnt-mirage-v2-1", position: 1 },
          { item: "manual:tmnt-mirage-v2-2", position: 2 },
        ],
      },
    ]);
  });

  it("puts items in sheet order", () => {
    const tab = build([
      "Volume 1,Short Stories,,,,",
      'FALSE,Zebra,Host,"May, 1984",FALSE,',
      "Volume 2,Main Series,,,,",
      'FALSE,#2,B,"May, 1984",FALSE,',
      'FALSE,#1,A,"May, 1984",FALSE,',
    ]);
    expect(
      tab.items
        .filter(({ form }: { form: string }) => form !== "anthology")
        .map(({ id }: { id: string }) => id),
    ).toEqual([
      "manual:tmnt-mirage-backup-zebra",
      "manual:tmnt-mirage-v2-2",
      "manual:tmnt-mirage-v2-1",
    ]);
  });
});

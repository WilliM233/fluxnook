import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixture } from "@/fixtures/shape";
import { parseCsv } from "../../scripts/fixtures/csv.mjs";
import { letterboxdList } from "../../scripts/fixtures/letterboxd.mjs";

// Ch 0.4 Rummage. Each test names its line in the plan's section 4b.

const LIST_HEADER = "Date,Name,Tags,URL,Description";
const LIST_ROW = "2024-04-01,X,,https://boxd.it/upKRw,d";
const FILM_HEADER = "Position,Name,Year,URL,Description";

function exportOf(films: string[], listRow = LIST_ROW): string {
  return [
    "Letterboxd list export v7",
    LIST_HEADER,
    listRow,
    "",
    FILM_HEADER,
    ...films,
    "",
  ].join("\n");
}

function sample() {
  return {
    items: [
      {
        id: "letterboxd:20ZQ",
        type: "film",
        title: "Carrie",
        year: 1976,
        providers: { letterboxd: "https://boxd.it/20ZQ" },
        source_note: "Novel: Carrie (1974)",
      },
      {
        id: "letterboxd:b64",
        type: "film",
        title: "Cujo",
        year: 1983,
        providers: { letterboxd: "https://boxd.it/b64" },
        source_note: "Novel: Cujo (1981)",
      },
    ],
    shelves: [
      {
        name: "A shelf",
        date: "2024-04-01",
        url: "https://boxd.it/upKRw",
        description: "Two films.",
        entries: [
          { item: "letterboxd:20ZQ", position: 1 },
          { item: "letterboxd:b64", position: 2 },
        ],
      },
    ],
  };
}

describe("letterboxdList", () => {
  it("R1: a film listed twice with a different title, year or note stops the build", () => {
    const first = "1,Carrie,1976,https://boxd.it/20ZQ,Novel: Carrie (1974)";
    for (const second of [
      "2,Carrie II,1976,https://boxd.it/20ZQ,Novel: Carrie (1974)",
      "2,Carrie,1977,https://boxd.it/20ZQ,Novel: Carrie (1974)",
      "2,Carrie,1976,https://boxd.it/20ZQ,Short Story: something else",
    ]) {
      expect(
        () => letterboxdList(exportOf([first, second]), "probe"),
        second,
      ).toThrow(/probe: record 6/);
    }
  });

  it("R2: a repeated film's Year is checked like the first one's", () => {
    const films = [
      "1,Carrie,1976,https://boxd.it/20ZQ,n",
      "2,Carrie,abc,https://boxd.it/20ZQ,n",
    ];
    expect(() => letterboxdList(exportOf(films), "probe")).toThrow(/Year/);
  });

  it("R3: a Year or Position that is not plain digits stops the build", () => {
    for (const year of [" ", "0x7B8", "1.976e3", " 1976 ", "1976.0", "+1976"]) {
      const row = `1,Carrie,${year},https://boxd.it/20ZQ,n`;
      expect(() => letterboxdList(exportOf([row]), "probe"), year).toThrow(
        /Year/,
      );
    }
    const row = "1.0,Carrie,1976,https://boxd.it/20ZQ,n";
    expect(() => letterboxdList(exportOf([row]), "probe")).toThrow(/Position/);
  });

  it("R4: a list record with more or fewer than five fields stops the build", () => {
    const film = "1,Carrie,1976,https://boxd.it/20ZQ,n";
    for (const listRow of [
      `${LIST_ROW},extra`,
      "2024-04-01,X,,https://boxd.it/upKRw",
    ]) {
      expect(
        () => letterboxdList(exportOf([film], listRow), "probe"),
        listRow,
      ).toThrow(/probe: record 2/);
    }
  });

  it("R5: an export with no film rows stops the build", () => {
    expect(() => letterboxdList(exportOf([]), "probe")).toThrow(/probe/);
  });
});

describe("fixture shape", () => {
  it("R6: entry positions strictly increase within a shelf", () => {
    const repeated = sample();
    repeated.shelves[0].entries[1].position = 1;
    expect(fixture.safeParse(repeated).success).toBe(false);
    const backwards = sample();
    backwards.shelves[0].entries[0].position = 3;
    expect(fixture.safeParse(backwards).success).toBe(false);
  });

  it("R7: a provider or shelf URL that isn't https is rejected", () => {
    for (const bad of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "http://boxd.it/20ZQ",
    ]) {
      const provider = sample();
      provider.items[0].providers.letterboxd = bad;
      expect(fixture.safeParse(provider).success, `provider ${bad}`).toBe(
        false,
      );
      const shelf = sample();
      shelf.shelves[0].url = bad;
      expect(fixture.safeParse(shelf).success, `shelf ${bad}`).toBe(false);
    }
  });

  it("R8: a letterboxd item's id and its boxd.it URL name the same film", () => {
    const elsewhere = sample();
    elsewhere.items[0].providers.letterboxd = "https://example.com/20ZQ";
    expect(fixture.safeParse(elsewhere).success).toBe(false);
    const swapped = sample();
    swapped.items[0].providers.letterboxd = "https://boxd.it/b64";
    expect(fixture.safeParse(swapped).success).toBe(false);
  });
});

describe("parseCsv", () => {
  it("R9: a quote inside an unquoted field throws", () => {
    expect(() => parseCsv('ab"c,d\n')).toThrow();
  });
});

describe("nightly.yml", () => {
  it("R10: the --with-deps install step carries its own timeout-minutes", () => {
    const yml = readFileSync(
      new URL("../../.github/workflows/nightly.yml", import.meta.url),
      "utf8",
    );
    expect(yml).toMatch(
      /^ {6}- run: npx playwright install --with-deps .*\n {8}timeout-minutes: \d+$/m,
    );
  });
});

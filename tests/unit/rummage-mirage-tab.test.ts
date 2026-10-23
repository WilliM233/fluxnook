import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { fixture } from "@/fixtures/shape";
import { buildFixtures } from "../../scripts/fixtures/build.mjs";
import { mirageTab } from "../../scripts/fixtures/mirage-tab.mjs";
import { sheetOf } from "./fixtures/helpers";

// Ch 0.6 Rummage. Each test names its line in the plan's section 4b. A row
// at index i is record i + 2.

const RAW = "raw/mirage.csv";
const build = (rows: string[]) => mirageTab(sheetOf(rows), RAW);
const V1_MAIN = "Volume 1,Main Series,,,,";
const SHORTS = "Volume 1,Short Stories,,,,";
const ROW = 'FALSE,#1,A,"May, 1984",FALSE,';

type Comic = { id: string; form: string; year: number | null };

describe("mirageTab", () => {
  it("R1: a header named like an Object property stops the build, naming the record", () => {
    for (const name of ["toString", "constructor", "__proto__"]) {
      expect(() => build([`Volume 1,${name},,,,`]), name).toThrow(
        `${RAW}: record 2: `,
      );
      expect(() => build([`Volume 1,${name},,,,`, ROW]), name).toThrow(
        `${RAW}: record 2: `,
      );
    }
  });

  it("R2: a Crossover row that repeats a row of another section stops the build", () => {
    expect(() =>
      build([
        "Volume 1,Minor Titles,,,,",
        'FALSE,Savage Dragon #2,"May, 1995",,FALSE,',
        "Volume 3,Supplemental/Crossover,,,,",
        "FALSE,Savage Dragon #2,,,FALSE,",
      ]),
    ).toThrow(/record 5: .*manual:tmnt-mirage-savage-dragon-2.*record 3/);
  });

  it("R3: a host whose only backup is undated is a gap, like every undated item", () => {
    const tab = build([SHORTS, "FALSE,A,Host X,,FALSE,"]);
    const undated = (tab.items as Comic[])
      .filter(({ year, form }) => year === null && form !== "collected")
      .map(({ id }) => id)
      .sort();
    expect(undated).toContain("manual:tmnt-mirage-host-host-x");
    expect(tab.gaps.map(({ item }: { item: string }) => item).sort()).toEqual(
      undated,
    );
  });

  it("R4: an undated backup beside a dated one is a gap, not a stop, and the host keeps the year", () => {
    const dated = 'FALSE,A,Host X,"May, 1989",FALSE,';
    const undated = "FALSE,B,Host X,,FALSE,";
    for (const rows of [
      [dated, undated],
      [undated, dated],
    ]) {
      const tab = build([SHORTS, ...rows]);
      const host = (tab.items as Comic[]).find(
        ({ form }) => form === "anthology",
      );
      expect(host).toMatchObject({
        year: 1989,
        month: 5,
        source_date: "May, 1989",
      });
      expect(tab.gaps).toEqual([
        { item: "manual:tmnt-mirage-backup-b", reason: "no readable year" },
      ]);
    }
  });

  it("R5: one section header twice in a volume stops the build at the second", () => {
    expect(() =>
      build([V1_MAIN, ROW, V1_MAIN, 'FALSE,#2,B,"May, 1984",FALSE,']),
    ).toThrow(`${RAW}: record 4: `);
  });

  it("R8: a host whose anthology id is a row's id stops the build", () => {
    expect(() =>
      build([
        "Volume 1,Minor Titles,,,,",
        'FALSE,Host Comics #1,"May, 1989",,FALSE,',
        SHORTS,
        'FALSE,A,Comics #1,"May, 1989",FALSE,',
      ]),
    ).toThrow(/record 5: .*manual:tmnt-mirage-host-comics-1.*record 3/);
  });

  it("R9: a header whose Owned names another volume stops the build", () => {
    expect(() => build(["Volume 2,Main Series,,,Volume 3,", ROW])).toThrow(
      `${RAW}: record 2: `,
    );
  });
});

describe("buildFixtures", () => {
  const ROOT = fileURLToPath(new URL("../..", import.meta.url));
  const DIR = join(ROOT, "node_modules/.cache/rummage-mirage-build");
  const RAW_DIR = join(DIR, "raw");
  const OUT = join(DIR, "out");
  const of = (key: string) => () => ({
    items: [{ id: `manual:${key}` }],
    shelves: [],
  });

  beforeEach(() => {
    rmSync(DIR, { recursive: true, force: true });
    mkdirSync(RAW_DIR, { recursive: true });
    writeFileSync(join(RAW_DIR, "a.csv"), "a");
  });

  it("R6: two sources with one out file stop the build and write nothing", () => {
    expect(() =>
      buildFixtures(
        [
          { raw: "a.csv", out: "x.json", build: of("first") },
          { raw: "a.csv", out: "x.json", build: of("second") },
        ],
        { rawDir: RAW_DIR, outDir: OUT },
      ),
    ).toThrow("x.json");
    expect(existsSync(OUT) ? readdirSync(OUT) : []).toEqual([]);
  });
});

describe("fixture", () => {
  it("R7: an item id can't be an edition id", () => {
    const comic = {
      id: "edition:tmnt-ultimate-collection-1-hardcover",
      type: "comic",
      title: "Ultimate Collection 1",
      year: null,
      source_date: "",
      source_note: "",
      providers: {},
      form: "collected",
      series: null,
      series_kind: null,
      number: null,
    };
    const result = fixture.safeParse({
      items: [comic],
      shelves: [],
      occurrences: [{ item: comic.id, status: "done" }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map(({ path }) => path)).toContainEqual([
      "items",
      0,
      "id",
    ]);
  });
});

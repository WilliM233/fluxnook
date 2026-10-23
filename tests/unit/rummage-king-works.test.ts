import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { kingWorks } from "../../scripts/fixtures/king-works.mjs";
import { exportOf } from "./fixtures/helpers";

// Ch 0.5 Rummage. Each test names its line in the plan's section 4b.

const RAW = "raw/king.csv";

// Film i (from 1) has key k<i> and is record i + 4.
function build(notes: string[]) {
  return kingWorks(
    exportOf(
      notes.map(
        (note, i) =>
          `${i + 1},Film ${i + 1},2000,https://boxd.it/k${i + 1},"${note}"`,
      ),
    ),
    RAW,
  );
}

describe("kingWorks", () => {
  it("R1: a note that names the same work twice stops the build", () => {
    const novel = "Novel: Carrie (1974)";
    expect(() => build([`${novel}\n${novel}`])).toThrow(`${RAW}: record 5: `);
    const story = "Short Story: The Ledge, Night Shift (1977)";
    expect(() => build([`${story}\n${story}`])).toThrow(`${RAW}: record 5: `);
  });

  it("R2: one work dated two ways stops the build, as a collection does", () => {
    expect(() =>
      build(["Novel: Carrie (1974)", "Novel: Carrie (1975)"]),
    ).toThrow(`${RAW}: record 6: `);
    expect(() =>
      build(["Novel: Carrie (1974)", "Novel: Carrie (1975)"]),
    ).toThrow(JSON.stringify("Novel: Carrie (1975)"));
  });

  it("R3: an accented title keeps its letters in the id", () => {
    const works = build(["Novel: Été (1990)", "Novel: Café Noir (1991)"]);
    expect(works.items.map(({ id }: { id: string }) => id)).toEqual([
      "manual:ete-1990",
      "manual:cafe-noir-1991",
    ]);
  });

  it("R5: a film listed twice makes one set of relations and one gap", () => {
    const works = kingWorks(
      exportOf([
        "1,Carrie,1976,https://boxd.it/20ZQ,Novel: Carrie (1974)",
        "2,The Long Walk,2025,https://boxd.it/mic8,",
        "3,Carrie,1976,https://boxd.it/20ZQ,Novel: Carrie (1974)",
        "4,The Long Walk,2025,https://boxd.it/mic8,",
      ]),
      RAW,
    );
    expect(works.relations).toEqual([
      {
        type: "adaptation-of",
        from: "letterboxd:20ZQ",
        to: "manual:carrie-1974",
      },
    ]);
    expect(works.gaps).toEqual([
      { item: "letterboxd:mic8", reason: "no source note" },
    ]);
  });

  it("R6: a typographic apostrophe slugs like a straight one", () => {
    const works = build(["Novel: Salem’s Lot (1975)"]);
    expect(works.items[0]).toMatchObject({
      id: "manual:salems-lot-1975",
      title: "Salem’s Lot",
    });
  });
});

describe("every fixture file", () => {
  const FIXTURES = fileURLToPath(
    new URL("../../supabase/seed/fixtures", import.meta.url),
  );
  const all = readdirSync(FIXTURES)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({
      name,
      data: JSON.parse(readFileSync(join(FIXTURES, name), "utf8")),
    }));

  it("R7: no gap's item is an end of any relation in any file", () => {
    const ends = new Set<string>(
      all.flatMap(({ data }) =>
        (data.relations ?? []).flatMap(
          ({ from, to }: { from: string; to: string }) => [from, to],
        ),
      ),
    );
    const lines = all.flatMap(({ name, data }) =>
      (data.gaps ?? [])
        .filter(({ item }: { item: string }) => ends.has(item))
        .map(
          ({ item }: { item: string }) =>
            `${name}: gap ${item} is also an end of a relation`,
        ),
    );
    expect(lines, lines.join("\n")).toEqual([]);
  });
});

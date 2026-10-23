import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fixture } from "@/fixtures/shape";

// What tmnt-mirage.json says about the Mirage run (Ch 0.6 A4 to A9). The
// fresh-build test proves the file matches the tab; this one proves the tab
// was read the way the spec says.

const FILE = fileURLToPath(
  new URL("../../supabase/seed/fixtures/tmnt-mirage.json", import.meta.url),
);
const tab = fixture.parse(JSON.parse(readFileSync(FILE, "utf8")));
const byId = new Map(tab.items.map((item) => [item.id, item]));

function comic(id: string) {
  const item = byId.get(id);
  if (item?.type !== "comic") throw new Error(`${id} is not a comic here`);
  return item;
}

const comics = tab.items.map(({ id }) => comic(id));
const ofForm = (form: string) => comics.filter((item) => item.form === form);
const tally = (values: unknown[]) => {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[String(value)] = (counts[String(value)] ?? 0) + 1;
  }
  return counts;
};
const v1 = (n: number) => `manual:tmnt-mirage-v1-${n}`;
const MICRO_READ = [
  "manual:tmnt-mirage-micro-raphael-me-myself-and-i",
  "manual:tmnt-mirage-micro-michelangelo-the-christmas-aliens",
  "manual:tmnt-mirage-micro-donatello-kirby-and-the-warp-crystal",
  "manual:tmnt-mirage-micro-leonardo-what-goes-around-comes-around",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

describe("tmnt-mirage.json", () => {
  it("holds 366 comics, none with a provider", () => {
    expect(tab.items).toHaveLength(366);
    for (const item of tab.items) {
      expect(item.type, item.id).toBe("comic");
      expect(item.providers, item.id).toEqual({});
      expect(item.id).toMatch(/^manual:/);
    }
    expect(new Set(byId.keys()).size).toBe(366);
    expect(tally(comics.map(({ form }) => form))).toEqual({
      issue: 253,
      "one-shot": 26,
      backup: 47,
      anthology: 35,
      collected: 5,
    });
  });

  it("reads each section by its rule", () => {
    expect(tally(comics.map(({ series_kind }) => series_kind))).toEqual({
      ongoing: 207,
      "micro-series": 5,
      "mini-series": 20,
      minor: 29,
      "tie-in": 9,
      crossover: 9,
      null: 87,
    });
    for (const { id, series, number } of comics) {
      expect(number === null, id).toBe(series === null);
    }
  });

  it("keeps cells as the sheet has them", () => {
    expect(comic(v1(1))).toMatchObject({
      title: "The Turtles' Origin is Told",
      number: 1,
      year: 1984,
      month: 5,
      source_date: "May, 1984",
      series: "Teenage Mutant Ninja Turtles (Mirage) Vol. 1",
    });
    expect(comic("manual:tmnt-mirage-v3-1")).toMatchObject({
      series: "Teenage Mutant Ninja Turtles (Image) Vol. 3",
      title: "Untitled",
    });
    expect(comic("manual:tmnt-mirage-tales-v2-59").title).toBe("Exposé");
    expect(comic("manual:tmnt-mirage-tales-v2-3").title).toBe(
      'The Worms of Madness, Part 1 & "Green"',
    );
    expect(comic("manual:tmnt-mirage-v4-31")).toMatchObject({
      source_date: "October, 2010 (online) 1",
      year: 2010,
      month: 10,
    });
    const [summer] = comics.filter(({ id }) =>
      id.startsWith(
        "manual:tmnt-mirage-tie-in-teenage-mutant-ninja-turtles-iii-",
      ),
    );
    expect(summer).toMatchObject({ source_date: "Summer 1993", year: 1993 });
    expect(summer).not.toHaveProperty("month");
    const fugitoid = comic(
      "manual:tmnt-mirage-micro-fugitoid-the-fugitoids-origin",
    );
    expect(fugitoid.year).toBe(1985);
    expect(fugitoid).not.toHaveProperty("month");
    expect(
      comic("manual:tmnt-mirage-backup-rockin-rollin-miner-ants-feat-the-tmnt")
        .title,
    ).toBe("Rockin’ Rollin’ Miner Ants (feat. The TMNT)");
  });

  it("the Savage Dragon #2 rows are two items", () => {
    const shared = {
      number: 2,
      series: "Savage Dragon",
      year: null,
      title: "Savage Dragon #2",
    };
    expect(comic("manual:tmnt-mirage-savage-dragon-2")).toMatchObject({
      ...shared,
      source_note: "",
    });
    expect(comic("manual:tmnt-mirage-savage-dragon-2-r212")).toMatchObject({
      ...shared,
      source_note: "#22",
    });
  });

  it("five Ultimate Collections, each an edition with a copy", () => {
    const numbers = [1, 2, 3, 4, 5];
    expect(ofForm("collected").map(({ id }) => id)).toEqual(
      numbers.map((n) => `manual:tmnt-ultimate-collection-${n}`),
    );
    for (const n of numbers) {
      expect(comic(`manual:tmnt-ultimate-collection-${n}`)).toMatchObject({
        title: `Ultimate Collection ${n}`,
        year: null,
      });
    }
    expect(
      tab.editions.map(({ id, item, format }) => [id, item, format]),
    ).toEqual(
      numbers.map((n) => [
        `edition:tmnt-ultimate-collection-${n}-hardcover`,
        `manual:tmnt-ultimate-collection-${n}`,
        "hardcover",
      ]),
    );
    expect(tab.editions.map(({ contents }) => contents.length)).toEqual([
      8, 7, 7, 8, 7,
    ]);
    const contents = tab.editions.flatMap(({ contents }) => contents);
    expect(new Set(contents).size).toBe(37);
    for (const id of contents) {
      expect(["issue", "one-shot"], id).toContain(comic(id).form);
    }
    expect(tab.editions[0].contents).toEqual([
      ...[1, 2, 3, 4, 5, 6, 7].map(v1),
      "manual:tmnt-mirage-micro-raphael-me-myself-and-i",
    ]);
    expect(tab.editions[2].contents.map((id) => comic(id).number)).toEqual([
      12, 14, 15, 17, 19, 20, 21,
    ]);
    expect(tab.copies).toEqual(
      tab.editions.map(({ id }) => ({ edition: id, note: "" })),
    );
  });

  it("no contained-in points at an Ultimate Collection", () => {
    expect(
      tab.relations.filter(({ to }) =>
        to.startsWith("manual:tmnt-ultimate-collection-"),
      ),
    ).toEqual([]);
  });

  it("47 contained-in, one per backup, from a backup to an issue or an anthology", () => {
    expect(tab.relations).toHaveLength(47);
    const backups = ofForm("backup").map(({ id }) => id);
    expect(tab.relations.map(({ from }) => from)).toEqual(backups);
    const toIssue = [];
    for (const { type, from, to } of tab.relations) {
      expect(type).toBe("contained-in");
      expect(from).not.toBe(to);
      const host = comic(to).form;
      expect(["issue", "anthology"], `${from} -> ${to}`).toContain(host);
      if (host === "issue") toIssue.push([from, to]);
    }
    expect(toIssue).toEqual([
      ["manual:tmnt-mirage-backup-you-had-to-be-there", v1(7)],
      [
        "manual:tmnt-mirage-backup-rockin-rollin-miner-ants-feat-the-tmnt",
        v1(40),
      ],
    ]);
    expect(
      new Set(tab.relations.map(({ from, to }) => `${from} ${to}`)).size,
    ).toBe(47);
  });

  it("35 anthologies, each the host of at least one backup", () => {
    const hosted = (id: string) =>
      tab.relations.filter(({ to }) => to === id).length;
    for (const { id } of ofForm("anthology")) {
      expect(hosted(id), id).toBeGreaterThan(0);
    }
    expect(comic("manual:tmnt-mirage-host-shell-shock")).toMatchObject({
      title: "Shell Shock",
      year: 1989,
      month: 12,
    });
    expect(hosted("manual:tmnt-mirage-host-shell-shock")).toBe(6);
    const anniversary =
      "manual:tmnt-mirage-host-teenage-mutant-ninja-turtles-40th-anniversary-comics-celebration";
    expect(comic(anniversary).year).toBe(2024);
    expect(hosted(anniversary)).toBe(3);
    // Reprints stay anthologies until Metron can resolve printings.
    expect(
      comic("manual:tmnt-mirage-host-teenage-mutant-ninja-turtles-1-5th-print")
        .form,
    ).toBe("anthology");
    expect(comic("manual:tmnt-mirage-host-raphael-2nd-print").form).toBe(
      "anthology",
    );
  });

  it("26 occurrences, all done, on Vol 1 Main #1 to #22 and the four turtle one-shots", () => {
    expect(tab.occurrences).toHaveLength(26);
    for (const { status } of tab.occurrences) expect(status).toBe("done");
    const read = tab.occurrences.map(({ item }) => item);
    expect(new Set(read).size).toBe(26);
    expect(new Set(read)).toEqual(
      new Set([
        ...Array.from({ length: 22 }, (_, i) => v1(i + 1)),
        ...MICRO_READ,
      ]),
    );
    for (const id of read) {
      expect(["collected", "anthology", "backup"], id).not.toContain(
        comic(id).form,
      );
    }
  });

  it("has the Mirage run shelf with 14 sections", () => {
    expect(tab.shelves).toHaveLength(1);
    const [shelf] = tab.shelves;
    expect(shelf).toMatchObject({
      name: "TMNT, the Mirage run",
      date: "2026-10-23",
    });
    // No public link to the sheet (Q1).
    expect(shelf).not.toHaveProperty("url");
    expect(shelf).not.toHaveProperty("entries");
    expect(shelf.description.split(".")).toHaveLength(2);
    expect(shelf.description.endsWith(".")).toBe(true);
    const sections = shelf.sections ?? [];
    expect(sections.map(({ name }) => name)).toEqual([
      "Volume 1 · Main Series",
      "Volume 1 · Micro Series",
      "Volume 1 · Tales of the Teenage Mutant Ninja Turtles",
      "Volume 1 · Short Stories",
      "Volume 1 · Minor Titles",
      "Volume 2 · Main Series",
      "Volume 2 · Minor Titles",
      "Volume 3 · Image Series",
      "Volume 3 · Mini Series",
      "Volume 3 · Supplemental/Crossover",
      "Volume 4 · Main Series",
      "Volume 4 · Tales of the Teenage Mutant Ninja Turtles 2",
      "Volume 4 · Mini Series",
      "Volume 4 · Movie tie-ins",
    ]);
    expect(sections.map(({ entries }) => entries.length)).toEqual([
      62, 5, 7, 47, 20, 13, 9, 23, 4, 9, 32, 70, 16, 9,
    ]);
    for (const { name, entries } of sections) {
      expect(
        entries.map(({ position }) => position),
        name,
      ).toEqual(entries.map((_, i) => i + 1));
    }
    const shelved = sections.flatMap(({ entries }) =>
      entries.map(({ item }) => item),
    );
    expect(shelved).toHaveLength(326);
    expect(new Set(shelved)).toEqual(
      new Set(
        comics
          .filter(({ form }) => form !== "anthology" && form !== "collected")
          .map(({ id }) => id),
      ),
    );
  });

  it("records the nine undated crossover rows as gaps", () => {
    expect(tab.gaps).toHaveLength(9);
    for (const { item, reason } of tab.gaps) {
      expect(reason).toBe("no readable year");
      expect(comic(item)).toMatchObject({
        series_kind: "crossover",
        year: null,
      });
    }
    const undated = comics
      .filter(({ year, form }) => year === null && form !== "collected")
      .map(({ id }) => id);
    expect(tab.gaps.map(({ item }) => item)).toEqual(undated);
  });

  it("dates are read, not corrected", () => {
    for (const { id, year, month, source_date } of comics) {
      if (year !== null) expect(source_date, id).toContain(String(year));
      if (month !== undefined) {
        expect(source_date.startsWith(MONTHS[month - 1]), id).toBe(true);
      }
    }
    // Rows only: an anthology takes its first backup's date, month or none.
    const monthless = comics
      .filter(
        ({ year, month, form }) =>
          year !== null && month === undefined && form !== "anthology",
      )
      .map(({ source_date }) => source_date)
      .sort();
    expect(monthless).toEqual([
      "1985",
      "1986",
      "1990",
      "1991",
      "2003",
      "2007",
      "Summer 1993",
    ]);
  });
});

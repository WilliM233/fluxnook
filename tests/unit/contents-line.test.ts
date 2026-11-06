import { describe, expect, it } from "vitest";
import { type ContentRow, contentsLine } from "@/lib/catalog/contents-line";

const VOL1 = "Teenage Mutant Ninja Turtles (Mirage) Vol. 1";
const RUN = "series-1984";

/** Issues of one run at consecutive positions, from `from`. */
function issues(numbers: number[], from = 1, series = VOL1): ContentRow[] {
  return numbers.map((n, i) => ({
    itemId: `${series}-${n}`,
    title: `${series} #${n}`,
    number: n,
    series,
    seriesId: series === VOL1 ? RUN : null,
    position: from + i,
  }));
}

function oneShot(title: string, position: number): ContentRow {
  return {
    itemId: title,
    title,
    number: null,
    series: null,
    seriesId: null,
    position,
  };
}

// The fixture's five hardcovers, as tmnt-mirage.json lists their contents.
const UC1 = [
  ...issues([1, 2, 3, 4, 5, 6, 7]),
  oneShot("Raphael: Me, Myself and I", 8),
];
const UC2 = [
  ...issues([8, 9, 10, 11]),
  oneShot("Michelangelo: The Christmas Aliens", 5),
  oneShot("Donatello: Kirby and the Warp Crystal", 6),
  oneShot("Leonardo: What Goes Around... ...Comes Around!", 7),
];
const UC3 = issues([12, 14, 15, 17, 19, 20, 21]);

describe("contentsLine", () => {
  it("UC1 with no run of its own names the series, then the one-shot", () => {
    expect(contentsLine(UC1)).toBe(
      `${VOL1} #1 to #7, Raphael: Me, Myself and I`,
    );
  });

  it("UC1 from its own run's side prints bare numbers, then ', and'", () => {
    expect(contentsLine(UC1, { own: { series: VOL1 } })).toBe(
      "#1 to #7, and Raphael: Me, Myself and I",
    );
  });

  it("omitting #1 says what else it holds, starting 'with'", () => {
    expect(
      contentsLine(UC1, { own: { series: VOL1 }, omit: `${VOL1}-1` }),
    ).toBe("with #2 to #7, and Raphael: Me, Myself and I");
  });

  it("the own run found by series id reads as by its text", () => {
    expect(contentsLine(UC1, { own: { seriesId: RUN } })).toBe(
      contentsLine(UC1, { own: { series: VOL1 } }),
    );
  });

  it("UC2's others follow in the edition's order", () => {
    expect(contentsLine(UC2, { own: { series: VOL1 } })).toBe(
      "#8 to #11, and Michelangelo: The Christmas Aliens, Donatello: Kirby and the Warp Crystal, Leonardo: What Goes Around... ...Comes Around!",
    );
  });

  it("UC3's gaps are runs joined with commas", () => {
    expect(contentsLine(UC3, { own: { series: VOL1 } })).toBe(
      "#12, #14 to #15, #17, #19 to #21",
    );
  });

  it("two consecutive issues are a run", () => {
    const tales = issues(
      [1, 2],
      1,
      "Tales of the Teenage Mutant Ninja Turtles",
    );
    expect(contentsLine(tales)).toBe(
      "Tales of the Teenage Mutant Ninja Turtles #1 to #2",
    );
  });

  it("two series and a one-shot, each named", () => {
    const rows = [
      ...issues([1, 2, 3], 1, "A"),
      ...issues([5], 4, "B"),
      oneShot("Lone Title", 5),
    ];
    expect(contentsLine(rows)).toBe("A #1 to #3, B #5, Lone Title");
  });

  it("a series row with no number prints by title after its group's runs", () => {
    const rows = [
      ...issues([1, 2], 1, "A"),
      { ...oneShot("A Half Issue", 3), series: "A" },
    ];
    expect(contentsLine(rows)).toBe("A #1 to #2, A Half Issue");
  });

  it("omitting the only item leaves nothing", () => {
    const rows = issues([1]);
    expect(contentsLine(rows, { omit: rows[0].itemId })).toBe("");
  });

  it("no contents is an empty line", () => {
    expect(contentsLine([])).toBe("");
  });

  it("rows out of position order are put in order first", () => {
    const rows = [
      oneShot("Second", 2),
      ...issues([1], 3, "A"),
      oneShot("First", 1),
    ];
    expect(contentsLine(rows)).toBe("A #1, First, Second");
  });
});

import { describe, expect, it } from "vitest";
import { workLine } from "@/lib/catalog/work-line";

// The row's second line, one formatter per type (A7, census C3).

describe("workLine", () => {
  it("film: year · runtime when held, the year alone without (the fixture's case)", () => {
    expect(
      workLine({
        type: "film",
        released_on: "1976-11-03",
        runtime_minutes: 98,
      }),
    ).toBe("1976 · 98 min");
    expect(
      workLine({
        type: "film",
        released_on: "1976-01-01",
        runtime_minutes: null,
      }),
    ).toBe("1976");
    expect(workLine({ type: "film", released_on: null })).toBe("");
  });

  it("tv: year · seasons, one season singular", () => {
    expect(
      workLine({ type: "tv", released_on: "2008-01-20", seasons: 5 }),
    ).toBe("2008 · 5 seasons");
    expect(
      workLine({ type: "tv", released_on: "2019-01-01", seasons: 1 }),
    ).toBe("2019 · 1 season");
  });

  it("book: year · Form · author, a missing form left out", () => {
    const king = { type: "book", author: "Stephen King" };
    expect(
      workLine({ ...king, released_on: "1974-01-01", form: "novel" }),
    ).toBe("1974 · Novel · Stephen King");
    expect(
      workLine({ ...king, released_on: "1977-01-01", form: "collection" }),
    ).toBe("1977 · Collection · Stephen King");
    expect(workLine({ ...king, released_on: "1974-01-01", form: null })).toBe(
      "1974 · Stephen King",
    );
  });

  it("comic: year · series · #n, either part left out when missing", () => {
    const series = "Teenage Mutant Ninja Turtles (Mirage) Vol. 1";
    expect(
      workLine({ type: "comic", released_on: "1984-05-01", series, number: 1 }),
    ).toBe(`1984 · ${series} · #1`);
    expect(
      workLine({
        type: "comic",
        released_on: "1984-05-01",
        series,
        number: null,
      }),
    ).toBe(`1984 · ${series}`);
    expect(
      workLine({
        type: "comic",
        released_on: "1984-05-01",
        series: null,
        number: 3,
      }),
    ).toBe("1984 · #3");
  });

  it("a null date drops the year", () => {
    expect(
      workLine({
        type: "book",
        released_on: null,
        form: "story",
        author: "Stephen King",
      }),
    ).toBe("Story · Stephen King");
  });
});

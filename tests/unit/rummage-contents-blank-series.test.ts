import { describe, expect, it } from "vitest";
import { type ContentRow, contentsLine } from "@/lib/catalog/contents-line";

// Raccoon, Ch 1.4.3 R5: `item_comics.series` is nullable text with no check,
// so a blank label can land (a hand-entry form that trims to ""). The line
// and the picker treat only `null` as "no series": a blank-series comic with
// a number prints as a bare "#1", which reads as the page's own run, and the
// picker gives it a group with an empty heading. Blank is none.

const blank: ContentRow = {
  itemId: "x",
  title: "Lone Title",
  number: 1,
  series: "",
  seriesId: null,
  position: 2,
};
const own: ContentRow = {
  itemId: "y",
  title: "#1",
  number: 1,
  series: "A",
  seriesId: "a",
  position: 1,
};

describe("contentsLine, a blank series text", () => {
  it("prints the comic by title among the rest, never as a bare number", () => {
    expect(contentsLine([own, blank], { own: { seriesId: "a" } })).toBe(
      "#1, and Lone Title",
    );
    expect(contentsLine([blank])).toBe("Lone Title");
  });
});

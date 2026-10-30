import { describe, expect, it } from "vitest";
import { type ContentRow, contentsLine } from "@/lib/catalog/contents-line";

// Raccoon, Ch 1.4.3 R1: the own run is found by series id OR by the held
// text, not one or the other. An attach fills `series_id` only on the issues
// Comic Vine lists; a hand-entered sibling the volume lacks keeps the text
// and no id. An issue page passing both must fold that sibling into "#1 to
// #3", not name it as another run.

const T = "Teenage Mutant Ninja Turtles (Mirage) Vol. 1";
const S = "series-uuid";

const row = (
  n: number,
  seriesId: string | null,
  position: number,
): ContentRow => ({
  itemId: `item-${n}`,
  title: `#${n}`,
  number: n,
  series: T,
  seriesId,
  position,
});

describe("contentsLine, own by id or text", () => {
  it("folds an unattached sibling into the own run when both keys are given", () => {
    const rows = [row(1, S, 1), row(2, S, 2), row(3, null, 3)];
    expect(contentsLine(rows, { own: { seriesId: S, series: T } })).toBe(
      "#1 to #3",
    );
  });

  it("the issue page's 'with' line names the sibling as its own, not as another run", () => {
    const rows = [row(1, S, 1), row(2, null, 2)];
    expect(
      contentsLine(rows, { own: { seriesId: S, series: T }, omit: "item-1" }),
    ).toBe("with #2");
  });
});

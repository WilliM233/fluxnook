import { describe, expect, it } from "vitest";
import { sameSeries } from "@/lib/catalog/match";
import { seriesPublisher } from "@/lib/catalog/normalize";

// Rummage R2 (1.4.1): Comic Vine's own pages print a volume as
// "Teenage Mutant Ninja Turtles (1984)", and a person copying that into a
// series label gets a parenthetical that is a year, not a publisher. Q2's
// gate reads it as the publisher "1984" and the run never matches anything.

const mirage1984 = {
  name: "Teenage Mutant Ninja Turtles",
  year: 1984,
  publisher: "Mirage",
};

describe("a label whose parenthetical is a year", () => {
  it("names no publisher", () => {
    expect(seriesPublisher("Teenage Mutant Ninja Turtles (1984)")).toBeNull();
    expect(
      seriesPublisher("Teenage Mutant Ninja Turtles (1984) Vol. 1"),
    ).toBeNull();
  });

  it("still matches the volume on name and year", () => {
    expect(
      sameSeries(mirage1984, {
        group: "series",
        label: "Teenage Mutant Ninja Turtles (1984)",
        earliest: 1984,
        contains: [],
      }),
    ).toBe(true);
  });

  it("while a publisher parenthetical still gates", () => {
    expect(
      sameSeries(mirage1984, {
        group: "series",
        label: "Teenage Mutant Ninja Turtles (Image)",
        earliest: 1984,
        contains: [],
      }),
    ).toBe(false);
  });
});

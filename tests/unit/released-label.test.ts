import { describe, expect, it } from "vitest";
import { releasedLabel } from "@/lib/catalog/item-page";

describe("releasedLabel", () => {
  it("a day is the whole date", () => {
    expect(releasedLabel("1976-11-16", "day")).toBe("16 November 1976");
  });

  it("a month is the month and year", () => {
    expect(releasedLabel("1984-05-01", "month")).toBe("May 1984");
  });

  it("a year is the year alone", () => {
    expect(releasedLabel("1979-01-01", "year")).toBe("1979");
  });

  it("no date is no label", () => {
    expect(releasedLabel(null, null)).toBeNull();
  });
});

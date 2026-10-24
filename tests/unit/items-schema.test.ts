import { describe, expect, it } from "vitest";
import {
  fieldErrors,
  manualItemSchema,
  releasedFrom,
} from "@/app/api/v1/items/schema";

// A6's schema, per type: what each needs, what each refuses, and the date at
// the precision given. The manual form runs this same schema in the browser.

const longWalk = {
  type: "book",
  title: "The Long Walk",
  year: 1979,
  month: 7,
  form: "novel",
  author: "Richard Bachman",
};

function errors(input: unknown) {
  const result = manualItemSchema.safeParse(input);
  if (result.success) throw new Error("expected the schema to refuse this");
  return fieldErrors(result.error);
}

describe("manualItemSchema", () => {
  it("a book without an author is refused at author", () => {
    const { author: _, ...input } = longWalk;
    expect(errors(input)).toEqual({ author: "Name the author." });
  });

  it("a book without a form is refused at form", () => {
    const { form: _, ...input } = longWalk;
    expect(errors(input)).toHaveProperty("form");
  });

  it("a comic without a form is refused at form", () => {
    expect(errors({ type: "comic", title: "Raphael #1" })).toHaveProperty(
      "form",
    );
  });

  it("a film with a form is refused at form", () => {
    expect(errors({ type: "film", title: "Carrie", form: "novel" })).toEqual({
      form: "Not a field for this type.",
    });
  });

  it("a show with seasons passes", () => {
    expect(
      manualItemSchema.safeParse({
        type: "tv",
        title: "Castle Rock",
        seasons: 2,
      }).success,
    ).toBe(true);
  });

  it("a month without a year is refused at month", () => {
    expect(errors({ type: "film", title: "x", month: 7 })).toHaveProperty(
      "month",
    );
  });

  it("a day without a month is refused at day", () => {
    expect(
      errors({ type: "film", title: "x", year: 1979, day: 3 }),
    ).toHaveProperty("day");
  });

  it("The Long Walk, July 1979, is a month-precision date", () => {
    const parsed = manualItemSchema.parse(longWalk);
    expect(releasedFrom(parsed)).toEqual({
      releasedOn: "1979-07-01",
      releasedPrecision: "month",
    });
  });

  it("a year alone is a year-precision date", () => {
    expect(releasedFrom({ year: 1979 })).toEqual({
      releasedOn: "1979-01-01",
      releasedPrecision: "year",
    });
  });

  it("a full date is day precision, and a day the month lacks is refused", () => {
    expect(releasedFrom({ year: 1976, month: 11, day: 3 })).toEqual({
      releasedOn: "1976-11-03",
      releasedPrecision: "day",
    });
    expect(
      errors({ type: "film", title: "x", year: 1979, month: 2, day: 30 }),
    ).toHaveProperty("day");
  });

  it("an unknown key is refused by name", () => {
    expect(errors({ ...longWalk, isbn: "x" })).toHaveProperty("isbn");
  });
});

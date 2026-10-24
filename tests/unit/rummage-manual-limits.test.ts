import { describe, expect, it } from "vitest";
import { fieldErrors, manualItemSchema } from "@/app/api/v1/items/schema";

// Rummage R5 (Ch 1.2). The manual schema caps summary at 2000 characters and
// nothing else: a title, an author or a series of any length lands in the
// global catalog, where every search row and item page renders it. A cap in
// the hundreds is plenty for a title; the limit is the schema's to pick.

const long = "x".repeat(100_000);

function errors(input: unknown) {
  const result = manualItemSchema.safeParse(input);
  if (result.success) throw new Error("expected the schema to refuse this");
  return fieldErrors(result.error);
}

describe("manual text fields have a ceiling", () => {
  it("a 100,000-character title is refused at title", () => {
    expect(errors({ type: "film", title: long })).toHaveProperty("title");
  });

  it("a 100,000-character author is refused at author", () => {
    expect(
      errors({ type: "book", title: "x", form: "novel", author: long }),
    ).toHaveProperty("author");
  });

  it("a 100,000-character series is refused at series", () => {
    expect(
      errors({ type: "comic", title: "x", form: "issue", series: long }),
    ).toHaveProperty("series");
  });
});

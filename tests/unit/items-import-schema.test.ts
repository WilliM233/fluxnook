import { describe, expect, it } from "vitest";
import { importRequestSchema } from "@/app/api/v1/items/import/schema";

// The import body is a union on `source`, and each source takes only the keys
// its provider could return.

describe("importRequestSchema", () => {
  it("takes an Open Library work key", () => {
    expect(
      importRequestSchema.safeParse({
        source: "openlibrary",
        key: "works/OL81626W",
      }).success,
    ).toBe(true);
  });

  it("refuses an edition key as a work", () => {
    expect(
      importRequestSchema.safeParse({
        source: "openlibrary",
        key: "books/OL1M",
      }).success,
    ).toBe(false);
  });

  it("refuses a work key under tmdb", () => {
    expect(
      importRequestSchema.safeParse({ source: "tmdb", key: "works/OL1W" })
        .success,
    ).toBe(false);
  });

  it("refuses an unknown field", () => {
    expect(
      importRequestSchema.safeParse({
        source: "openlibrary",
        key: "works/OL1W",
        format: "paperback",
      }).success,
    ).toBe(false);
  });
});

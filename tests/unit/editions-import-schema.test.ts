import { describe, expect, it } from "vitest";
import { editionImportSchema } from "@/app/api/v1/editions/import/schema";

const valid = {
  source: "openlibrary",
  key: "books/OL32864645M",
  format: "paperback",
};

describe("editionImportSchema", () => {
  it("refuses a format outside a book's four, at format", () => {
    const result = editionImportSchema.safeParse({ ...valid, format: "tpb" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["format"]);
  });

  it("refuses a work key", () => {
    expect(
      editionImportSchema.safeParse({ ...valid, key: "works/OL81626W" })
        .success,
    ).toBe(false);
  });

  it("takes attachTo only as a uuid", () => {
    expect(
      editionImportSchema.safeParse({ ...valid, attachTo: "carrie" }).success,
    ).toBe(false);
    expect(
      editionImportSchema.safeParse({
        ...valid,
        attachTo: crypto.randomUUID(),
      }).success,
    ).toBe(true);
  });
});

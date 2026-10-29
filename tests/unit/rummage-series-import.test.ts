import { describe, expect, it } from "vitest";
import { seriesImportSchema } from "@/app/api/v1/series/import/schema";

// The Raccoon's Rummage on 1.4.2 (R4): a label the catalog could never hold
// (the items API caps `series` at 200) is a 400 at the edge, not a 409 that
// echoes it back whole into the sheet's alert and the server's query.

const body = { source: "comicvine", key: "volume/20281" };

describe("Rummage: the attach label's length", () => {
  it("R4: a { series } label past 200 characters is 400 on attachTo", () => {
    const result = seriesImportSchema.safeParse({
      ...body,
      form: "issue",
      attachTo: { series: "x".repeat(201) },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path[0])).toContain("attachTo");
    }
  });

  it("R4: a { collected } label past 200 characters is 400 too", () => {
    const result = seriesImportSchema.safeParse({
      ...body,
      form: "collected",
      format: "hardcover",
      attachTo: { collected: "x".repeat(201) },
    });
    expect(result.success).toBe(false);
  });

  it("a 200-character label still passes", () => {
    const result = seriesImportSchema.safeParse({
      ...body,
      form: "issue",
      attachTo: { series: "x".repeat(200) },
    });
    expect(result.success).toBe(true);
  });
});

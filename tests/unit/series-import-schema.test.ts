import { describe, expect, it } from "vitest";
import { seriesImportSchema } from "@/app/api/v1/series/import/schema";
import { fieldErrors } from "@/lib/api/fields";

const issues = { source: "comicvine", key: "volume/20281", form: "issue" };
const collected = {
  source: "comicvine",
  key: "volume/50804",
  form: "collected",
  format: "hardcover",
};
const parses = (body: unknown) => seriesImportSchema.safeParse(body).success;

describe("seriesImportSchema", () => {
  it("takes a run of issues, bare or onto a series group", () => {
    expect(parses(issues)).toBe(true);
    expect(
      parses({
        ...issues,
        attachTo: {
          series: "Tales of the Teenage Mutant Ninja Turtles Vol. 2",
        },
      }),
    ).toBe(true);
  });

  it("takes a collected run with a format, onto a stem or a series group", () => {
    expect(parses(collected)).toBe(true);
    expect(
      parses({ ...collected, attachTo: { collected: "Ultimate Collection" } }),
    ).toBe(true);
    expect(parses({ ...collected, attachTo: { series: "Bodycount" } })).toBe(
      true,
    );
  });

  it("refuses a key that isn't volume/<id> as the catalog stores it", () => {
    for (const key of [
      "volume/4050-20281",
      "issue/1",
      "volume/0",
      "volume/020281",
      "volume/12345678901",
    ]) {
      expect(parses({ ...issues, key }), key).toBe(false);
    }
  });

  it("refuses a form it doesn't know and a stray field", () => {
    expect(parses({ ...issues, form: "trade" })).toBe(false);
    expect(parses({ ...issues, source: "metron" })).toBe(false);
    expect(parses({ ...issues, title: "x" })).toBe(false);
  });

  it("needs a format for collected, at format, and refuses one for issues", () => {
    const missing = seriesImportSchema.safeParse({
      ...collected,
      format: undefined,
    });
    expect(missing.success).toBe(false);
    expect(fieldErrors(missing.error as never).format).toBe(
      "A run of collected editions needs a format: trade paperback, hardcover or omnibus.",
    );
    expect(parses({ ...issues, format: "hardcover" })).toBe(false);
    expect(parses({ ...collected, format: "paperback" })).toBe(false);
  });

  it("refuses a stem for single issues", () => {
    const result = seriesImportSchema.safeParse({
      ...issues,
      attachTo: { collected: "Ultimate Collection" },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["attachTo"]);
  });

  it("takes attachTo only as one of the two objects, with a label", () => {
    for (const attachTo of [
      "Teenage Mutant Ninja Turtles (Mirage) Vol. 1",
      { series: "A", collected: "B" },
      { series: "   " },
      { group: "A" },
      {},
    ]) {
      expect(parses({ ...collected, attachTo }), JSON.stringify(attachTo)).toBe(
        false,
      );
    }
  });

  it("trims a label", () => {
    const result = seriesImportSchema.parse({
      ...issues,
      attachTo: { series: "  Bodycount " },
    });
    expect(result.attachTo).toEqual({ series: "Bodycount" });
  });
});

import { describe, expect, it } from "vitest";
import { editionContentsSchema } from "@/app/api/v1/editions/[id]/contents/schema";
import { fieldErrors } from "@/lib/api/fields";

const a = "7a1b2c3d-0000-4000-8000-000000000001";
const b = "7a1b2c3d-0000-4000-8000-000000000002";
const parses = (body: unknown) => editionContentsSchema.safeParse(body);
const fields = (body: unknown) => {
  const parsed = parses(body);
  if (parsed.success) throw new Error("parsed");
  return fieldErrors(parsed.error);
};

describe("editionContentsSchema", () => {
  it("takes an empty list and a list of two", () => {
    expect(parses({ items: [] }).success).toBe(true);
    expect(parses({ items: [a, b] }).data).toEqual({ items: [a, b] });
  });

  it("refuses an id that isn't a uuid", () => {
    expect(fields({ items: ["not-a-uuid"] })).toHaveProperty("items.0");
  });

  it("refuses a comic named twice, at items", () => {
    expect(fields({ items: [a, b, a] })).toEqual({ items: "Each comic once." });
  });

  it("refuses 501 ids", () => {
    const many = Array.from(
      { length: 501 },
      (_, i) => `7a1b2c3d-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    expect(fields({ items: many }).items).toMatch(/At most 500/);
  });

  it("refuses a stray field and a missing list", () => {
    expect(fields({ items: [], order: "asc" })).toHaveProperty("order");
    expect(fields({})).toHaveProperty("items");
  });
});

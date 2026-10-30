import { describe, expect, it } from "vitest";
import {
  addEntriesSchema,
  patchEntrySchema,
} from "@/app/api/v1/shelves/[id]/entries/schema";
import { fieldErrors } from "@/lib/api/fields";

const a = "7a1b2c3d-0000-4000-8000-000000000001";
const b = "7a1b2c3d-0000-4000-8000-000000000002";
const section = "7a1b2c3d-0000-4000-8000-0000000000b1";

const refused =
  (schema: typeof addEntriesSchema | typeof patchEntrySchema) =>
  (body: unknown) => {
    const parsed = schema.safeParse(body);
    if (parsed.success) throw new Error("parsed");
    return fieldErrors(parsed.error);
  };

describe("addEntriesSchema", () => {
  const fields = refused(addEntriesSchema);

  it("takes works in order, with or without a section", () => {
    expect(addEntriesSchema.parse({ items: [b, a] })).toEqual({
      items: [b, a],
    });
    expect(addEntriesSchema.parse({ items: [a], section })).toEqual({
      items: [a],
      section,
    });
  });

  it("takes section: null as no section, the move body's word for it (Rummage R1)", () => {
    const parsed = addEntriesSchema.safeParse({ items: [a], section: null });
    expect(parsed.success).toBe(true);
    expect(parsed.success && (parsed.data.section ?? null)).toBeNull();
  });

  it("refuses an empty list and 501 works", () => {
    expect(fields({ items: [] })).toEqual({ items: "Pick at least one work." });
    const many = Array.from(
      { length: 501 },
      (_, i) => `7a1b2c3d-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    expect(fields({ items: many })).toEqual({
      items: "At most 500 works in one go.",
    });
  });

  it("refuses a work twice, in either case", () => {
    expect(fields({ items: [a, a.toUpperCase()] })).toEqual({
      items: "Each work once.",
    });
  });

  it("refuses an id that isn't a uuid and a stray field", () => {
    expect(fields({ items: ["nope"] })).toHaveProperty("items.0");
    expect(fields({ items: [a], status: "done" })).toEqual({
      status: "Not a field for this type.",
    });
  });
});

describe("patchEntrySchema", () => {
  const fields = refused(patchEntrySchema);
  const ONE = "One change at a time: a status, or a section and an index.";

  it("takes the three statuses", () => {
    for (const status of ["unmarked", "done", "skipped"]) {
      expect(patchEntrySchema.parse({ status })).toEqual({ status });
    }
  });

  it("refuses a status that isn't the shelf's", () => {
    expect(fields({ status: "read" })).toHaveProperty("status");
  });

  it("takes a move into no section at 0, and into a section", () => {
    expect(patchEntrySchema.parse({ section: null, index: 0 })).toEqual({
      section: null,
      index: 0,
    });
    expect(patchEntrySchema.parse({ section, index: 3 })).toEqual({
      section,
      index: 3,
    });
  });

  it("refuses an index of -1 or 1.5 at index", () => {
    expect(fields({ section: null, index: -1 })).toEqual({
      index: "Indexes start at 0.",
    });
    expect(fields({ section: null, index: 1.5 })).toHaveProperty("index");
  });

  it("refuses a section without an index, both bodies at once, and neither", () => {
    expect(fields({ section })).toEqual({ form: ONE });
    expect(fields({ status: "done", section, index: 0 })).toEqual({
      form: ONE,
    });
    expect(fields({})).toEqual({ form: ONE });
    expect(fields(null)).toEqual({ form: ONE });
  });

  it("refuses a stray field beside either body", () => {
    expect(fields({ status: "done", note: "x" })).toEqual({
      note: "Not a field for this type.",
    });
    expect(fields({ section: null, index: 0, note: "x" })).toEqual({
      note: "Not a field for this type.",
    });
  });
});

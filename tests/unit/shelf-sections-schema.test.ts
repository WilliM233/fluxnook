import { describe, expect, it } from "vitest";
import {
  createSectionSchema,
  patchSectionSchema,
} from "@/app/api/v1/shelves/[id]/sections/schema";
import { fieldErrors } from "@/lib/api/fields";

const refused =
  (schema: typeof createSectionSchema | typeof patchSectionSchema) =>
  (body: unknown) => {
    const parsed = schema.safeParse(body);
    if (parsed.success) throw new Error("parsed");
    return fieldErrors(parsed.error);
  };

describe("createSectionSchema", () => {
  const fields = refused(createSectionSchema);

  it("trims the name", () => {
    expect(createSectionSchema.parse({ name: "  Carrie " })).toEqual({
      name: "Carrie",
    });
  });

  it("refuses a blank name, 121 characters and a stray field", () => {
    expect(fields({ name: " " })).toEqual({
      name: "Give the section a name.",
    });
    expect(fields({ name: "x".repeat(121) })).toEqual({
      name: "At most 120 characters.",
    });
    expect(fields({ name: "x", position: 2 })).toEqual({
      position: "Not a field for this type.",
    });
  });
});

describe("patchSectionSchema", () => {
  const fields = refused(patchSectionSchema);

  it("refuses an empty body", () => {
    expect(fields({})).toEqual({ form: "Nothing to change." });
  });

  it("takes a position alone, a name alone, and both", () => {
    expect(patchSectionSchema.parse({ position: 3 })).toEqual({ position: 3 });
    expect(patchSectionSchema.parse({ name: "Scratch" })).toEqual({
      name: "Scratch",
    });
    expect(patchSectionSchema.parse({ name: "a", position: 1 })).toEqual({
      name: "a",
      position: 1,
    });
  });

  it("refuses a position of 0 or 1.5", () => {
    expect(fields({ position: 0 })).toEqual({
      position: "Positions start at 1.",
    });
    expect(fields({ position: 1.5 })).toHaveProperty("position");
  });
});

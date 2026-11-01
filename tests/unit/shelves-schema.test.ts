import { describe, expect, it } from "vitest";
import {
  createShelfSchema,
  patchShelfSchema,
} from "@/app/api/v1/shelves/schema";
import { fieldErrors } from "@/lib/api/fields";

const fields =
  (schema: typeof createShelfSchema | typeof patchShelfSchema) =>
  (body: unknown) => {
    const parsed = schema.safeParse(body);
    if (parsed.success) throw new Error("parsed");
    return fieldErrors(parsed.error);
  };

describe("createShelfSchema", () => {
  const refused = fields(createShelfSchema);

  it("trims the name and defaults the description to empty", () => {
    expect(createShelfSchema.parse({ name: "  Carrie  " })).toEqual({
      name: "Carrie",
      description: "",
    });
  });

  it("keeps a description as typed", () => {
    expect(
      createShelfSchema.parse({ name: "x", description: "  two\n\nlines " })
        .description,
    ).toBe("  two\n\nlines ");
  });

  it("refuses a NUL byte, which Postgres text can't hold, at the field (Rummage R3)", () => {
    expect(refused({ name: "a\u0000b" })).toHaveProperty("name");
    expect(refused({ name: "x", description: "a\u0000b" })).toHaveProperty(
      "description",
    );
  });

  it("refuses a blank name at name", () => {
    expect(refused({ name: "   " })).toEqual({
      name: "Give the shelf a name.",
    });
    expect(refused({})).toHaveProperty("name");
  });

  it("refuses 121 characters, takes 120", () => {
    expect(refused({ name: "x".repeat(121) })).toEqual({
      name: "At most 120 characters.",
    });
    expect(createShelfSchema.safeParse({ name: "x".repeat(120) }).success).toBe(
      true,
    );
  });

  it("refuses a 2001-character description at description", () => {
    expect(refused({ name: "x", description: "d".repeat(2001) })).toEqual({
      description: "At most 2000 characters.",
    });
  });

  it("refuses a stray field", () => {
    expect(refused({ name: "x", visibility: "public" })).toEqual({
      visibility: "Not a field for this type.",
    });
  });
});

describe("patchShelfSchema", () => {
  const refused = fields(patchShelfSchema);

  it("refuses an empty body at form", () => {
    expect(refused({})).toEqual({ form: "Nothing to change." });
  });

  it("takes a name alone and a description alone", () => {
    expect(patchShelfSchema.parse({ name: " New " })).toEqual({ name: "New" });
    expect(patchShelfSchema.parse({ description: "" })).toEqual({
      description: "",
    });
  });

  it("refuses a blank name", () => {
    expect(refused({ name: "" })).toEqual({ name: "Give the shelf a name." });
  });
});

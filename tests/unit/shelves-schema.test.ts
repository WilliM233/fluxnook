import { describe, expect, it } from "vitest";
import {
  createShelfSchema,
  listShelvesQuerySchema,
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

describe("listShelvesQuerySchema", () => {
  const a = "7a1b2c3d-0000-4000-8000-0000000000a1";
  const b = "7a1b2c3d-0000-4000-8000-0000000000b2";
  const refused = (query: unknown) => {
    const parsed = listShelvesQuerySchema.safeParse(query);
    if (parsed.success) throw new Error("parsed");
    return fieldErrors(parsed.error);
  };

  it("asks about nothing with neither", () => {
    expect(listShelvesQuerySchema.parse({})).toEqual({ items: [] });
  });

  it("asks about one work with item, folded", () => {
    expect(listShelvesQuerySchema.parse({ item: a.toUpperCase() })).toEqual({
      items: [a],
    });
  });

  it("asks about many with items, comma-separated, trimmed and folded", () => {
    expect(
      listShelvesQuerySchema.parse({ items: `${a}, ${b.toUpperCase()}` }),
    ).toEqual({ items: [a, b] });
  });

  it("refuses an id that isn't one, at its field", () => {
    expect(refused({ item: "nope" })).toEqual({ item: "A work's id." });
    expect(refused({ items: `${a},nope` })).toEqual({
      items: "Each one a work's id.",
    });
    expect(refused({ items: "" })).toEqual({ items: "Each one a work's id." });
  });

  it("refuses both at once", () => {
    expect(refused({ item: a, items: b })).toEqual({
      items: "One question at a time: item, or items.",
    });
  });

  it("refuses 201, and takes 200 (B1: what a signed-in URL carries)", () => {
    const ids = (n: number) =>
      Array.from(
        { length: n },
        (_, i) => `7a1b2c3d-0000-4000-8000-${String(i).padStart(12, "0")}`,
      ).join(",");
    expect(refused({ items: ids(201) })).toEqual({
      items: "At most 200 works in one go.",
    });
    expect(
      listShelvesQuerySchema.parse({ items: ids(200) }).items,
    ).toHaveLength(200);
  });

  it("refuses a work twice, in any case", () => {
    expect(refused({ items: `${a},${a.toUpperCase()}` })).toEqual({
      items: "Each work once.",
    });
  });

  it("refuses a stray key", () => {
    expect(refused({ shelf: a })).toEqual({
      shelf: "Not a field for this type.",
    });
  });
});

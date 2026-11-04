import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  copiesQuerySchema,
  createCopySchema,
  patchCopySchema,
} from "@/app/api/v1/copies/schema";
import { fieldErrors } from "@/lib/api/fields";

// The copy routes' bodies (Ch 1.7 A3): the two doors, the future date, the
// length, the empty PATCH.

const edition = "7A1B2C3D-0000-4000-8000-0000000000A1";
const item = "7A1B2C3D-0000-4000-8000-000000000001";
const DOOR = "Say which printing, or which work and format.";

const fields = (
  schema: typeof createCopySchema | typeof patchCopySchema,
  body: unknown,
) => {
  const parsed = schema.safeParse(body);
  if (parsed.success) throw new Error("expected a refusal");
  return fieldErrors(parsed.error);
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 4, 12));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createCopySchema, the doors", () => {
  it("takes a printing, the id lowercased", () => {
    expect(createCopySchema.parse({ edition })).toEqual({
      edition: edition.toLowerCase(),
    });
  });

  it("takes a work and a format, the id lowercased", () => {
    expect(createCopySchema.parse({ item, format: "hardcover" })).toEqual({
      item: item.toLowerCase(),
      format: "hardcover",
    });
  });

  it("refuses neither and both at form", () => {
    expect(fields(createCopySchema, {})).toEqual({ form: DOOR });
    expect(fields(createCopySchema, { edition, item })).toEqual({ form: DOOR });
    expect(
      fields(createCopySchema, { edition, item, format: "paperback" }),
    ).toEqual({ form: DOOR });
    expect(fields(createCopySchema, { edition, format: "paperback" })).toEqual({
      form: DOOR,
    });
  });

  it("refuses a work without a format at format", () => {
    expect(fields(createCopySchema, { item })).toEqual({
      format: "Say which format.",
    });
  });

  it("refuses a word outside the vocabulary at format", () => {
    expect(fields(createCopySchema, { item, format: "vhs" })).toEqual({
      format: "That isn't a format.",
    });
  });

  it("refuses an id that isn't one, and a stray key", () => {
    expect(fields(createCopySchema, { edition: "nope" })).toHaveProperty(
      "edition",
    );
    expect(fields(createCopySchema, { edition, owner: "me" })).toEqual({
      owner: "Not a field for this type.",
    });
  });
});

describe("a copy's fields", () => {
  const body = (over: object) => ({ edition, ...over });
  const CONDITION = "A condition is new, fine, good, fair or poor.";

  it("condition: the five words and null pass, mint is refused", () => {
    for (const condition of ["new", "fine", "good", "fair", "poor", null]) {
      expect(createCopySchema.safeParse(body({ condition })).success).toBe(
        true,
      );
    }
    expect(fields(createCopySchema, body({ condition: "mint" }))).toEqual({
      condition: CONDITION,
    });
  });

  it("acquiredOn: today and null pass; tomorrow, February 30th and year 0 are refused", () => {
    expect(
      createCopySchema.safeParse(body({ acquiredOn: "2026-11-04" })).success,
    ).toBe(true);
    expect(createCopySchema.safeParse(body({ acquiredOn: null })).success).toBe(
      true,
    );
    expect(
      fields(createCopySchema, body({ acquiredOn: "2026-11-05" })),
    ).toEqual({
      acquiredOn: "A day you'll have it isn't a day you have it.",
    });
    expect(
      fields(createCopySchema, body({ acquiredOn: "2026-02-30" })),
    ).toEqual({
      acquiredOn: "A date as YYYY-MM-DD.",
    });
    expect(
      fields(createCopySchema, body({ acquiredOn: "0000-01-01" })),
    ).toEqual({
      acquiredOn: "There was no year 0.",
    });
  });

  it("note: trimmed, invisibles at the edges gone, line breaks inside kept", () => {
    expect(createCopySchema.parse(body({ note: "​  One\nTwo ﻿" }))).toMatchObject(
      { note: "One\nTwo" },
    );
  });

  it("note: 2,000 passes, 2,001 and a NUL are refused", () => {
    expect(
      createCopySchema.safeParse(body({ note: "x".repeat(2_000) })).success,
    ).toBe(true);
    expect(fields(createCopySchema, body({ note: "x".repeat(2_001) }))).toEqual(
      {
        note: "At most 2,000 characters.",
      },
    );
    expect(fields(createCopySchema, body({ note: "a\0b" }))).toEqual({
      note: "That has a character the collection can't hold.",
    });
  });
});

describe("patchCopySchema", () => {
  it("refuses an empty change at form", () => {
    expect(fields(patchCopySchema, {})).toEqual({ form: "Nothing to change." });
  });

  it("takes an empty note, and null to clear", () => {
    expect(patchCopySchema.parse({ note: "" })).toEqual({ note: "" });
    expect(patchCopySchema.parse({ condition: null })).toEqual({
      condition: null,
    });
    expect(patchCopySchema.parse({ acquiredOn: null })).toEqual({
      acquiredOn: null,
    });
  });

  it("refuses a printing, which never changes", () => {
    expect(fields(patchCopySchema, { edition })).toHaveProperty(
      "edition",
      "Not a field for this type.",
    );
  });

  it("holds the same rules", () => {
    expect(fields(patchCopySchema, { acquiredOn: "2026-11-05" })).toEqual({
      acquiredOn: "A day you'll have it isn't a day you have it.",
    });
    expect(fields(patchCopySchema, { condition: "mint" })).toHaveProperty(
      "condition",
    );
  });
});

describe("copiesQuerySchema", () => {
  it("takes a work's id, lowercased, and refuses anything else", () => {
    expect(copiesQuerySchema.parse({ item })).toEqual({
      item: item.toLowerCase(),
    });
    expect(copiesQuerySchema.safeParse({ item: "nope" }).success).toBe(false);
    expect(copiesQuerySchema.safeParse({}).success).toBe(false);
  });
});

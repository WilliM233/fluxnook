import { describe, expect, it } from "vitest";
import {
  createReadSchema,
  patchReadSchema,
} from "@/app/api/v1/occurrences/schema";
import { fieldErrors } from "@/lib/api/fields";

// The read routes' bodies (Ch 1.6 A3): half steps, the date rules, the
// first entry's anchor both or neither.

const item = "7A1B2C3D-0000-4000-8000-000000000001";
const HALF = "Stars go in half steps from 0.5 to 5.";

const fields = (
  schema: typeof createReadSchema | typeof patchReadSchema,
  body: unknown,
) => {
  const parsed = schema.safeParse(body);
  if (parsed.success) throw new Error("expected a refusal");
  return fieldErrors(parsed.error);
};

describe("createReadSchema", () => {
  it("takes a read, the item lowercased", () => {
    expect(
      createReadSchema.parse({
        item,
        status: "done",
        startedOn: "2026-10-28",
        finishedOn: "2026-11-02",
        stars: 4.5,
      }),
    ).toEqual({
      item: item.toLowerCase(),
      status: "done",
      startedOn: "2026-10-28",
      finishedOn: "2026-11-02",
      stars: 4.5,
    });
  });

  it("refuses a status it doesn't know", () => {
    expect(
      fields(createReadSchema, { item, status: "reading" }),
    ).toHaveProperty("status");
  });

  it("stars in half steps from 0.5 to 5, or null", () => {
    for (const stars of [4.3, 0, 5.5, -1]) {
      expect(fields(createReadSchema, { item, status: "done", stars })).toEqual(
        {
          stars: HALF,
        },
      );
    }
    for (const stars of [4.5, 0.5, 5, null]) {
      expect(
        createReadSchema.safeParse({ item, status: "done", stars }).success,
      ).toBe(true);
    }
    expect(
      fields(createReadSchema, { item, status: "done", stars: "4" }),
    ).toEqual({ stars: HALF });
  });

  it("dates are YYYY-MM-DD and real", () => {
    expect(
      fields(createReadSchema, {
        item,
        status: "done",
        startedOn: "2026-13-01",
      }),
    ).toHaveProperty("startedOn");
    expect(
      fields(createReadSchema, { item, status: "done", finishedOn: "2 Nov" }),
    ).toHaveProperty("finishedOn");
  });

  it("Finished before Started is refused at finishedOn", () => {
    expect(
      fields(createReadSchema, {
        item,
        status: "done",
        startedOn: "2026-11-02",
        finishedOn: "2026-10-28",
      }),
    ).toEqual({ finishedOn: "Finished can't be before Started." });
  });

  it("a Reading read has no Finished", () => {
    expect(
      fields(createReadSchema, {
        item,
        status: "in_progress",
        finishedOn: "2026-11-02",
      }),
    ).toEqual({ finishedOn: "Still going, so no Finished date yet." });
  });

  it("a first entry's body is trimmed at its ends, line breaks kept", () => {
    const parsed = createReadSchema.parse({
      item,
      status: "done",
      entry: { body: "  a\n\nb  " },
    });
    expect(parsed.entry).toEqual({ body: "a\n\nb" });
  });

  it("a first entry's body is 1 to 20,000 characters with no NUL", () => {
    const entry = (body: string) => ({ item, status: "done", entry: { body } });
    expect(fields(createReadSchema, entry("   "))).toEqual({
      "entry.body": "Write something.",
    });
    expect(fields(createReadSchema, entry("x".repeat(20_001)))).toEqual({
      "entry.body": "At most 20,000 characters.",
    });
    expect(createReadSchema.safeParse(entry("x".repeat(20_000))).success).toBe(
      true,
    );
    expect(fields(createReadSchema, entry("a\0b"))).toHaveProperty(
      "entry.body",
    );
  });

  it("an anchor is both kind and value or neither", () => {
    const entry = (more: object) => ({
      item,
      status: "done",
      entry: { body: "x", ...more },
    });
    expect(fields(createReadSchema, entry({ anchorKind: "page" }))).toEqual({
      "entry.anchorValue": "Say where, or leave both out.",
    });
    expect(fields(createReadSchema, entry({ anchorValue: "112" }))).toEqual({
      "entry.anchorKind": "Say where, or leave both out.",
    });
    expect(
      createReadSchema.safeParse(
        entry({ anchorKind: "page", anchorValue: "112" }),
      ).success,
    ).toBe(true);
  });

  it("refuses a key it doesn't know", () => {
    expect(
      fields(createReadSchema, { item, status: "done", visibility: "public" }),
    ).toEqual({ visibility: "Not a field for this type." });
  });
});

describe("patchReadSchema", () => {
  it("{} is Nothing to change.", () => {
    expect(fields(patchReadSchema, {})).toEqual({ form: "Nothing to change." });
  });

  it("takes one change, and null to clear", () => {
    for (const body of [
      { stars: null },
      { finishedOn: null },
      { status: "done" },
      { stars: 3.5 },
    ]) {
      expect(patchReadSchema.parse(body)).toEqual(body);
    }
  });

  it("the same rules: half steps and the date order", () => {
    expect(fields(patchReadSchema, { stars: 4.3 })).toEqual({ stars: HALF });
    expect(
      fields(patchReadSchema, {
        startedOn: "2026-11-02",
        finishedOn: "2026-10-28",
      }),
    ).toEqual({ finishedOn: "Finished can't be before Started." });
  });
});

import { describe, expect, it } from "vitest";
import {
  createEntrySchema,
  patchEntrySchema,
} from "@/app/api/v1/occurrences/[id]/entries/schema";
import { fieldErrors } from "@/lib/api/fields";

// The entry routes' bodies (Ch 1.6 A4): plain text with its line breaks, the
// anchor pair together, a settable time that isn't in the future.

const BOTH = "Say where, or leave both out.";

const fields = (
  schema: typeof createEntrySchema | typeof patchEntrySchema,
  body: unknown,
) => {
  const parsed = schema.safeParse(body);
  if (parsed.success) throw new Error("expected a refusal");
  return fieldErrors(parsed.error);
};

describe("createEntrySchema", () => {
  it("passes writtenAt on as the string given, microseconds and all", () => {
    for (const writtenAt of [
      "2026-11-02T21:14:03Z",
      "2026-11-02T21:14:03.512345+00:00",
      "2019-03-09T15:14:03.512345-06:00",
    ]) {
      expect(createEntrySchema.parse({ body: "x", writtenAt })).toEqual({
        body: "x",
        writtenAt,
      });
    }
  });

  it("refuses a bare date and a time with no zone", () => {
    expect(
      fields(createEntrySchema, { body: "x", writtenAt: "2026-11-02" }),
    ).toHaveProperty("writtenAt");
    expect(
      fields(createEntrySchema, { body: "x", writtenAt: "2026-11-02T21:14" }),
    ).toHaveProperty("writtenAt");
  });

  it("refuses a time two minutes ahead; thirty seconds ahead is the clock", () => {
    const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();
    expect(
      fields(createEntrySchema, { body: "x", writtenAt: ahead(120_000) }),
    ).toEqual({ writtenAt: "That's in the future." });
    expect(
      createEntrySchema.safeParse({ body: "x", writtenAt: ahead(30_000) })
        .success,
    ).toBe(true);
  });

  it("the body: trimmed at its ends, line breaks kept, 1 to 20,000, no NUL", () => {
    expect(createEntrySchema.parse({ body: "\n a\n\nb \n" }).body).toBe(
      "a\n\nb",
    );
    expect(fields(createEntrySchema, { body: " \n " })).toEqual({
      body: "Write something.",
    });
    expect(fields(createEntrySchema, { body: "x".repeat(20_001) })).toEqual({
      body: "At most 20,000 characters.",
    });
    expect(fields(createEntrySchema, { body: "a\0b" })).toHaveProperty("body");
    expect(fields(createEntrySchema, {})).toHaveProperty("body");
  });

  it("the anchor pair: both or neither", () => {
    expect(
      fields(createEntrySchema, { body: "x", anchorKind: "page" }),
    ).toEqual({ anchorValue: BOTH });
    expect(
      fields(createEntrySchema, { body: "x", anchorValue: "112" }),
    ).toEqual({ anchorKind: BOTH });
    expect(
      createEntrySchema.parse({
        body: "x",
        anchorKind: "page",
        anchorValue: " 112 ",
      }),
    ).toEqual({ body: "x", anchorKind: "page", anchorValue: "112" });
    expect(
      fields(createEntrySchema, {
        body: "x",
        anchorKind: "page",
        anchorValue: "x".repeat(41),
      }),
    ).toEqual({ anchorValue: "At most 40 characters." });
    expect(
      fields(createEntrySchema, {
        body: "x",
        anchorKind: "verse",
        anchorValue: "3",
      }),
    ).toHaveProperty("anchorKind");
  });

  it("refuses a key it doesn't know", () => {
    expect(fields(createEntrySchema, { body: "x", occurrence: "y" })).toEqual({
      occurrence: "Not a field for this type.",
    });
  });
});

describe("patchEntrySchema", () => {
  it("{} is Nothing to change.", () => {
    expect(fields(patchEntrySchema, {})).toEqual({
      form: "Nothing to change.",
    });
  });

  it("the body alone and the time alone pass", () => {
    expect(patchEntrySchema.parse({ body: "Again." })).toEqual({
      body: "Again.",
    });
    expect(
      patchEntrySchema.parse({ writtenAt: "2026-10-29T08:00:00Z" }),
    ).toEqual({ writtenAt: "2026-10-29T08:00:00Z" });
  });

  it("the anchor keys together: one alone is refused, null both clears", () => {
    expect(fields(patchEntrySchema, { anchorKind: "page" })).toEqual({
      anchorValue: BOTH,
    });
    expect(
      patchEntrySchema.parse({ anchorKind: null, anchorValue: null }),
    ).toEqual({ anchorKind: null, anchorValue: null });
    expect(
      fields(patchEntrySchema, { anchorKind: "page", anchorValue: null }),
    ).toEqual({ anchorValue: BOTH });
    expect(
      fields(patchEntrySchema, { anchorKind: null, anchorValue: "112" }),
    ).toEqual({ anchorKind: BOTH });
  });
});

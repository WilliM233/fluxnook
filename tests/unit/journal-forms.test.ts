import { describe, expect, it } from "vitest";
import {
  createEntrySchema,
  patchEntrySchema,
} from "@/app/api/v1/occurrences/[id]/entries/schema";
import {
  createReadSchema,
  patchReadSchema,
} from "@/app/api/v1/occurrences/schema";
import {
  entryChange,
  entryPost,
  isoFromLocal,
  localFromIso,
  localNow,
  localToday,
  type ReadForm,
  readChange,
  readPost,
} from "@/lib/journal/forms";

// The sheets as data (Ch 1.6 A6, A7), with L's two notes from 1.6.1's
// sign-off: Reading sends finishedOn as null, and today is local parts.

const ITEM = "0b5f7c3e-6a1d-4c1e-9f0a-2d3b4c5d6e7f";
const NO_ENTRY = { body: "", anchorKind: "" as const, anchorValue: "" };
const done: ReadForm = {
  status: "done",
  startedOn: "2026-10-28",
  finishedOn: "2026-11-02",
  stars: 4.5,
};

describe("localToday and localNow", () => {
  // Built from local parts, so 23:30 on the 2nd is the 2nd in every zone,
  // where toISOString().slice would read the 3rd in Chicago.
  const late = new Date(2026, 10, 2, 23, 30);

  it("today is the box's date, not UTC's", () => {
    expect(localToday(late)).toBe("2026-11-02");
  });

  it("now is a datetime-local value to the minute", () => {
    expect(localNow(late)).toBe("2026-11-02T23:30");
  });

  it("a local value goes to the route as the same instant, and back", () => {
    const iso = isoFromLocal("2026-11-02T23:30") as string;
    expect(new Date(iso).getTime()).toBe(late.getTime());
    expect(localFromIso(iso)).toBe("2026-11-02T23:30");
  });

  it("a stored instant with microseconds shows to its minute", () => {
    const at = new Date(Date.UTC(2026, 10, 2, 21, 14, 3, 512));
    expect(localFromIso("2026-11-02T21:14:03.512345Z")).toBe(localNow(at));
  });

  it("an empty or broken value is no instant", () => {
    expect(isoFromLocal("")).toBeNull();
    expect(isoFromLocal("not a time")).toBeNull();
  });
});

describe("readPost", () => {
  it("Reading sends finishedOn as null, never stripped (L's note 1)", () => {
    const body = readPost(
      ITEM,
      { ...done, status: "in_progress", stars: null },
      NO_ENTRY,
    );
    expect(body).toHaveProperty("finishedOn", null);
    expect(body).toHaveProperty("startedOn", "2026-10-28");
    expect(createReadSchema.safeParse(body).success).toBe(true);
  });

  it("Done sends both dates and the stars", () => {
    expect(readPost(ITEM, done, NO_ENTRY)).toEqual({
      item: ITEM,
      status: "done",
      startedOn: "2026-10-28",
      finishedOn: "2026-11-02",
      stars: 4.5,
    });
  });

  it("an empty Started and no stars are sent as null", () => {
    const body = readPost(
      ITEM,
      { ...done, startedOn: "", stars: null },
      NO_ENTRY,
    );
    expect(body).toHaveProperty("startedOn", null);
    expect(body).toHaveProperty("stars", null);
    expect(createReadSchema.safeParse(body).success).toBe(true);
  });

  it("a blank textarea sends no entry", () => {
    const body = readPost(ITEM, done, { ...NO_ENTRY, body: "  \n " });
    expect(body).not.toHaveProperty("entry");
  });

  it("a place with no words sends the entry, for the route to refuse (R4)", () => {
    const body = readPost(ITEM, done, {
      body: "",
      anchorKind: "page",
      anchorValue: "112",
    });
    expect(body.entry).toEqual({
      body: "",
      anchorKind: "page",
      anchorValue: "112",
    });
    const parsed = createReadSchema.safeParse(body);
    expect(parsed.error?.issues[0].path).toEqual(["entry", "body"]);
  });

  it("a kind with no place pins nothing", () => {
    const body = readPost(ITEM, done, {
      body: "Finished in a weekend.",
      anchorKind: "page",
      anchorValue: " ",
    });
    expect(body.entry).toEqual({ body: "Finished in a weekend." });
    expect(createReadSchema.safeParse(body).success).toBe(true);
  });

  it("a page and a place pin the first entry", () => {
    const body = readPost(ITEM, done, {
      body: "Finished in a weekend.",
      anchorKind: "page",
      anchorValue: "112",
    });
    expect(body.entry).toEqual({
      body: "Finished in a weekend.",
      anchorKind: "page",
      anchorValue: "112",
    });
    expect(createReadSchema.safeParse(body).success).toBe(true);
  });
});

describe("readChange", () => {
  it("sends the four keys and never an entry", () => {
    expect(readChange(done)).toEqual({
      status: "done",
      startedOn: "2026-10-28",
      finishedOn: "2026-11-02",
      stars: 4.5,
    });
  });

  it("Reading clears Finished and Clear clears the stars", () => {
    const body = readChange({ ...done, status: "in_progress", stars: null });
    expect(body).toHaveProperty("finishedOn", null);
    expect(body).toHaveProperty("stars", null);
    expect(patchReadSchema.safeParse(body).success).toBe(true);
  });
});

describe("entryPost and entryChange", () => {
  const opened = "2026-11-02T21:14";
  const form = {
    body: "Ben Mears comes home.",
    anchorKind: "chapter" as const,
    anchorValue: "1",
    writtenAt: opened,
  };

  // The moment of the save: the field still shows its minute.
  const saved = new Date(2026, 10, 2, 21, 14, 37, 512);

  it("an add showing this minute sends now to the millisecond", () => {
    const body = entryPost(form, saved);
    expect(body).toEqual({
      body: "Ben Mears comes home.",
      anchorKind: "chapter",
      anchorValue: "1",
      writtenAt: saved.toISOString(),
    });
    expect(createEntrySchema.safeParse(body).success).toBe(true);
  });

  it("an add left open past the minute sends the time it shows (R6)", () => {
    const later = new Date(2026, 10, 2, 21, 19, 5);
    const body = entryPost(form, later);
    expect(new Date(body.writtenAt as string).getTime()).toBe(
      new Date(2026, 10, 2, 21, 14).getTime(),
    );
  });

  it("an add set back sends the instant the field shows", () => {
    const body = entryPost({ ...form, writtenAt: "2019-03-09T21:14" }, saved);
    expect(new Date(body.writtenAt as string).getTime()).toBe(
      new Date(2019, 2, 9, 21, 14).getTime(),
    );
    expect(createEntrySchema.safeParse(body).success).toBe(true);
  });

  it("an edit with the time untouched has no writtenAt", () => {
    expect(entryChange(form, opened)).not.toHaveProperty("writtenAt");
  });

  it("an edit with the place cleared sends the pair as null", () => {
    const body = entryChange({ ...form, anchorValue: "" }, opened);
    expect(body).toEqual({
      body: "Ben Mears comes home.",
      anchorKind: null,
      anchorValue: null,
    });
    expect(patchEntrySchema.safeParse(body).success).toBe(true);
  });
});

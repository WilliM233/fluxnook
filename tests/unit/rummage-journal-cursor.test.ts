import { describe, expect, it } from "vitest";
import { parseCursor } from "@/lib/journal/cursor";

// Ch 1.6.3 Rummage R1: a `before` that has the cursor's shape but names no
// instant (February 30th, a thirteenth month, year zero) passes the regex
// and then throws at `::timestamptz`, so `/journal?before=…` answers a 500
// where A8 says the in-shell 404. A timestamp is an instant, not a shape.

const ID = "3f2b8c1e-9a4d-4c6b-8e2f-1a7d5c9b0e44";

describe("R1 the cursor refuses a timestamp Postgres can't read", () => {
  it("a day, a month or a year that doesn't exist is null, not a cursor", () => {
    for (const at of [
      "2026-02-30T00:00:00.000000Z",
      "2026-13-01T00:00:00.000000Z",
      "0000-01-01T00:00:00.000000Z",
      "2026-11-03T25:00:00.000000Z",
      "2026-11-03T23:61:00.000000Z",
    ]) {
      expect(parseCursor(`${at},${ID}`), at).toBeNull();
    }
  });

  it("a real instant still parses", () => {
    expect(parseCursor(`2024-02-29T23:59:59.999999Z,${ID}`)).toEqual({
      writtenAt: "2024-02-29T23:59:59.999999Z",
      id: ID,
    });
  });
});

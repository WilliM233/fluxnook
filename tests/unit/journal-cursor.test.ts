import { describe, expect, it } from "vitest";
import { nextCursor, PAGE, parseCursor } from "@/lib/journal/cursor";

// The Journal page's keyset cursor (Ch 1.6 A8, census C1): the timestamp as
// Postgres prints it in UTC with microseconds, a comma, the entry's uuid.

const ID = "3f2b8c1e-9a4d-4c6b-8e2f-1a7d5c9b0e44";
const AT = "2026-11-02T21:14:03.512345Z";

describe("the cursor", () => {
  it("is 50 a page", () => {
    expect(PAGE).toBe(50);
  });

  it("round-trips through nextCursor and parseCursor", () => {
    const before = nextCursor({ at: AT, id: ID });
    expect(before).toBe(`${AT},${ID}`);
    expect(parseCursor(before)).toEqual({ at: AT, id: ID });
  });

  it("lowercases an uppercase uuid", () => {
    expect(parseCursor(`${AT},${ID.toUpperCase()}`)).toEqual({
      at: AT,
      id: ID,
    });
  });

  it("refuses anything else", () => {
    for (const before of [
      `2026-11-02T21:14:03.512Z,${ID}`,
      `${AT}${ID}`,
      `${AT},not-a-uuid`,
      "yesterday",
      `${AT},${ID},more`,
      [`${AT},${ID}`, `${AT},${ID}`],
      undefined,
      "",
    ]) {
      expect(parseCursor(before)).toBeNull();
    }
  });
});

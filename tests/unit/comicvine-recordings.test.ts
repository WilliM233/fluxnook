import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The Comic Vine recordings are committed, so nothing in them may carry the
// key the recorder used, and each is an answer the client would accept.

const DIR = join(process.cwd(), "tests/fixtures/comicvine");
const files = readdirSync(DIR).filter((name) => name.endsWith(".json"));

describe("the Comic Vine recordings", () => {
  it("exist", () => {
    expect(files.length).toBeGreaterThanOrEqual(9);
  });

  it.each(files)("%s is an OK envelope with no key in it", (name) => {
    const text = readFileSync(join(DIR, name), "utf8");
    expect(text).not.toMatch(/api_key=[^&"\s]/);
    const body = JSON.parse(text);
    expect(body.status_code).toBe(1);
    expect(body.error).toBe("OK");
  });

  it.each(files.filter((name) => name.startsWith("search-")))(
    "%s holds at most one page of twenty",
    (name) => {
      const body = JSON.parse(readFileSync(join(DIR, name), "utf8"));
      expect(body.results.length).toBeLessThanOrEqual(20);
    },
  );
});

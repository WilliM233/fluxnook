import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOpenLibrary } from "@/lib/providers/openlibrary";
import {
  type OpenLibraryStub,
  startOpenLibraryStub,
} from "../stub/openlibrary";

// Rummage R2 (Ch 1.3). The plan reads `pages` below 1 as null so the check
// constraint never refuses an import; the mapping stops there. `editions.pages`
// is a Postgres `integer`, and Open Library's `number_of_pages` is free data:
// a value past 2,147,483,647 passes `positiveInteger`, reaches the insert, and
// the whole edition import (work and all) answers 500 for a valid ISBN. A page
// count the column can't hold is no page count.

const DIR = join(process.cwd(), "tests/fixtures/openlibrary");
const carrieEdition = JSON.parse(
  readFileSync(join(DIR, "books-OL32864645M.json"), "utf8"),
);

let tmp: string;
let stub: OpenLibraryStub;

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), "rummage-ol-junk-"));
  writeFileSync(
    join(tmp, "books-OL9000001M.json"),
    JSON.stringify({
      ...carrieEdition,
      key: "/books/OL9000001M",
      number_of_pages: 2_147_483_648,
    }),
  );
  stub = await startOpenLibraryStub({ dir: tmp });
});

afterAll(async () => {
  await stub.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe("edition mapping", () => {
  it("reads a page count past a Postgres integer as null, like 0 and below", async () => {
    const ol = createOpenLibrary({
      baseUrl: stub.baseUrl,
      coversBaseUrl: stub.coversBaseUrl,
      userAgent: "test",
    });
    const edition = await ol.edition("books/OL9000001M");
    expect(edition.pages).toBeNull();
  });
});

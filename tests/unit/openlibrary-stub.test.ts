import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type OpenLibraryStub,
  startOpenLibraryStub,
} from "../stub/openlibrary";

// The seam: OPENLIBRARY_BASE_URL pointed at the stub is all a test needs. The
// stub answers /isbn/ the way Open Library does, with a 302 to the edition.

const edition = { key: "/books/OL1M", isbn_13: ["9780307743664"] };
const work = { key: "/works/OL1W", title: "Stub" };
let dir: string;
let stub: OpenLibraryStub;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "openlibrary-stub-"));
  writeFileSync(join(dir, "books-OL1M.json"), JSON.stringify(edition));
  writeFileSync(join(dir, "works-OL1W.json"), JSON.stringify(work));
  stub = await startOpenLibraryStub({ dir });
});

afterAll(async () => {
  await stub.close();
  rmSync(dir, { recursive: true, force: true });
});

const get = (path: string, init?: RequestInit) =>
  fetch(`${stub.baseUrl}${path}`, { redirect: "manual", ...init });

describe("the Open Library stub", () => {
  it("serves a recording by path, and a missing one is a 404", async () => {
    const found = await get("/works/OL1W.json");
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual(work);
    expect((await get("/works/OL2W.json")).status).toBe(404);
  });

  it("answers a known ISBN with a 302 to its edition", async () => {
    const response = await get("/isbn/9780307743664.json");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `${stub.baseUrl}/books/OL1M.json`,
    );
  });

  it("answers an unknown ISBN with a 404", async () => {
    expect((await get("/isbn/9781501142970.json")).status).toBe(404);
  });

  it("an unrecorded search is the empty page", async () => {
    const response = await get("/search.json?q=nothing&page=1");
    expect(await response.json()).toEqual({
      numFound: 0,
      start: 0,
      docs: [],
    });
  });

  it("a search for __down__ is a 500", async () => {
    expect((await get("/search.json?q=__down__")).status).toBe(500);
  });

  it("serves a JPEG cover, and a 404 for cover id 404", async () => {
    const cover = await fetch(`${stub.coversBaseUrl}/b/id/5-L.jpg`);
    expect(cover.status).toBe(200);
    expect(cover.headers.get("content-type")).toBe("image/jpeg");
    expect((await fetch(`${stub.coversBaseUrl}/b/id/404-L.jpg`)).status).toBe(
      404,
    );
  });

  it("remembers each request's User-Agent", async () => {
    await get("/works/OL1W.json", { headers: { "user-agent": "Fluxnook/t" } });
    expect(stub.requests.at(-1)).toEqual({
      path: "/works/OL1W.json",
      userAgent: "Fluxnook/t",
    });
  });
});

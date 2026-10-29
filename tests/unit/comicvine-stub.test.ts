import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  BUSY_QUERY,
  type ComicVineStub,
  DOWN_QUERY,
  startComicVineStub,
} from "../stub/comicvine";

// The seam: COMICVINE_BASE_URL pointed at the stub's /api is all a test
// needs. The query string names a file only through the search words, the
// volume filter and the offset; the key and the rest are ignored.

const volume = { status_code: 1, error: "OK", results: { id: 1 } };
const page = (offset: number) => ({
  status_code: 1,
  error: "OK",
  number_of_total_results: 150,
  results: [{ id: offset + 1 }],
});
const search = { status_code: 1, error: "OK", results: [{ id: 9 }] };
let dir: string;
let stub: ComicVineStub;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "comicvine-stub-"));
  writeFileSync(join(dir, "volume-1.json"), JSON.stringify(volume));
  writeFileSync(join(dir, "issues-1-o0.json"), JSON.stringify(page(0)));
  writeFileSync(join(dir, "issues-1-o100.json"), JSON.stringify(page(100)));
  writeFileSync(join(dir, "search-turtles-p1.json"), JSON.stringify(search));
  stub = await startComicVineStub({ dir });
});

afterAll(async () => {
  await stub.close();
  rmSync(dir, { recursive: true, force: true });
});

const get = (path: string, init?: RequestInit) =>
  fetch(`${stub.origin}${path}`, init);

describe("the Comic Vine stub", () => {
  it("answers /health and puts its API under /api", async () => {
    expect(await (await get("/health")).json()).toEqual({ ok: true });
    expect(stub.baseUrl).toBe(`${stub.origin}/api`);
  });

  it("serves a volume by its prefixed path, and an unknown one is Comic Vine's 404", async () => {
    const found = await get("/api/volume/4050-1/?api_key=x&format=json");
    expect(await found.json()).toEqual(volume);
    const missing = await get("/api/volume/4050-2/");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ status_code: 101 });
  });

  it("serves a volume's issues by filter and offset", async () => {
    const first = await get("/api/issues/?filter=volume:1&offset=0&limit=100");
    expect((await first.json()).results).toEqual([{ id: 1 }]);
    const second = await get("/api/issues/?filter=volume:1&offset=100");
    expect((await second.json()).results).toEqual([{ id: 101 }]);
  });

  it("a volume with no issues recording answers 500 naming the file", async () => {
    const said = vi.spyOn(console, "error").mockImplementation(() => {});
    const none = await get("/api/issues/?filter=volume:2&offset=0");
    expect(none.status).toBe(500);
    expect(await none.json()).toEqual({
      error: "no recording: issues-2-o0.json",
    });
    await get("/api/issues/?filter=volume:2&offset=0");
    expect(said).toHaveBeenCalledTimes(1);
    expect(said).toHaveBeenCalledWith(
      "comicvine:stub: no recording: issues-2-o0.json",
    );
    said.mockRestore();
  });

  it("a page that isn't on disk answers 500, never an empty list", async () => {
    const said = vi.spyOn(console, "error").mockImplementation(() => {});
    const past = await get("/api/issues/?filter=volume:1&offset=200");
    expect(past.status).toBe(500);
    expect((await past.json()).error).toBe("no recording: issues-1-o200.json");
    expect((await get("/api/issues/")).status).toBe(500);
    said.mockRestore();
  });

  it("serves a recorded search, and an unrecorded one is an empty OK", async () => {
    expect(await (await get("/api/search/?query=Turtles")).json()).toEqual(
      search,
    );
    expect(
      await (await get("/api/search/?query=nothing")).json(),
    ).toMatchObject({
      status_code: 1,
      number_of_total_results: 0,
      results: [],
    });
  });

  it("answers the down sentinel with a 500 and the busy one with the velocity error", async () => {
    expect((await get(`/api/search/?query=${DOWN_QUERY}`)).status).toBe(500);
    const busy = await get(`/api/search/?query=${BUSY_QUERY}`);
    expect(busy.status).toBe(200);
    expect((await busy.json()).error).toMatch(/velocity/);
  });

  it("serves a pixel for any cover under the image path", async () => {
    const cover = await get("/a/uploads/original/0/77/105-1.jpg");
    expect(cover.headers.get("content-type")).toBe("image/jpeg");
    expect((await cover.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("an image whose name starts with missing- answers 404", async () => {
    const gone = await get("/a/uploads/original/0/77/missing-105-1.jpg");
    expect(gone.status).toBe(404);
    const kept = await get("/a/uploads/original/0/77/not-missing-1.jpg");
    expect(kept.headers.get("content-type")).toBe("image/jpeg");
  });

  it("answers 500 to anything under /broken/", async () => {
    expect((await get("/broken/api/search/?query=x")).status).toBe(500);
  });

  it("remembers each request's path and User-Agent", async () => {
    await get("/api/search/?query=logged", {
      headers: { "user-agent": "Fluxnook/test" },
    });
    expect(stub.requests.at(-1)).toEqual({
      path: "/api/search/?query=logged",
      userAgent: "Fluxnook/test",
    });
  });
});

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTmdb,
  ProviderError,
  ProviderNotConfigured,
} from "@/lib/providers/tmdb";
import { startTmdbStub, type TmdbStub } from "../stub/tmdb";

// The seam: TMDB_BASE_URL pointed at the stub is all a test needs, and no
// request leaves the client without a token.

const movie = { id: 1, title: "Stub" };
let dir: string;
let stub: TmdbStub;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "tmdb-stub-"));
  writeFileSync(join(dir, "movie-1.json"), JSON.stringify(movie));
  stub = await startTmdbStub({ dir });
});

afterAll(async () => {
  await stub.close();
  rmSync(dir, { recursive: true, force: true });
});

const client = (apiKey: string | null) =>
  createTmdb({
    apiKey,
    baseUrl: stub.baseUrl,
    imageBaseUrl: stub.imageBaseUrl,
  });

describe("the TMDB stub through the client", () => {
  it("serves a recording by path, with the token as a bearer", async () => {
    expect(await client("stub-token").get("/movie/1")).toEqual(movie);
    expect(stub.requests.at(-1)).toEqual({
      path: "/3/movie/1",
      authorization: "Bearer stub-token",
    });
  });

  it("a missing recording is TMDB's 404, as a ProviderError", async () => {
    const error = await client("stub")
      .get("/movie/2")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).status).toBe(404);
  });

  it("no token is ProviderNotConfigured, before any request", async () => {
    const before = stub.requests.length;
    await expect(client(null).get("/movie/1")).rejects.toBeInstanceOf(
      ProviderNotConfigured,
    );
    expect(stub.requests.length).toBe(before);
  });

  it("an unrecorded search is TMDB's empty page", async () => {
    expect(
      await client("stub").get("/search/multi", { query: "zzz", page: 1 }),
    ).toEqual({ page: 1, results: [], total_pages: 0, total_results: 0 });
  });

  it("serves a JPEG poster, and a 500 under /broken", async () => {
    const poster = await fetch(`${stub.imageBaseUrl}/w500/x.jpg`);
    expect(poster.status).toBe(200);
    expect(poster.headers.get("content-type")).toBe("image/jpeg");
    expect((await poster.arrayBuffer()).byteLength).toBeGreaterThan(0);
    const origin = new URL(stub.baseUrl).origin;
    expect((await fetch(`${origin}/broken/t/p/w500/x.jpg`)).status).toBe(500);
  });
});

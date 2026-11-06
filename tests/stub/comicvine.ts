import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { issuesFileName, searchFileName, volumeFileName } from "./names";
import { PIXEL } from "./tmdb";

// The Comic Vine stub: serves the recordings under tests/fixtures/comicvine by
// path, with the query string read only for what names a file (the search
// words, the volume filter, the offset), and a 1x1 JPEG for every cover but a
// `missing-` one, so tests and the Browse never need Comic Vine or a key. An
// issue list it has no recording for is a 500 naming the file. Plain
// node:http; it remembers each request's path and User-Agent.

// From the repo root, where every runner starts: Playwright loads this file as
// CommonJS, so import.meta is not available.
const RECORDINGS = join(process.cwd(), "tests/fixtures/comicvine");

/** Where covers sit, as in the client (`IMAGE_PATH`). */
const IMAGE_PATH = "/a/uploads/";

/** A search for this is a 500, so an e2e can see the unavailable line. */
export const DOWN_QUERY = "__comicvine_down__";
/** A search for this is Comic Vine's velocity error behind a 200. */
export const BUSY_QUERY = "__comicvine_busy__";

const envelope = (results: unknown[]) =>
  JSON.stringify({
    status_code: 1,
    error: "OK",
    limit: 0,
    offset: 0,
    number_of_page_results: results.length,
    number_of_total_results: results.length,
    results,
  });
const EMPTY = envelope([]);
const NOT_FOUND = JSON.stringify({
  status_code: 101,
  error: "Object Not Found",
  results: [],
});
// The status_code number is unverified: the probe never tripped the limit
// (plan Deferral). The client reads the words, not the number.
const BUSY = JSON.stringify({
  status_code: 107,
  error:
    "Your velocity has exceeded the maximum allowed for this API. Please wait before making another request.",
  results: [],
});

export type ComicVineStubRequest = { path: string; userAgent: string | null };

export type ComicVineStub = {
  origin: string;
  baseUrl: string;
  requests: ComicVineStubRequest[];
  close: () => Promise<void>;
};

async function readJson(dir: string, name: string) {
  try {
    return await readFile(join(dir, name), "utf8");
  } catch {
    return null;
  }
}

/** Starts the stub; port 0 picks a free one. The API lives under `/api`. */
export async function startComicVineStub({
  port = 0,
  dir = RECORDINGS,
}: {
  port?: number;
  dir?: string;
} = {}): Promise<ComicVineStub> {
  const requests: ComicVineStubRequest[] = [];
  const unrecorded = new Set<string>();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://stub");
    const json = (status: number, body: string) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(body);
    };
    if (url.pathname === "/health") return json(200, '{"ok":true}');
    requests.push({
      path: `${url.pathname}${url.search}`,
      userAgent: req.headers["user-agent"] ?? null,
    });

    if (url.pathname.startsWith("/broken/")) {
      res.writeHead(500);
      return res.end();
    }
    if (url.pathname.startsWith(IMAGE_PATH)) {
      // A cover that's gone, for the red that proves an import outlives it.
      if (url.pathname.split("/").pop()?.startsWith("missing-")) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, { "content-type": "image/jpeg" });
      return res.end(PIXEL);
    }
    if (url.pathname === "/api/search/") {
      const query = url.searchParams.get("query") ?? "";
      if (query === DOWN_QUERY) return json(500, "{}");
      if (query === BUSY_QUERY) return json(200, BUSY);
      return json(
        200,
        (await readJson(dir, searchFileName(query, 1))) ?? EMPTY,
      );
    }
    const volume = url.pathname.match(/^\/api\/volume\/4050-([0-9]+)\/$/);
    if (volume) {
      const body = await readJson(dir, volumeFileName(Number(volume[1])));
      return body ? json(200, body) : json(404, NOT_FOUND);
    }
    if (url.pathname === "/api/issues/") {
      const id = (url.searchParams.get("filter") ?? "").match(
        /^volume:([0-9]+)$/,
      )?.[1];
      const offset = Number(url.searchParams.get("offset") ?? "0");
      const file = id ? issuesFileName(Number(id), offset) : null;
      const body = file ? await readJson(dir, file) : null;
      if (body) return json(200, body);
      // A run with no recording is no answer, never a run of zero issues
      // that an import would take silently (1.4.1 N2).
      const why = `no recording: ${file ?? "issues without a volume filter"}`;
      if (!unrecorded.has(why)) {
        unrecorded.add(why);
        console.error(`comicvine:stub: ${why}`);
      }
      return json(500, JSON.stringify({ error: why }));
    }
    return json(404, NOT_FOUND);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    origin,
    baseUrl: `${origin}/api`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

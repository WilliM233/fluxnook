import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { searchFileName } from "./names";
import { PIXEL } from "./tmdb";

// The Open Library stub: serves the recordings under tests/fixtures/openlibrary
// by path, answers /isbn/ with the 302 to /books/ the real one sends, and a
// 1x1 JPEG for every cover, so tests and the Browse never need Open Library.
// Plain node:http; it remembers each request's path and User-Agent.

// From the repo root, where every runner starts: Playwright loads this file as
// CommonJS, so import.meta is not available.
const RECORDINGS = join(process.cwd(), "tests/fixtures/openlibrary");

const NOT_FOUND = JSON.stringify({ error: "notfound" });
const EMPTY_SEARCH = JSON.stringify({ numFound: 0, start: 0, docs: [] });

/** A search for this is a 500, so an e2e can see the unavailable line. */
export const DOWN_QUERY = "__down__";

export type OpenLibraryStubRequest = { path: string; userAgent: string | null };

export type OpenLibraryStub = {
  baseUrl: string;
  coversBaseUrl: string;
  requests: OpenLibraryStubRequest[];
  close: () => Promise<void>;
};

async function readJson(dir: string, name: string) {
  try {
    return await readFile(join(dir, name), "utf8");
  } catch {
    return null;
  }
}

/** The `books-<id>.json` whose ISBN-13s or ISBN-10s hold `isbn`, or null. */
async function editionFor(dir: string, isbn: string) {
  const names = (await readdir(dir)).filter((n) => /^books-.+\.json$/.test(n));
  for (const name of names) {
    const body = JSON.parse((await readJson(dir, name)) ?? "{}");
    const isbns = [...(body.isbn_13 ?? []), ...(body.isbn_10 ?? [])];
    if (isbns.includes(isbn))
      return name.slice("books-".length, -".json".length);
  }
  return null;
}

/** Starts the stub; port 0 picks a free one. */
export async function startOpenLibraryStub({
  port = 0,
  dir = RECORDINGS,
}: {
  port?: number;
  dir?: string;
} = {}): Promise<OpenLibraryStub> {
  const requests: OpenLibraryStubRequest[] = [];
  let origin = "";

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
    const cover = url.pathname.match(/^\/b\/id\/([0-9]+)-[SML]\.jpg$/);
    if (cover) {
      if (cover[1] === "404") return json(404, NOT_FOUND);
      res.writeHead(200, { "content-type": "image/jpeg" });
      return res.end(PIXEL);
    }
    if (url.pathname === "/search.json") {
      const query = url.searchParams.get("q") ?? "";
      if (query === DOWN_QUERY) return json(500, "{}");
      const page = Number(url.searchParams.get("page") ?? "1");
      const body = await readJson(dir, searchFileName(query, page));
      return json(200, body ?? EMPTY_SEARCH);
    }
    // The off-host redirect, for the client's same-host rule: a client whose
    // base URL is <origin>/offhost is sent somewhere it must not follow.
    if (/^\/offhost\/isbn\/[0-9X]+\.json$/.test(url.pathname)) {
      res.writeHead(302, { location: "http://127.0.0.1:1/books/x.json" });
      return res.end();
    }
    const isbn = url.pathname.match(/^\/isbn\/([0-9X]+)\.json$/);
    if (isbn) {
      const id = await editionFor(dir, isbn[1]);
      if (!id) return json(404, NOT_FOUND);
      res.writeHead(302, { location: `${origin}/books/${id}.json` });
      return res.end();
    }
    const record = url.pathname.match(
      /^\/(works|authors|books)\/(OL[0-9]+[WAM])\.json$/,
    );
    if (record) {
      const body = await readJson(dir, `${record[1]}-${record[2]}.json`);
      return body ? json(200, body) : json(404, NOT_FOUND);
    }
    return json(404, NOT_FOUND);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    baseUrl: origin,
    coversBaseUrl: origin,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

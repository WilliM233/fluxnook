import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { searchFileName } from "./names";

export { searchFileName };

// The TMDB stub: serves the recordings under tests/fixtures/tmdb by path and a
// 1x1 JPEG for every poster, so tests and the Browse never need TMDB or a key.
// Plain node:http; it ignores the Authorization header but remembers it.

// From the repo root, where every runner starts: Playwright loads this file as
// CommonJS, so import.meta is not available.
const RECORDINGS = join(process.cwd(), "tests/fixtures/tmdb");

// A 1x1 lavender JPEG, encoded by Chromium's canvas. The Open Library stub
// serves it too.
export const PIXEL = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABAb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCkgKg9/9k=",
  "base64",
);

const NOT_FOUND = {
  success: false,
  status_code: 34,
  status_message: "The resource you requested could not be found.",
};

export type StubRequest = { path: string; authorization: string | null };

export type TmdbStub = {
  baseUrl: string;
  imageBaseUrl: string;
  requests: StubRequest[];
  close: () => Promise<void>;
};

async function readJson(dir: string, name: string) {
  try {
    return await readFile(join(dir, name), "utf8");
  } catch {
    return null;
  }
}

/** Starts the stub; port 0 picks a free one. */
export async function startTmdbStub({
  port = 0,
  dir = RECORDINGS,
}: {
  port?: number;
  dir?: string;
} = {}): Promise<TmdbStub> {
  const requests: StubRequest[] = [];

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://stub");
    const json = (status: number, body: string) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(body);
    };
    if (url.pathname === "/health") return json(200, '{"ok":true}');
    requests.push({
      path: `${url.pathname}${url.search}`,
      authorization: req.headers.authorization ?? null,
    });

    if (url.pathname.startsWith("/broken/")) {
      res.writeHead(500);
      return res.end();
    }
    if (/^\/t\/p\/w[0-9]+\/[A-Za-z0-9]+\.(jpg|png)$/.test(url.pathname)) {
      res.writeHead(200, { "content-type": "image/jpeg" });
      return res.end(PIXEL);
    }
    if (url.pathname === "/3/search/multi") {
      const query = url.searchParams.get("query") ?? "";
      const page = Number(url.searchParams.get("page") ?? "1");
      const body = await readJson(dir, searchFileName(query, page));
      return json(
        200,
        body ??
          JSON.stringify({
            page,
            results: [],
            total_pages: 0,
            total_results: 0,
          }),
      );
    }
    const details = url.pathname.match(/^\/3\/(movie|tv)\/(\d+)$/);
    if (details) {
      const body = await readJson(dir, `${details[1]}-${details[2]}.json`);
      return body ? json(200, body) : json(404, JSON.stringify(NOT_FOUND));
    }
    return json(404, JSON.stringify(NOT_FOUND));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    baseUrl: `${origin}/3`,
    imageBaseUrl: `${origin}/t/p`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

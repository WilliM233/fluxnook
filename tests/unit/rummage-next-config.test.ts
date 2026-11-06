import { expect, it } from "vitest";
import nextConfig from "../../next.config";

// Rummage R5 (1.4.1). Comic Vine's key rides the query string, and Next's
// dev server prints every patched fetch's URL (host, path and the first
// sixteen characters of the query, `api_key=` and seven of the key) the
// moment `logging.fetches` is set in next.config.ts
// (next/dist/server/dev/log-requests.js, logFetchMetric). The client can't
// stop that; this is the guard. Seen red by setting `logging: { fetches:
// true }` and reverting, as 0.3's R11 did for the Playwright config.

it("next.config.ts never turns fetch logging on", () => {
  expect(nextConfig.logging).toBeUndefined();
});

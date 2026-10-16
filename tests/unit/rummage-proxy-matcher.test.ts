import { createRequire } from "node:module";
import type { ProxyMatcher } from "next/dist/build/analysis/get-page-static-info";
import { getMiddlewareRouteMatcher } from "next/dist/shared/lib/router/utils/middleware-route-matcher";
import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

// Rummage R1. Compiles src/proxy.ts's matcher with Next's own matcher code, so
// the answer is what Next does, not what a hand-rolled RegExp thinks it does.
// getMiddlewareMatchers is exported at runtime but not in Next's .d.ts.
const { getMiddlewareMatchers } = createRequire(import.meta.url)(
  "next/dist/build/analysis/get-page-static-info",
) as {
  getMiddlewareMatchers: (
    matcher: string[],
    nextConfig: object,
  ) => ProxyMatcher[];
};
const runsProxy = getMiddlewareRouteMatcher(
  getMiddlewareMatchers(config.matcher, {}),
);
const matches = (path: string) => runsProxy(path, {} as never, {});

describe("proxy matcher (session refresh)", () => {
  it("skips static image files", () => {
    expect(matches("/logo.png")).toBe(false);
    expect(matches("/_next/static/chunk.js")).toBe(false);
  });

  it.each([
    "/nook",
    "/api/v1/me",
    // Pages whose last segment merely ends in an image extension's letters.
    "/shelves/mexico",
    "/nook/comics/frank-miller-ronin-png",
    "/api/v1/entries/epic-gif",
  ])("refreshes the session on %s", (path) => {
    expect(matches(path)).toBe(true);
  });
});

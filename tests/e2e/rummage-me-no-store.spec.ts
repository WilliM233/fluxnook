import { expect, test } from "@playwright/test";

// Rummage R5. /api/v1/me is per-person. Pages get Cache-Control: no-store from
// Next; this route handler gets no Cache-Control at all, so whatever sits in
// front of it (the Volume 2 host, a proxy) decides whether one reader's
// { id, email } is served to the next.
test("api/v1/me is never cacheable", async ({ request }) => {
  const response = await request.get("/api/v1/me");
  expect(response.headers()["cache-control"] ?? "").toMatch(/no-store/);
});

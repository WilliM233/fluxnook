import { expect, test } from "@playwright/test";

test("api/v1/me is 401 without a session", async ({ request }) => {
  const response = await request.get("/api/v1/me");
  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({
    error: { code: "unauthorized" },
  });
});

test("/nook redirects to / without a session", async ({ page }) => {
  await page.goto("/nook");
  await expect(page).toHaveURL("/");
});

test("magic-link rejects a bad email with 400", async ({ request }) => {
  const response = await request.post("/api/v1/auth/magic-link", {
    data: { email: "not-an-email" },
  });
  expect(response.status()).toBe(400);
  expect(await response.json()).toMatchObject({
    error: { code: "invalid_request" },
  });
});

test("callback without a code goes to /?error=link", async ({ request }) => {
  const response = await request.get("/api/v1/auth/callback", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toBe("http://localhost:3000/?error=link");
});

test("tmdb search is 401 without a session", async ({ request }) => {
  const response = await request.get("/api/v1/providers/tmdb/search?q=carrie");
  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({
    error: { code: "unauthorized" },
  });
});

test("import is 401 without a session", async ({ request }) => {
  const response = await request.post("/api/v1/items/import", {
    data: { source: "tmdb", key: "movie/133805" },
  });
  expect(response.status()).toBe(401);
});

test("manual items are 401 without a session", async ({ request }) => {
  const response = await request.post("/api/v1/items", {
    data: { type: "film", title: "Carrie" },
  });
  expect(response.status()).toBe(401);
});

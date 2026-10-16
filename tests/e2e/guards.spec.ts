import { expect, test } from "@playwright/test";

test("api/v1/me is 401 without a session", async ({ request }) => {
  const response = await request.get("/api/v1/me");
  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({
    error: { code: "unauthorized" },
  });
});

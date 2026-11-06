import { expect, test } from "@playwright/test";
import { OPENLIBRARY_STUB_ORIGIN } from "./harness/openlibrary-stub";

// globalSetup started the Open Library stub where webServer.env points the app.
test("the Open Library stub answers on its port", async ({ request }) => {
  const response = await request.get(`${OPENLIBRARY_STUB_ORIGIN}/health`);
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});

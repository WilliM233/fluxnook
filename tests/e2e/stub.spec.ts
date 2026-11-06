import { expect, test } from "@playwright/test";
import { TMDB_STUB_ORIGIN } from "./harness/tmdb-stub";

// globalSetup started the TMDB stub where webServer.env points the app.
test("the TMDB stub answers on its port", async ({ request }) => {
  const response = await request.get(`${TMDB_STUB_ORIGIN}/health`);
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});

import { test as base, expect, type Page } from "@playwright/test";
import { waitForMagicLink } from "./mailpit";

/**
 * A page signed in as a brand-new user, and that user's address.
 *
 * Each test gets its own fresh account through the real magic-link round
 * trip: ask for a link, read it from Mailpit, follow it, land on /nook. It
 * costs about a second per test and needs the local stack up (`npx supabase
 * start`, Mailpit on 54324). Nothing is shared between tests.
 *
 *   import { expect, test } from "./harness/signed-in";
 *
 *   test("my shelf starts empty", async ({ signedIn: { page, email } }) => {
 *     await page.goto("/nook");
 *   });
 *
 * GoTrue's local limits allow about 30 sign-ins per five minutes per IP
 * (`supabase/config.toml`, `[auth.rate_limit]`); a 429 here means a suite
 * has outgrown one sign-in per test.
 */
export const test = base.extend<{ signedIn: { page: Page; email: string } }>({
  signedIn: async ({ page }, use) => {
    const email = `e2e-${crypto.randomUUID()}@example.com`;

    // page.request shares the page's cookie jar, so the PKCE verifier set by
    // this request is there when the page follows the link. A separate
    // request context would fail at the callback.
    const asked = await page.request.post("/api/v1/auth/magic-link", {
      data: { email },
    });
    expect(asked.status()).toBe(204);

    await page.goto(await waitForMagicLink(page.request, email));
    await expect(page).toHaveURL("/nook");

    await use({ page, email });
  },
});

export { expect };

import { expect, test } from "@playwright/test";
import { waitForMagicLink } from "./harness/mailpit";

// Rummage R5 (ch 0.3). Mailpit's `to:` search matches a substring, so mail to
// x<address> answers a search for <address>. With the signedIn fixture's
// UUID addresses that never collides; with the exported helper and any
// address a later spec picks, it hands back someone else's link.
test("waitForMagicLink ignores mail to a longer address that contains this one", async ({
  page,
}) => {
  const email = `${crypto.randomUUID()}@example.com`;
  const asked = await page.request.post("/api/v1/auth/magic-link", {
    data: { email: `x${email}` },
  });
  expect(asked.status()).toBe(204);

  await expect(waitForMagicLink(page.request, email)).rejects.toThrow();
});

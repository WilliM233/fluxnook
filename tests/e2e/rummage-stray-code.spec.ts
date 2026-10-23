import { expect, test } from "@playwright/test";

// Rummage R4. When emailRedirectTo isn't in additional_redirect_urls (the app
// on 127.0.0.1, or `next dev` moved to :3001 because :3000 was busy), GoTrue
// falls back to site_url and the link lands on http://localhost:3000/?code=…
// Today that renders a blank sign-in form: no session, no word about the link.
test("a link that lands on /?code= says it didn't work", async ({ page }) => {
  await page.goto("/?code=stray-code-from-site-url-fallback");
  // Filtered: Next's route announcer is also role="alert", and empty.
  await expect(
    page.getByRole("alert").filter({ hasText: "link didn't work" }),
  ).toBeVisible();
});

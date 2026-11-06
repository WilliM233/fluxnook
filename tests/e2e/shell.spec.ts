import { expect, test as plain } from "@playwright/test";
import { waitForMagicLink } from "./harness/mailpit";
import { test } from "./harness/signed-in";

// A1: the signed-in shell in Deep Field, and the sign-in page outside it.

test("a signed-in page has the header, the TMDB footer and the look", async ({
  signedIn: { page, email },
}) => {
  await expect(page).toHaveURL("/nook");
  const header = page.getByRole("banner");
  await expect(header.getByText(email)).toBeVisible();
  await expect(header.getByRole("link", { name: "Search" })).toHaveAttribute(
    "href",
    "/search",
  );
  await expect(
    header.getByRole("link", { name: "Nook", exact: true }),
  ).toBeVisible();
  await expect(header.getByRole("link", { name: "Journal" })).toHaveAttribute(
    "href",
    "/journal",
  );
  await expect(
    header.getByRole("link", { name: "Collection" }),
  ).toHaveAttribute("href", "/collection");
  await expect(header.getByRole("navigation").getByRole("link")).toHaveText([
    "Search",
    "Nook",
    "Journal",
    "Collection",
  ]);
  await expect(header.getByRole("button", { name: "Sign out" })).toBeVisible();

  const footer = page.getByRole("contentinfo");
  await expect(
    footer.getByText(
      "This product uses the TMDB API but is not endorsed or certified by TMDB.",
    ),
  ).toBeVisible();
  await expect(footer.getByRole("img", { name: "TMDB" })).toBeVisible();
  await expect(footer.getByText("Book data from Open Library.")).toBeVisible();
  await expect(
    footer.getByRole("link", { name: "Open Library" }),
  ).toHaveAttribute("href", "https://openlibrary.org");
  await expect(footer.getByText("Comic data from Comic Vine.")).toBeVisible();
  await expect(
    footer.getByRole("link", { name: "Comic Vine" }),
  ).toHaveAttribute("href", "https://comicvine.gamespot.com");

  await expect(
    page.getByRole("heading", { name: "Your nook", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  ).toBe("rgb(14, 11, 23)");
  expect(
    await page
      .getByRole("heading", { level: 1 })
      .evaluate((h1) => getComputedStyle(h1).fontFamily),
  ).toContain("Fraunces");
});

// A UUID's hyphens are no help: Firefox won't break one before a digit, so a
// signed-in fixture's address wrapped or didn't by its random digits, and
// Nightly's R8 and R9 went red on the header, not their rows (Ch 1.8 A2).
plain(
  "an address with nowhere to break doesn't push a phone sideways",
  async ({ page }) => {
    const email = `e2e${crypto.randomUUID().replaceAll("-", "")}@example.com`;
    const asked = await page.request.post("/api/v1/auth/magic-link", {
      data: { email },
    });
    expect(asked.status()).toBe(204);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(await waitForMagicLink(page.request, email));
    await expect(page).toHaveURL("/nook");
    await expect(page.getByRole("banner").getByText(email)).toBeVisible();

    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBe(0);
    await expect(
      page.getByRole("banner").getByRole("button", { name: "Sign out" }),
    ).toBeInViewport({ ratio: 1 });
  },
);

plain("the sign-in page sits outside the shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("link", { name: "Search" })).toHaveCount(0);
});

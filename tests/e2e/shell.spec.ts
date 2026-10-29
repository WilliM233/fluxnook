import { expect, test as plain } from "@playwright/test";
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

  await expect(
    page.getByRole("heading", { name: "Your nook is empty" }),
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

plain("the sign-in page sits outside the shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("link", { name: "Search" })).toHaveCount(0);
});

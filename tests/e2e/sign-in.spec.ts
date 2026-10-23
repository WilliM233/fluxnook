import { expect, test } from "@playwright/test";

test("/ shows the email sign-in form", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send me a link" }),
  ).toBeVisible();
  await expect(page.locator("input[type=password]")).toHaveCount(0);
});

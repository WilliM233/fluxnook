import { db } from "./harness/fixtures";
import { expect, test } from "./harness/signed-in";

// A9: the manual form, end to end. Each test's items go with its user.
test.afterEach(({ signedIn }) => {
  // No user when the sign-in itself failed; that failure is the one to read.
  if (!signedIn) return;
  db(`delete from items where created_by = (
        select id from auth.users where email = '${signedIn.email}')`);
});

test("The Long Walk, July 1979, lands on its own page", async ({
  signedIn: { page },
}) => {
  await page.goto("/items/new");
  await page.getByLabel("Type").selectOption("book");
  await page.getByLabel("Title").fill("The Long Walk");
  await page.getByLabel("Year").fill("1979");
  await page.getByLabel("Month, if known").fill("7");
  await page.getByLabel("Form").selectOption("novel");
  await page.getByLabel("Author").fill("Richard Bachman");
  await page.getByRole("button", { name: "Add to catalog" }).click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "The Long Walk",
  );
  const released = page.locator("dt", { hasText: "Released" }).locator("+ dd");
  await expect(released).toHaveText("July 1979");
  await expect(page.getByText("Added by hand")).toBeVisible();
  await expect(page.getByText("Novel", { exact: true })).toBeVisible();
  // The pill row and, since Ch 1.3, the Author fact both carry the name.
  const author = page.locator("dt", { hasText: "Author" }).locator("+ dd");
  await expect(author).toHaveText("Richard Bachman");
});

test("a missing author and a month with no year are named where they go", async ({
  signedIn: { page },
}) => {
  await page.goto("/items/new");
  await page.getByLabel("Title").fill("The Long Walk");
  await page.getByLabel("Form").selectOption("novel");
  await page.getByLabel("Month, if known").fill("7");
  await page.getByRole("button", { name: "Add to catalog" }).click();
  await expect(page.getByLabel("Author")).toHaveAccessibleDescription(
    "Name the author.",
  );
  await expect(page.getByLabel("Month, if known")).toHaveAccessibleDescription(
    "A month needs a year.",
  );
  await expect(page).toHaveURL("/items/new");
});

test("a show with two seasons says so on its page", async ({
  signedIn: { page },
}) => {
  await page.goto("/items/new");
  await page.getByLabel("Type").selectOption("tv");
  await page.getByLabel("Title").fill("Castle Rock");
  await page.getByLabel("Seasons").fill("2");
  await page.getByRole("button", { name: "Add to catalog" }).click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}$/);
  await expect(page.getByText("2 seasons")).toBeVisible();
});

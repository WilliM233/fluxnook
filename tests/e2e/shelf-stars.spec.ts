import type { Page } from "@playwright/test";
import { db } from "./harness/fixtures";
import { makeShelf, post } from "./harness/shelves";
import { expect, test } from "./harness/signed-in";

// A9 and A10 (Ch 1.6.3): a shelf's stars, its works' latest starred reads,
// and the offer to log under a row just marked Done.

/** A work of the test's own by its tagged title (unique across the run). */
const itemId = (title: string) =>
  db(`select id from items where title = '${title}'`);

/** A done read of a work, through A3's route. */
const logRead = (page: Page, title: string, stars: number | null) =>
  post(page, "/api/v1/occurrences", {
    item: itemId(title),
    status: "done",
    stars,
  });

test("a row's stars and read count, and the line's mean rounded half up", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, { top: 2, sections: [["A", 1]] });
  // Top1's second read is logged after its first, on the same day, so A5's
  // order puts it first and its stars are the row's.
  await logRead(page, shelf.title("Top1"), 4.5);
  await logRead(page, shelf.title("Top1"), 5);
  await logRead(page, shelf.title("Top2"), 4.5);
  await logRead(page, shelf.title("A1"), 3.5);

  await page.goto(`/shelves/${shelf.id}`);
  const row = (label: string) =>
    page.getByTestId("entry").filter({ hasText: shelf.title(label) });
  await expect(row("Top1").getByText("★ 5", { exact: true })).toBeVisible();
  await expect(
    row("Top1").getByText("watched twice", { exact: true }),
  ).toBeVisible();
  await expect(row("Top2").getByText("★ 4.5", { exact: true })).toBeVisible();
  await expect(row("Top2").getByText(/watched/)).toHaveCount(0);
  await expect(row("A1").getByText("★ 3.5", { exact: true })).toBeVisible();

  // S 26 (10 + 9 + 7), n 3: floor(263 / 6) = 43, so 4.33 prints 4.3.
  await expect(
    page.getByText("3 works · 1 section · ★ 4.3 from 3 rated", {
      exact: true,
    }),
  ).toBeVisible();
  const section = page.getByRole("region", { name: "A", exact: true });
  await expect(
    section.getByText("1 work · ★ 3.5 from 1 rated", { exact: true }),
  ).toBeVisible();
});

test("nothing rated prints no star part", async ({ signedIn: { page } }) => {
  const shelf = await makeShelf(page, { top: 1 });
  await logRead(page, shelf.title("Top1"), null);
  await page.goto(`/shelves/${shelf.id}`);
  await expect(page.getByText("1 work", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByText("★")).toHaveCount(0);
});

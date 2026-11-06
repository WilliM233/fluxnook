import type { Page } from "@playwright/test";
import { localToday } from "./harness/dates";
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

/** A row's status buttons, by its title. */
const statusOf = (page: Page, title: string) =>
  page.getByRole("group", { name: `Status of ${title}` });

/**
 * Clicks a status until it shows pressed: a click that lands before the page
 * hydrates (or while `next dev` reloads it) has no handler and sends nothing,
 * and a second click on a pressed status is a no-op.
 */
async function mark(page: Page, title: string, name: "Done" | "Skipped") {
  const group = statusOf(page, title);
  await expect(async () => {
    await group.getByRole("button", { name }).click();
    await expect(
      group.getByRole("button", { name, pressed: true }),
    ).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

/** The shelf's row for a work, by its title. */
const rowOf = (page: Page, title: string) =>
  page.getByTestId("entry").filter({ hasText: title });

const statusIn = (shelf: string) =>
  db(
    `select string_agg(status, ',' order by position) from shelf_entries where shelf = '${shelf}'`,
  );

const readsOf = (title: string) =>
  db(
    `select count(*) from occurrences where item = (select id from items where title = '${title}')`,
  );

test("Done offers to log, and Log through the sheet puts the row's stars and moves the line's mean", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, { top: 2 });
  const top1 = shelf.title("Top1");
  await page.goto(`/shelves/${shelf.id}`);
  await mark(page, top1, "Done");

  const row = rowOf(page, top1);
  await expect(row.getByText("Watched it?", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "Not now" })).toBeVisible();
  await expect(row.getByRole("button", { name: `Remove ${top1}` })).toHaveCount(
    0,
  );
  await row.getByRole("button", { name: "Log a watch" }).click();

  const sheet = page.getByRole("dialog", { name: `Log a watch of ${top1}` });
  await expect(
    sheet
      .getByRole("group", { name: "Where it stands" })
      .getByRole("button", { name: "Done", pressed: true }),
  ).toBeVisible();
  await expect(sheet.getByLabel("Finished")).toHaveValue(localToday());
  await sheet.getByRole("button", { name: "4 stars" }).press("Enter");
  await expect(sheet.getByTestId("stars-value")).toHaveText("4");
  await sheet.getByRole("button", { name: "Log it" }).click();
  await expect(sheet).toHaveCount(0);

  await expect(row.getByText("★ 4", { exact: true })).toBeVisible();
  await expect(
    row.getByRole("button", { name: `Remove ${top1}` }),
  ).toBeVisible();
  await expect(row.getByText("Watched it?")).toHaveCount(0);
  await expect(
    page.getByText("2 works · 1 done · ★ 4 from 1 rated", { exact: true }),
  ).toBeVisible();
  expect(
    db(`select stars || ',' || finished_on from occurrences
      where item = (select id from items where title = '${top1}')`),
  ).toBe(`4.0,${localToday()}`);
  expect(statusIn(shelf.id)).toBe("done,unmarked");
});

test("Log over an open watch finishes it with Done and today, and logs no second (1.6.3 N9)", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, { top: 1 });
  const top1 = shelf.title("Top1");
  await post(page, "/api/v1/occurrences", {
    item: itemId(top1),
    status: "in_progress",
    startedOn: "2020-01-05",
    stars: 3.5,
  });
  await page.goto(`/shelves/${shelf.id}`);
  await mark(page, top1, "Done");
  await rowOf(page, top1).getByRole("button", { name: "Log a watch" }).click();

  const sheet = page.getByRole("dialog", { name: "Edit this watch" });
  await expect(
    sheet
      .getByRole("group", { name: "Where it stands" })
      .getByRole("button", { name: "Done", pressed: true }),
  ).toBeVisible();
  await expect(sheet.getByLabel("Started")).toHaveValue("2020-01-05");
  await expect(sheet.getByLabel("Finished")).toHaveValue(localToday());
  await expect(sheet.getByTestId("stars-value")).toHaveText("3.5");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);

  const row = rowOf(page, top1);
  await expect(row.getByText("★ 3.5", { exact: true })).toBeVisible();
  await expect(row.getByText(/watched/)).toHaveCount(0);
  await expect(row.getByText("Watched it?")).toHaveCount(0);
  expect(
    db(`select string_agg(status || ',' || started_on || ',' || finished_on, ';')
      from occurrences where item = '${itemId(top1)}'`),
  ).toBe(`done,2020-01-05,${localToday()}`);
});

test("Not now puts Remove back and writes no read, and a reload shows Remove", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, { top: 2 });
  const [top1, top2] = [shelf.title("Top1"), shelf.title("Top2")];
  await page.goto(`/shelves/${shelf.id}`);

  await mark(page, top2, "Done");
  await rowOf(page, top2).getByRole("button", { name: "Not now" }).click();
  await expect(
    rowOf(page, top2).getByRole("button", { name: `Remove ${top2}` }),
  ).toBeVisible();
  expect(readsOf(top2)).toBe("0");

  await mark(page, top1, "Done");
  await expect(rowOf(page, top1).getByText("Watched it?")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Watched it?")).toHaveCount(0);
  for (const title of [top1, top2]) {
    await expect(
      rowOf(page, title).getByRole("button", { name: `Remove ${title}` }),
    ).toBeVisible();
  }
  expect(statusIn(shelf.id)).toBe("done,done");
  expect(readsOf(top1)).toBe("0");
});

test("a page that loads with Done shows no offer", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, { top: 1 });
  const entry = db(`select id from shelf_entries where shelf = '${shelf.id}'`);
  const response = await page.request.patch(
    `/api/v1/shelves/${shelf.id}/entries/${entry}`,
    { data: { status: "done" } },
  );
  expect(response.status()).toBe(200);
  await page.goto(`/shelves/${shelf.id}`);
  await expect(
    statusOf(page, shelf.title("Top1")).getByRole("button", {
      name: "Done",
      pressed: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Watched it?")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: `Remove ${shelf.title("Top1")}` }),
  ).toBeVisible();
});

test("Skipped after Done takes the offer away", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, { top: 1 });
  const top1 = shelf.title("Top1");
  await page.goto(`/shelves/${shelf.id}`);
  await mark(page, top1, "Done");
  await expect(page.getByText("Watched it?")).toBeVisible();
  await mark(page, top1, "Skipped");
  await expect(
    statusOf(page, top1).getByRole("button", {
      name: "Skipped",
      pressed: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Watched it?")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: `Remove ${top1}` }),
  ).toBeVisible();
});

test("the status route answered 500 by a stub shows no offer and leaves the status", async ({
  signedIn: { page },
}) => {
  const shelf = await makeShelf(page, { top: 1 });
  const top1 = shelf.title("Top1");
  await page.route(`**/api/v1/shelves/${shelf.id}/entries/*`, (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 500, body: "" })
      : route.continue(),
  );
  await page.goto(`/shelves/${shelf.id}`);
  // A click before hydration sends nothing; another 500 is the same answer.
  await expect(async () => {
    await statusOf(page, top1).getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("Couldn't save that. Try again.")).toBeVisible({
      timeout: 1_000,
    });
  }).toPass();
  await expect(
    statusOf(page, top1).getByRole("button", {
      name: "Unmarked",
      pressed: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Watched it?")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: `Remove ${top1}` }),
  ).toBeVisible();
  expect(statusIn(shelf.id)).toBe("unmarked");
});

import type { Page } from "@playwright/test";
import { db, loadFixturesFor } from "./harness/fixtures";
import { makeShelf } from "./harness/shelves";
import { expect, test } from "./harness/signed-in";

// A11 from the shelf page: the catalog with Find and Into, the rows already
// on the shelf ticked and staying put. The catalog is shared with every
// other spec in the run, so totals are read, never fixed.

const LINE =
  /^Showing (\d+) of (\d+)\. The ones already on this shelf are ticked and stay put\.$/;
const DIM =
  "A work above the first section is on the shelf, not in a section. Drag it into one, or leave it.";

async function open(page: Page) {
  await page.getByRole("button", { name: "Add works" }).click();
  return page.getByRole("dialog", { name: /^Add works to / });
}

const picks = (sheet: ReturnType<Page["getByRole"]>) =>
  sheet.getByTestId("pick");

test("Add works with the filter, Into and the ticked rows", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  const shelf = await makeShelf(page, { sections: [["Carrie", 0]] });
  await page.goto(`/shelves/${shelf.id}`);
  const sheet = await open(page);
  await expect(sheet.getByRole("heading")).toHaveText(
    `Add works to ${shelf.name}`,
  );
  await sheet.getByLabel("Find").fill("carrie");
  await expect(sheet.getByText(LINE)).toHaveText(LINE);
  const [, shown, total] =
    LINE.exec((await sheet.getByText(LINE).textContent()) ?? "") ?? [];
  expect(shown).toBe("5");
  expect(Number(total)).toBeGreaterThanOrEqual(454);

  await expect(sheet.getByTestId("pick-title")).toHaveText([
    "Carrie",
    "Carrie",
    "The Rage: Carrie 2",
    "Carrie",
    "Carrie",
  ]);
  await expect(sheet.getByTestId("pick-line")).toHaveText([
    "1974 · Stephen King",
    "1976",
    "1999",
    "2002",
    "2013",
  ]);

  await sheet.getByLabel("Into").selectOption({ label: "Carrie" });
  // Ticked out of list order: the add posts them in list order (A11).
  for (const i of [4, 3, 1, 0]) {
    await picks(sheet).nth(i).getByRole("checkbox").check();
  }
  await expect(sheet.getByText("4 picked")).toBeVisible();
  await sheet.getByRole("button", { name: "Add 4 works" }).click();

  await expect(sheet).toHaveCount(0);
  const carrie = page.getByRole("region", { name: "Carrie", exact: true });
  const rows = carrie.getByTestId("entry");
  await expect(rows).toHaveCount(4);
  for (const [i, year] of ["1974", "1976", "2002", "2013"].entries()) {
    await expect(
      rows.nth(i).getByText(String(i + 1), { exact: true }),
    ).toBeVisible();
    await expect(rows.nth(i)).toContainText(year);
  }

  const again = await open(page);
  await again.getByLabel("Find").fill("carrie");
  for (const [i, n] of [
    [0, 1],
    [1, 2],
    [3, 3],
    [4, 4],
  ]) {
    const row = picks(again).nth(i);
    await expect(row.getByRole("checkbox")).toBeChecked();
    await expect(row.getByRole("checkbox")).toBeDisabled();
    await expect(row.getByText(`on this shelf, #${n}`)).toBeVisible();
  }
  await expect(again.getByText("0 picked")).toBeVisible();
  await expect(
    again.getByRole("button", { name: "Add 0 works" }),
  ).toBeDisabled();
  expect(
    db(`select string_agg(position::text, ',' order by position) from shelf_entries
      where section = '${shelf.sections.Carrie}'`),
  ).toBe("1,2,3,4");
});

test("an empty box shows fifty and says to narrow it", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  const shelf = await makeShelf(page, {});
  await page.goto(`/shelves/${shelf.id}`);
  const sheet = await open(page);
  await expect(picks(sheet)).toHaveCount(50);
  await expect(sheet.getByText(/^Showing 50 of \d+\./)).toBeVisible();
  await expect(sheet.getByText("Narrow it to see the rest.")).toBeVisible();
});

test("At the end lands above the first section", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  const shelf = await makeShelf(page, { sections: [["A", 1]] });
  await page.goto(`/shelves/${shelf.id}`);
  const sheet = await open(page);
  await sheet.getByLabel("Find").fill("night shift");
  await expect(picks(sheet)).toHaveCount(1);
  await expect(sheet.getByLabel("Into")).toHaveValue("");
  await picks(sheet).first().getByRole("checkbox").check();
  await sheet.getByRole("button", { name: "Add 1 work" }).click();

  await expect(sheet).toHaveCount(0);
  const above = page.getByRole("list", { name: "Above the first section" });
  await expect(above.getByTestId("entry").getByRole("link")).toHaveText([
    "Night Shift",
  ]);
  await expect(
    above.getByTestId("entry").getByText("1", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(DIM)).toBeVisible();
});

test("the lede links to search", async ({ signedIn: { page } }) => {
  const shelf = await makeShelf(page, {});
  await page.goto(`/shelves/${shelf.id}`);
  const sheet = await open(page);
  await expect(
    sheet.getByRole("link", { name: "Search the providers" }),
  ).toHaveAttribute("href", "/search");
});

test("the fold finds an author and a series text", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  const shelf = await makeShelf(page, {});
  await page.goto(`/shelves/${shelf.id}`);
  const sheet = await open(page);
  await sheet.getByLabel("Find").fill("king");
  await expect(
    picks(sheet).filter({ hasText: "Stephen King" }).first(),
  ).toBeVisible();
  await expect(
    picks(sheet).filter({ hasText: "Stephen King" }).first().getByText("Book"),
  ).toBeVisible();
  await sheet.getByLabel("Find").fill("mirage");
  await expect(
    picks(sheet).first().getByText("Comic", { exact: true }),
  ).toBeVisible();
  await expect(picks(sheet).first()).toContainText("(Mirage)");
});

test("ticks survive a filter change", async ({ signedIn: { page, email } }) => {
  loadFixturesFor(email);
  const shelf = await makeShelf(page, {});
  await page.goto(`/shelves/${shelf.id}`);
  const sheet = await open(page);
  await sheet.getByLabel("Find").fill("carrie");
  await picks(sheet).first().getByRole("checkbox").check();
  await sheet.getByLabel("Find").fill("the shining");
  await picks(sheet).first().getByRole("checkbox").check();
  await expect(sheet.getByText("2 picked")).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: "Add 2 works" }),
  ).toBeEnabled();
});

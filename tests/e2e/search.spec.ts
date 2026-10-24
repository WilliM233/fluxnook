import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { db, itemFor, loadFixturesFor } from "./harness/fixtures";
import { expect, test } from "./harness/signed-in";

// A7 on the stub (globalSetup serves the carrie recordings) and the loaded
// fixtures. Serial: two tests attach to the same fixture rows, and each one
// starts from the catalog as the loader leaves it.
test.describe.configure({ mode: "serial" });

const show = JSON.parse(
  readFileSync("tests/fixtures/tmdb/tv-46157.json", "utf8"),
);
const DIARIES = `tv/${show.id}`;
const CARRIE_2013 = "movie/133805";

function resetCatalog() {
  const carrie2013 = itemFor("letterboxd", "4kC2");
  db(`delete from items where id in (
        select item from item_sources where source = 'tmdb' and key = '${DIARIES}')`);
  db(
    `delete from item_sources where source = 'tmdb' and key = '${CARRIE_2013}'`,
  );
  db(`delete from item_films where item = '${carrie2013}'`);
  db(
    `update items set summary = null, cover_path = null where id = '${carrie2013}'`,
  );
}

test.beforeEach(() => resetCatalog());
test.afterAll(() => resetCatalog());

function row(page: Page, title: string, year: number) {
  return page
    .getByRole("list", { name: "Results" })
    .getByRole("listitem")
    .filter({ has: page.getByText(title, { exact: true }) })
    .filter({ has: page.getByText(String(year), { exact: true }) });
}

test("carrie: three look like ones you have, the show is new", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  await page.goto("/search?q=carrie");
  for (const [title, year] of [
    ["Carrie", 1976],
    ["Carrie", 2013],
    ["The Rage: Carrie 2", 1999],
  ] as const) {
    const found = row(page, title, year);
    await expect(found.getByText(/Looks like one you have/)).toBeVisible();
    await expect(found.getByRole("button", { name: "Add" })).toBeVisible();
  }
  const diaries = row(page, "The Carrie Diaries", 2013);
  await expect(
    diaries.getByText(`${show.number_of_seasons} seasons`),
  ).toBeVisible();
  await expect(diaries.getByRole("button", { name: "Add" })).toBeVisible();
});

test("TV hides the films, and typing goes into the URL", async ({
  signedIn: { page },
}) => {
  await page.goto("/search?q=carrie&type=tv");
  await expect(row(page, "The Carrie Diaries", 2013)).toBeVisible();
  await expect(row(page, "Carrie", 1976)).toHaveCount(0);
  await page.getByLabel("What are you looking for?").fill("carrie diaries");
  await expect(page).toHaveURL("/search?q=carrie+diaries&type=tv");
  await page.getByRole("button", { name: "Films" }).click();
  await expect(page).toHaveURL("/search?q=carrie+diaries&type=film");
});

test("Same on Carrie (2013) attaches TMDB to the Letterboxd row", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  await page.goto("/search?q=carrie");
  await row(page, "Carrie", 2013).getByRole("button", { name: "Add" }).click();
  const sheet = page.getByRole("dialog");
  const catalog = sheet.getByRole("region", { name: "In your catalog" });
  await expect(catalog.getByText(/From Letterboxd/)).toBeVisible();
  await expect(catalog.getByText(/Stephen King Watch List/)).toBeVisible();
  await sheet
    .getByRole("button", { name: "Same, add the TMDB details to it" })
    .click();
  await expect(page).toHaveURL(`/items/${itemFor("letterboxd", "4kC2")}`);
  await expect(
    page.getByRole("img", { name: "Poster for Carrie" }),
  ).toHaveAttribute("src", /\/covers\//);
  await page.goto("/search?q=carrie");
  const attached = row(page, "Carrie", 2013);
  await expect(attached.getByText("In your catalog")).toBeVisible();
  await expect(attached.getByRole("link", { name: "Open" })).toBeVisible();
});

test("Add on The Carrie Diaries makes a show, first in the recent list", async ({
  signedIn: { page },
}) => {
  await page.goto("/search?q=carrie");
  await row(page, "The Carrie Diaries", 2013)
    .getByRole("button", { name: "Add" })
    .click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}$/);
  await expect(page.getByText("TV", { exact: true })).toBeVisible();
  await expect(
    page.getByText(new RegExp(`${show.number_of_seasons} seasons`)),
  ).toBeVisible();
  await page.goto("/search");
  const first = page
    .getByRole("region", { name: "Recently added to the catalog" })
    .getByRole("listitem")
    .first();
  await expect(first.getByText("The Carrie Diaries")).toBeVisible();
  await expect(first.getByRole("link", { name: "Open" })).toBeVisible();
});

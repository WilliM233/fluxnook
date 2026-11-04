import type { Page } from "@playwright/test";
import { db } from "./harness/fixtures";
import { expect, test } from "./harness/signed-in";

// A9's states that never touch the fixture Carrie (that walk is in
// search-books.spec.ts): a new work through its ISBN, a bad check digit, an
// ISBN Open Library doesn't know. Serial: the It test makes and removes It.
test.describe.configure({ mode: "serial" });

const IT = "works/OL81613W";

function removeIt() {
  const it = `select item from item_sources where source = 'openlibrary' and key = '${IT}'`;
  // A copy restricts its printing, and a work's editions cascade (Ch 1.7).
  db(`delete from copies where edition in (
        select id from editions where item in (${it}))`);
  db(`delete from items where id in (${it})`);
}

test.beforeEach(() => removeIt());
test.afterAll(() => removeIt());

/** The API calls the page makes, so a test can say none went out. */
function apiCalls(page: Page) {
  const calls: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.pathname.startsWith("/api/v1/providers/") ||
      url.pathname === "/api/v1/copies"
    ) {
      calls.push(url.pathname);
    }
  });
  return calls;
}

const CARD = { name: "That edition" };
const IT_ISBN = "978-1-5011-4297-0";

/** It in the catalog, through the route, and its printing's id. */
async function importIt(page: Page) {
  const looked = await page.request.get(
    "/api/v1/providers/openlibrary/isbn/9781501142970",
  );
  const { edition } = await looked.json();
  const response = await page.request.post("/api/v1/editions/import", {
    data: { source: "openlibrary", key: edition.key, format: "paperback" },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string; itemId: string };
}

test("an edition in the catalog nobody here holds: the line, Open, no In your collection, no box", async ({
  signedIn: { page },
}) => {
  await importIt(page);
  await page.goto(`/search?q=${IT_ISBN}`);
  const card = page.getByRole("article", CARD);
  await expect(card.getByText("This edition is in your catalog")).toBeVisible();
  await expect(card.getByRole("link", { name: "Open" })).toBeVisible();
  await expect(card.getByText("In your collection")).toHaveCount(0);
});

test("an edition the caller holds: the line beside In your collection on load", async ({
  signedIn: { page },
}) => {
  const { id } = await importIt(page);
  const owned = await page.request.post("/api/v1/copies", {
    data: { edition: id },
  });
  expect(owned.status()).toBe(201);
  await page.goto(`/search?q=${IT_ISBN}`);
  const card = page.getByRole("article", CARD);
  await expect(card.getByText("This edition is in your catalog")).toBeVisible();
  await expect(card.getByText("In your collection")).toBeVisible();
});

test("a new edition's lookup makes no copies call", async ({
  signedIn: { page },
}) => {
  const calls = apiCalls(page);
  await page.goto(`/search?q=${IT_ISBN}`);
  await expect(
    page.getByRole("article", CARD).getByRole("button", {
      name: "Add this edition",
    }),
  ).toBeVisible();
  expect(calls.filter((c) => c === "/api/v1/copies")).toEqual([]);
});

test("the read answered 500: the card still reads the line and Open", async ({
  signedIn: { page },
}) => {
  await importIt(page);
  await page.route(
    (url) => url.pathname === "/api/v1/copies",
    (route) => route.fulfill({ status: 500, json: { error: {} } }),
  );
  await page.goto(`/search?q=${IT_ISBN}`);
  const card = page.getByRole("article", CARD);
  await expect(card.getByText("This edition is in your catalog")).toBeVisible();
  await expect(card.getByRole("link", { name: "Open" })).toBeVisible();
  await expect(card.getByText("In your collection")).toHaveCount(0);
});

test("It by ISBN: a new work, Paperback by default, one edition on its page", async ({
  signedIn: { page },
}) => {
  const calls = apiCalls(page);
  await page.goto("/search?q=978-1-5011-4297-0");
  const card = page.getByRole("article", { name: "That edition" });
  await expect(card.getByRole("heading", { name: "It" })).toBeVisible();
  await expect(card.getByText("Scribner")).toBeVisible();
  await expect(card.getByText("2016", { exact: true })).toBeVisible();
  await expect(card.getByText("1168", { exact: true })).toBeVisible();
  await expect(card.getByLabel("Format")).toHaveValue("paperback");
  await expect(card.getByText(/Open Library says/)).toHaveCount(0);
  const work = card.getByRole("region", { name: "The work" });
  await expect(work.getByText("1987 · Stephen King")).toBeVisible();
  await expect(work.getByText(/Looks like|In your catalog/)).toHaveCount(0);
  expect(calls.filter((c) => c.endsWith("/search"))).toEqual([]);

  await card.getByRole("button", { name: "Add this edition" }).click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("It");
  await expect(page.getByText("Novel", { exact: true })).toBeVisible();
  const editions = page.getByRole("region", { name: "Editions" });
  await expect(editions.getByRole("listitem")).toHaveCount(1);
  await expect(
    editions.getByText("Scribner · 2016 · 1168 pages"),
  ).toBeVisible();
});

test("a bad check digit says so and asks nothing", async ({
  signedIn: { page },
}) => {
  const calls = apiCalls(page);
  await page.goto("/search");
  await page.getByLabel("What are you looking for?").fill("978-0-307-74366-5");
  await expect(page.getByText("That isn't a valid ISBN.")).toBeVisible();
  await page.waitForTimeout(600);
  expect(calls).toEqual([]);
});

test("an ISBN Open Library doesn't know points to the manual form", async ({
  signedIn: { page },
}) => {
  await page.goto("/search?q=9799999999990");
  await expect(
    page.getByText(
      "Open Library has no book with that ISBN. Check the digits, or add it by hand.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "by hand", exact: true }),
  ).toHaveAttribute("href", "/items/new");
});

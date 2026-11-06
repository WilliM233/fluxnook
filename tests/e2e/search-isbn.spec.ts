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
  await expect(card.getByRole("checkbox")).toHaveCount(0);
});

test("an edition the caller holds: the line beside In your collection on load, the box ticked and disabled", async ({
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
  const box = card.getByRole("checkbox", { name: "and I own it" });
  await expect(box).toBeChecked();
  await expect(box).toBeDisabled();
});

const copiesOfIt = () =>
  db(`select count(*) from copies c join editions e on e.id = c.edition
    join item_sources s on s.item = e.item
    where s.source = 'openlibrary' and s.key = '${IT}'`);
const editionsOfIt = () =>
  db(`select count(*) from editions e join item_sources s on s.item = e.item
    where s.source = 'openlibrary' and s.key = '${IT}'`);

test("the box is off by default, and Add with it off owns nothing", async ({
  signedIn: { page },
}) => {
  await page.goto(`/search?q=${IT_ISBN}`);
  const card = page.getByRole("article", CARD);
  await expect(
    card.getByRole("checkbox", { name: "and I own it" }),
  ).not.toBeChecked();
  await card.getByRole("button", { name: "Add this edition" }).click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}$/);
  await expect(page.getByText("1 in the catalog · none yours")).toBeVisible();
  expect(copiesOfIt()).toBe("0");
});

test("It with the box on: its page, 1 in the catalog, you hold 1, Your copy, one copy with no condition", async ({
  signedIn: { page },
}) => {
  await page.goto(`/search?q=${IT_ISBN}`);
  const card = page.getByRole("article", CARD);
  await card.getByRole("checkbox", { name: "and I own it" }).check();
  await card.getByRole("button", { name: "Add this edition" }).click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}$/);
  await expect(page.getByText("1 in the catalog · you hold 1")).toBeVisible();
  await expect(page.getByTestId("copy")).toContainText("Your copy");
  expect(copiesOfIt()).toBe("1");
  expect(
    db(`select condition from copies c join editions e on e.id = c.edition
      join item_sources s on s.item = e.item
      where s.source = 'openlibrary' and s.key = '${IT}'`),
  ).toBe("");

  // It again: the card the box left behind (step 9; Rummage N2).
  await page.goto(`/search?q=${IT_ISBN}`);
  const again = page.getByRole("article", CARD);
  await expect(again.getByText("In your collection")).toBeVisible();
  const box = again.getByRole("checkbox", { name: "and I own it" });
  await expect(box).toBeChecked();
  await expect(box).toBeDisabled();
});

test("the copy refused after the import: the line, the card stays, Add again owns one", async ({
  signedIn: { page },
}) => {
  let refused = false;
  await page.route(
    (url) => url.pathname === "/api/v1/copies",
    async (route) => {
      if (route.request().method() === "POST" && !refused) {
        refused = true;
        await route.fulfill({ status: 500, json: { error: {} } });
        return;
      }
      await route.fallback();
    },
  );
  await page.goto(`/search?q=${IT_ISBN}`);
  const card = page.getByRole("article", CARD);
  const box = card.getByRole("checkbox", { name: "and I own it" });
  await box.check();
  const add = card.getByRole("button", { name: "Add this edition" });
  await add.click();
  await expect(
    card.getByText("Added, but couldn't add your copy. Try again."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/search/);
  await expect(box).toBeChecked();
  expect(copiesOfIt()).toBe("0");
  expect(editionsOfIt()).toBe("1");

  await add.click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}$/);
  await expect(page.getByText("1 in the catalog · you hold 1")).toBeVisible();
  expect(copiesOfIt()).toBe("1");
  expect(editionsOfIt()).toBe("1");
});

test("Add with the box on, slowed past a second click: one edition, one copy", async ({
  signedIn: { page },
}) => {
  const gate = Promise.withResolvers<void>();
  const arrived = Promise.withResolvers<void>();
  let imports = 0;
  await page.route("**/api/v1/editions/import", async (route) => {
    imports += 1;
    arrived.resolve();
    await gate.promise;
    await route.continue();
  });
  await page.goto(`/search?q=${IT_ISBN}`);
  const card = page.getByRole("article", CARD);
  await card.getByRole("checkbox", { name: "and I own it" }).check();
  const add = card.getByRole("button", { name: "Add this edition" });
  await add.click();
  await arrived.promise;
  await add.dispatchEvent("click");
  expect(imports).toBe(1);

  gate.resolve();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}$/);
  await expect(page.getByText("1 in the catalog · you hold 1")).toBeVisible();
  expect(imports).toBe(1);
  expect(copiesOfIt()).toBe("1");
  expect(editionsOfIt()).toBe("1");
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

test("R6 the read fails at the network, not with a 500: the card still reads the line and Open", async ({
  signedIn: { page },
}) => {
  await importIt(page);
  await page.route(
    (url) => url.pathname === "/api/v1/copies",
    (route) => route.abort("connectionreset"),
  );
  await page.goto(`/search?q=${IT_ISBN}`);
  const card = page.getByRole("article", CARD);
  await expect(card.getByText("This edition is in your catalog")).toBeVisible();
  await expect(card.getByRole("link", { name: "Open" })).toBeVisible();
  await expect(card.getByText("In your collection")).toHaveCount(0);
});

test("R7 the copy landed and lost its answer: Add again still owns one", async ({
  signedIn: { page },
}) => {
  let lost = false;
  await page.route(
    (url) => url.pathname === "/api/v1/copies",
    async (route) => {
      if (route.request().method() !== "POST" || lost) return route.fallback();
      lost = true;
      await route.fetch();
      await route.abort("connectionreset");
    },
  );
  await page.goto(`/search?q=${IT_ISBN}`);
  const card = page.getByRole("article", CARD);
  await card.getByRole("checkbox", { name: "and I own it" }).check();
  const add = card.getByRole("button", { name: "Add this edition" });
  await add.click();
  await expect(
    card.getByText("Added, but couldn't add your copy. Try again."),
  ).toBeVisible();
  expect(copiesOfIt()).toBe("1");

  await add.click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/1 in the catalog/)).toBeVisible();
  // Pick 15: "so there is one edition and one copy."
  expect(copiesOfIt()).toBe("1");
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

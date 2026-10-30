import type { Page } from "@playwright/test";
import { db, itemFor, loadFixturesFor } from "./harness/fixtures";
import { expect, test } from "./harness/signed-in";

// A7 as the page reads in 1.5.1: the fixture shelves, and shelves a test
// makes through the routes.

const shelfId = (email: string, name: string) =>
  db(`select s.id from shelves s join auth.users u on u.id = s.owner
    where u.email = '${email}' and s.name = '${name.replaceAll("'", "''")}'`);

/** A film made by hand, for a shelf of the test's own. */
async function film(page: Page, title: string, year: number) {
  const response = await page.request.post("/api/v1/items", {
    data: { type: "film", title, year },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).id as string;
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data });
  expect(response.status()).toBe(201);
  return response.json();
}

test("the TMNT shelf: its header, fourteen sections in order and 326 rows numbered through", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  await page.goto(`/shelves/${shelfId(email, "TMNT, the Mirage run")}`);

  await expect(page.getByText("Shelf", { exact: true })).toBeVisible();
  await expect(page.getByText("326 works · 14 sections")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "TMNT, the Mirage run",
  );
  await expect(page.getByText(/^Mirrors the Mirage tab/)).toBeVisible();

  const headings = page.getByRole("heading", { level: 2 });
  await expect(headings).toHaveCount(14);
  await expect(headings.first()).toHaveText("Volume 1 · Main Series");
  await expect(headings.last()).toHaveText("Volume 4 · Movie tie-ins");
  const main = page.getByRole("region", { name: "Volume 1 · Main Series" });
  await expect(main.getByText("62 works", { exact: true })).toBeVisible();
  const tieIns = page.getByRole("region", { name: "Volume 4 · Movie tie-ins" });
  await expect(tieIns.getByText("9 works", { exact: true })).toBeVisible();

  const rows = page.getByTestId("entry");
  await expect(rows).toHaveCount(326);
  const first = rows.first();
  await expect(first.getByText("1", { exact: true })).toBeVisible();
  await expect(
    first.getByRole("link", { name: "The Turtles' Origin is Told" }),
  ).toHaveAttribute("href", `/items/${itemFor("manual", "tmnt-mirage-v1-1")}`);
  await expect(first.getByText("Comic", { exact: true })).toBeVisible();
  await expect(
    first.getByText("1984 · Teenage Mutant Ninja Turtles (Mirage) Vol. 1 · #1"),
  ).toBeVisible();
  await expect(rows.last().getByText("326", { exact: true })).toBeVisible();
  await expect(page.getByText(/A work above the first section/)).toHaveCount(0);
  await expect(
    page.getByText(
      "Numbers are the shelf's order, counted through the sections.",
    ),
  ).toBeVisible();
});

test("the Watch List: 61 rows, no section, a film's line its year alone", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  await page.goto(`/shelves/${shelfId(email, "Stephen King Watch List")}`);
  await expect(page.getByText("61 works", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);
  const rows = page.getByTestId("entry");
  await expect(rows).toHaveCount(61);
  const carrie = rows.filter({
    has: page.locator(`a[href="/items/${itemFor("letterboxd", "20ZQ")}"]`),
  });
  await expect(carrie.getByText("1976", { exact: true })).toBeVisible();
  await expect(carrie.getByText(/min/)).toHaveCount(0);
  await expect(carrie.getByText("no poster")).toBeVisible();
});

test("a work above the first section reads first, with the dim line under it", async ({
  signedIn: { page },
}) => {
  const tag = crypto.randomUUID().slice(0, 8);
  const [a, b, c] = [
    await film(page, `Above ${tag}`, 1990),
    await film(page, `First ${tag}`, 1991),
    await film(page, `Second ${tag}`, 1992),
  ];
  const { id } = await post(page, "/api/v1/shelves", { name: `Mixed ${tag}` });
  const { id: section } = await post(page, `/api/v1/shelves/${id}/sections`, {
    name: "Carrie",
  });
  await post(page, `/api/v1/shelves/${id}/entries`, {
    items: [b, c],
    section,
  });
  await post(page, `/api/v1/shelves/${id}/entries`, { items: [a] });

  await page.goto(`/shelves/${id}`);
  await expect(page.getByText("3 works · 1 section")).toBeVisible();
  const rows = page.getByTestId("entry");
  await expect(rows.getByRole("link")).toHaveText([
    `Above ${tag}`,
    `First ${tag}`,
    `Second ${tag}`,
  ]);
  for (const [i, n] of ["1", "2", "3"].entries()) {
    await expect(rows.nth(i).getByText(n, { exact: true })).toBeVisible();
  }
  await expect(
    page.getByText(
      "A work above the first section is on the shelf, not in a section. Drag it into one, or leave it.",
    ),
  ).toBeVisible();
  const carrie = page.getByRole("region", { name: "Carrie" });
  await expect(carrie.getByText("2 works", { exact: true })).toBeVisible();
  await expect(carrie.getByTestId("entry")).toHaveCount(2);
});

test("a skipped work's title is struck through", async ({
  signedIn: { page },
}) => {
  const tag = crypto.randomUUID().slice(0, 8);
  const work = await film(page, `Skipped ${tag}`, 2002);
  const { id } = await post(page, "/api/v1/shelves", { name: `Skips ${tag}` });
  await post(page, `/api/v1/shelves/${id}/entries`, { items: [work] });
  const entry = db(`select id from shelf_entries where shelf = '${id}'`);
  const response = await page.request.patch(
    `/api/v1/shelves/${id}/entries/${entry}`,
    { data: { status: "skipped" } },
  );
  expect(response.status()).toBe(200);

  await page.goto(`/shelves/${id}`);
  await expect(page.getByText("1 work · 1 skipped")).toBeVisible();
  const title = page.getByRole("link", { name: `Skipped ${tag}` });
  expect(
    await title.evaluate((el) => getComputedStyle(el).textDecorationLine),
  ).toContain("line-through");
});

test("an empty shelf reads 0 works and Nothing on it yet", async ({
  signedIn: { page },
}) => {
  const { id } = await post(page, "/api/v1/shelves", { name: "Empty" });
  await page.goto(`/shelves/${id}`);
  await expect(page.getByText("0 works", { exact: true })).toBeVisible();
  await expect(page.getByText("Nothing on it yet.")).toBeVisible();
  await expect(page.getByTestId("entry")).toHaveCount(0);
});

test("a uuid that is no shelf of yours, and one that isn't a uuid, are a 404 inside the shell", async ({
  signedIn: { page, email },
}) => {
  // Another person's shelf: every earlier test in this file made an account.
  const theirs = db(`with s as (
      insert into shelves (owner, name)
      select p.id, 'Not yours' from profiles p join auth.users u on u.id = p.id
      where u.email <> '${email}' limit 1
      returning id)
    select id from s`);
  expect(theirs).toMatch(/^[0-9a-f-]{36}$/);
  for (const id of [crypto.randomUUID(), "not-a-uuid", theirs]) {
    const response = await page.goto(`/shelves/${id}`);
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Search" }),
    ).toBeVisible();
  }
  db(`delete from shelves where id = '${theirs}'`);
});

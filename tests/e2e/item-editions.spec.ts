import { db, itemFor, loadFixturesFor } from "./harness/fixtures";
import { expect, test } from "./harness/signed-in";

// A10 on the fixtures and on a probe book this file makes itself. The probe
// is its own row, with its own keys and ISBN, because the search specs attach
// to the fixture Carrie side by side with this one.

const tag = crypto.randomUUID();
const WORK = "works/OL5000001W";
const BOOK = "books/OL5000001M";
// A 979 ISBN no test imports, with a real check digit.
const ISBN = "9791000000008";

let probe: string;

test.beforeAll(() => {
  probe = db(`
    with i as (
      insert into items (type, title, form, released_on, released_precision, cover_path, source_note)
      values ('book', 'Editions probe', 'novel', '1974-01-01', 'year', 'openlibrary/1.jpg', '${tag}')
      returning id),
    b as (insert into item_books (item, author) select id, 'Stephen King' from i),
    s as (
      insert into item_sources (item, source, key, url)
      select id, 'openlibrary', '${WORK}', 'https://openlibrary.org/${WORK}' from i),
    e as (
      insert into editions (item, format, released_on, released_precision, publisher, pages)
      select id, 'paperback', '2011-01-01', 'year', 'Anchor Books', 304 from i
      returning id)
    insert into edition_sources (edition, source, key, url)
    select id, 'openlibrary', '${BOOK}', 'https://openlibrary.org/${BOOK}' from e
    union all select id, 'isbn', '${ISBN}', null from e
    returning (select id from i)`).split("\n")[0];
});

test.afterAll(() => {
  db(`delete from items where source_note = '${tag}'`);
});

test("a book's printing: format, the line, the ISBN, the links, the caption", async ({
  signedIn: { page },
}) => {
  await page.goto(`/items/${probe}`);
  const editions = page.getByRole("region", { name: "Editions" });
  const row = editions.getByRole("listitem");
  await expect(row).toHaveCount(1);
  await expect(row.getByText("Paperback", { exact: true })).toBeVisible();
  await expect(row.getByText("Anchor Books · 2011 · 304 pages")).toBeVisible();
  await expect(row.getByText(`ISBN ${ISBN}`)).toBeVisible();
  await expect(row.getByRole("link", { name: "Open Library" })).toHaveAttribute(
    "href",
    `https://openlibrary.org/${BOOK}`,
  );
  await expect(
    editions.getByText("Which ones you own comes with the collection chapter."),
  ).toBeVisible();
  const sources = page.locator("dt", { hasText: "Sources" }).locator("+ dd");
  await expect(
    sources.getByRole("link", { name: "Open Library" }),
  ).toHaveAttribute("href", `https://openlibrary.org/${WORK}`);
  const author = page.locator("dt", { hasText: "Author" }).locator("+ dd");
  await expect(author).toHaveText("Stephen King");
  await expect(page.getByText("Cover from Open Library")).toBeVisible();
});

test("a comic's collected edition: hardcover and its issues, no ISBN", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  await page.goto(`/items/${itemFor("manual", "tmnt-ultimate-collection-1")}`);
  const row = page
    .getByRole("region", { name: "Editions" })
    .getByRole("listitem");
  await expect(row).toHaveCount(1);
  await expect(row.getByText("Hardcover", { exact: true })).toBeVisible();
  await expect(row.getByText(/\b8 issues\b/)).toBeVisible();
  await expect(row.getByText(/ISBN/)).toHaveCount(0);
});

test("a book with none says so", async ({ signedIn: { page } }) => {
  await page.goto(`/items/${itemFor("manual", "salems-lot-1975")}`);
  await expect(
    page
      .getByRole("region", { name: "Editions" })
      .getByText("None in the catalog yet."),
  ).toBeVisible();
});

test("a film has no Editions", async ({ signedIn: { page } }) => {
  await page.goto(`/items/${itemFor("letterboxd", "20ZQ")}`);
  await expect(page.getByRole("heading", { name: "Connected" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Editions" })).toHaveCount(0);
});

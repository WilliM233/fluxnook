import type { Page } from "@playwright/test";
import { db, itemFor, loadFixturesFor } from "./harness/fixtures";
import { expect, test } from "./harness/signed-in";

// A8 (and A9's walks that attach to the same rows) on both stubs and the
// loaded fixtures. Serial, and in one file: every test here attaches Open
// Library to the fixture Carrie or Night Shift, so each starts from the rows
// as the loader leaves them.
test.describe.configure({ mode: "serial" });

const WORKS = ["works/OL81626W", "works/OL81608W"];

// It belongs to search-isbn.spec.ts, which runs beside this file.
function resetCatalog() {
  const held = [
    itemFor("manual", "carrie-1974"),
    itemFor("manual", "night-shift-1977"),
  ];
  const ids = held.map((id) => `'${id}'`).join(", ");
  db(`delete from editions where item in (${ids})`);
  db(`delete from item_sources where source = 'openlibrary'
        and key in (${WORKS.map((k) => `'${k}'`).join(", ")})`);
  db(`update items set summary = null, cover_path = null where id in (${ids})`);
}

test.beforeEach(() => resetCatalog());
test.afterAll(() => resetCatalog());

// Open Library has other books by these titles; the King one is the row.
function bookRow(page: Page, title: string) {
  return page
    .getByRole("list", { name: "Books", exact: true })
    .getByRole("listitem")
    .filter({ has: page.getByText(title, { exact: true }) })
    .filter({ has: page.getByText(/^Stephen King · /) });
}

test("All: both groups, Carrie looks like the novel, the omnibus is new", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  await page.goto("/search?q=carrie");
  await expect(
    page.getByRole("heading", { name: /Films and TV/ }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /Books/ })).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Results" }).getByRole("listitem").first(),
  ).toBeVisible();
  const carrie = bookRow(page, "Carrie");
  await expect(
    carrie.getByText(
      "Looks like one you have: Carrie (1974) by Stephen King, added by hand",
    ),
  ).toBeVisible();
  await expect(carrie.getByText(/^Stephen King · \d+ editions$/)).toBeVisible();
  await expect(carrie.getByRole("button", { name: "Add" })).toBeVisible();
  const works = bookRow(
    page,
    "Works (Carrie / Night Shift / 'Salem's Lot / Shining)",
  );
  await expect(works.getByRole("button", { name: "Add" })).toBeVisible();
  await expect(works.getByText(/Looks like|In your catalog/)).toHaveCount(0);
  await expect(
    page.getByText("A year on a book row is Open Library's and can be off."),
  ).toBeVisible();
});

test("Books asks Open Library only, and rides the URL", async ({
  signedIn: { page },
}) => {
  await page.goto("/search?q=carrie");
  await page.getByRole("button", { name: "Books" }).click();
  await expect(page).toHaveURL("/search?q=carrie&type=book");
  await expect(bookRow(page, "Carrie")).toBeVisible();
  await expect(page.getByRole("list", { name: "Results" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Films and TV/ })).toHaveCount(
    0,
  );
});

test("Same on Carrie attaches Open Library to the novel", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  await page.goto("/search?q=carrie&type=book");
  await bookRow(page, "Carrie").getByRole("button", { name: "Add" }).click();
  const sheet = page.getByRole("dialog");
  await expect(
    sheet.getByRole("heading", { name: "Looks like one you have" }),
  ).toBeVisible();
  const catalog = sheet.getByRole("region", { name: "In your catalog" });
  await expect(catalog.getByText("1974 · Novel · Stephen King")).toBeVisible();
  await expect(
    catalog.getByText("Added by hand · on Stephen King, publication order #1"),
  ).toBeVisible();
  await sheet
    .getByRole("button", { name: "Same, add the Open Library details to it" })
    .click();
  await expect(page).toHaveURL(`/items/${itemFor("manual", "carrie-1974")}`);
  await expect(
    page.getByRole("img", { name: "Cover for Carrie" }),
  ).toHaveAttribute("src", /\/covers\/openlibrary\//);
  const sources = page.locator("dt", { hasText: "Sources" }).locator("+ dd");
  await expect(
    sources.getByRole("link", { name: "Open Library" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Editions" })).toBeVisible();
  await page.goto("/search?q=carrie&type=book");
  const attached = bookRow(page, "Carrie");
  await expect(attached.getByText("In your catalog")).toBeVisible();
  await expect(attached.getByRole("link", { name: "Open" })).toBeVisible();
});

test("Night Shift matches across the years and keeps its own", async ({
  signedIn: { page },
}) => {
  await page.goto("/search?q=night%20shift&type=book");
  const row = bookRow(page, "Night Shift");
  await expect(
    row.getByText(/Looks like one you have: Night Shift \(1977\)/),
  ).toBeVisible();
  await row.getByRole("button", { name: "Add" }).click();
  const sheet = page.getByRole("dialog");
  await expect(
    sheet.getByText(/^The years disagree \(\d+ against 1977\)/),
  ).toBeVisible();
  await expect(sheet.getByText(/the 16 stories contained in it/)).toBeVisible();
  await sheet
    .getByRole("button", { name: "Same, add the Open Library details to it" })
    .click();
  await expect(page).toHaveURL(
    `/items/${itemFor("manual", "night-shift-1977")}`,
  );
  const released = page.locator("dt", { hasText: "Released" }).locator("+ dd");
  await expect(released).toHaveText("1977");
  await expect(page.getByText("Collection", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Connected" }).getByText("Contains"),
  ).toHaveCount(16);
});

test("Open Library down: its group says so, TMDB's still answers", async ({
  signedIn: { page },
}) => {
  await page.goto("/search?q=__down__");
  await expect(
    page.getByText("Open Library didn't answer. Try again in a moment."),
  ).toBeVisible();
  await expect(page.getByText("Nothing by that name at TMDB.")).toBeVisible();
});

test("an ISBN for Carrie: the card, the sheet, the printing on the novel", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  await page.goto("/search?q=978-0-307-74366-4");
  await expect(
    page.getByRole("heading", { name: /That's an ISBN/ }),
  ).toBeVisible();
  const card = page.getByRole("article", { name: "That edition" });
  await expect(card.getByRole("heading", { name: "Carrie" })).toBeVisible();
  await expect(card.getByText("Anchor Books")).toBeVisible();
  await expect(card.getByText("2011", { exact: true })).toBeVisible();
  await expect(card.getByText("304", { exact: true })).toBeVisible();
  await expect(card.getByText("978-0-307-74366-4")).toBeVisible();
  await expect(card.getByText("0-307-74366-7")).toBeVisible();
  await expect(card.getByLabel("Format")).toHaveValue("paperback");
  await expect(
    card.getByText('Open Library says "mass market paperback"'),
  ).toBeVisible();
  const work = card.getByRole("region", { name: "The work" });
  await expect(
    work.getByText(
      "Looks like one you have: Carrie (1974) by Stephen King, added by hand. Add asks which.",
    ),
  ).toBeVisible();
  for (const chip of ["All", "Films", "TV", "Books"]) {
    await expect(page.getByRole("button", { name: chip })).toBeDisabled();
  }

  await card.getByRole("button", { name: "Add this edition" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Same, add the Open Library details to it" })
    .click();
  await expect(page).toHaveURL(`/items/${itemFor("manual", "carrie-1974")}`);
  const editions = page.getByRole("region", { name: "Editions" });
  await expect(editions.getByText("Paperback", { exact: true })).toBeVisible();
  await expect(
    editions.getByText("Anchor Books · 2011 · 304 pages"),
  ).toBeVisible();
  await expect(editions.getByText("ISBN 9780307743664")).toBeVisible();

  await page.goto("/search?q=978-0-307-74366-4");
  const again = page.getByRole("article", { name: "That edition" });
  await expect(
    again
      .getByRole("region", { name: "The work" })
      .getByText("In your catalog"),
  ).toBeVisible();
  await expect(
    again.getByText("This edition is in your catalog"),
  ).toBeVisible();
  await expect(again.getByRole("link", { name: "Open" })).toBeVisible();
});

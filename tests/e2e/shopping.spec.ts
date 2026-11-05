import type { Page } from "@playwright/test";
import { db, itemFor, loadFixturesFor } from "./harness/fixtures";
import { expect, test } from "./harness/signed-in";

// Ch 1.7 A11, on rows of this file's own under a tag, tidied after. The
// fixture's numbers are read by accounts that load them; the one test that
// makes a printing on a fixture row takes it back, so no other spec sees it.

const tag = crypto.randomUUID();

type Probe = { id: string; title: string };

function probe(type = "book", form: string | null = "novel"): Probe {
  const title = `Shopping probe ${crypto.randomUUID().slice(0, 8)}`;
  const id = db(`
    insert into items (type, title, form, source_note)
    values ('${type}', '${title}', ${form ? `'${form}'` : "null"}, '${tag}')
    returning id`).split("\n")[0];
  return { id, title };
}

const printing = (item: string, format = "paperback", publisher = "") =>
  db(`insert into editions (item, format, publisher)
    values ('${item}', '${format}', ${publisher ? `'${publisher}'` : "null"})
    returning id`).split("\n")[0];

async function post(page: Page, url: string, data: object) {
  const answer = await page.request.post(url, { data });
  expect(answer.status(), url).toBe(201);
  return (await answer.json()) as { id: string };
}

/** A shelf holding these works, through the routes. */
async function shelfOf(page: Page, name: string, works: string[]) {
  const { id } = await post(page, "/api/v1/shelves", { name });
  if (works.length > 0) {
    await post(page, `/api/v1/shelves/${id}/entries`, { items: works });
  }
  return id;
}

const copiesOf = (item: string) =>
  db(`select count(*) from copies c join editions e on e.id = c.edition
    where e.item = '${item}'`);

const sheet = (page: Page) => page.getByRole("dialog");
const shelf = (page: Page, name: string) =>
  page.getByRole("region", { name, exact: true });
const rows = (page: Page) => page.getByTestId("shopping-row");
const row = (page: Page, item: string) =>
  page.locator(`[data-testid="shopping-row"][data-item="${item}"]`);

/** Clicks until the sheet shows: a click before hydration has no handler. */
async function opensSheet(page: Page, item: string) {
  const button = row(page, item).getByRole("button", { name: "I own this" });
  await expect(async () => {
    await button.click();
    await expect(sheet(page)).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

test.afterAll(() => {
  db(`delete from copies where edition in (
    select e.id from editions e join items i on i.id = e.item
    where i.source_note = '${tag}')`);
  db(`delete from shelf_entries where item in (
    select id from items where source_note = '${tag}')`);
  db(`delete from items where source_note = '${tag}'`);
});

test("the fixture's 38 on first load: Collection's lede, the TMNT card's · 38 owned, TMNT #1's via, Shopping's 314, the three shelves' counts and 47 backups left out", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);

  await page.goto("/collection");
  await expect(
    page.getByText(
      "5 copies of 5 works, newest first. 38 more works are yours through what they collect.",
    ),
  ).toBeVisible();

  await page.goto("/nook");
  await expect(
    page.getByText("326 works · 14 sections · 38 owned", { exact: true }),
  ).toBeVisible();

  await page.goto(`/items/${itemFor("manual", "tmnt-mirage-v1-1")}`);
  await expect(
    page.getByText("Owned via Ultimate Collection 1 (Hardcover)"),
  ).toBeVisible();

  await page.goto("/collection/shopping");
  await expect(
    page.getByText(
      "314 works on your shelves you don't hold a copy of, by shelf. A work on two shelves is listed once, under the first.",
    ),
  ).toBeVisible();
  await expect(rows(page)).toHaveCount(314);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "TMNT, the Mirage run",
    "Stephen King Watch List",
    "Stephen King, publication order",
  ]);
  const tmnt = shelf(page, "TMNT, the Mirage run");
  await expect(tmnt.getByText("242 of 326 to find")).toBeVisible();
  await expect(
    tmnt.getByText("47 backups left out: you'd buy what they're printed in."),
  ).toBeVisible();
  await expect(
    tmnt.getByRole("heading", { level: 3, name: "Volume 1 · Main Series" }),
  ).toBeVisible();
  await expect(
    shelf(page, "Stephen King Watch List").getByText("61 of 61 to find"),
  ).toBeVisible();
  await expect(
    shelf(page, "Stephen King, publication order").getByText(
      "11 of 11 to find",
    ),
  ).toBeVisible();
});

test("Shopping before and after an I own this: Salem's Lot's row, Own a copy of Salem's Lot, Paperback, Add it: the row leaves, 11 to 10, 314 to 313, with no reload; Collection's button reads 313", async ({
  signedIn: { page, email },
}) => {
  loadFixturesFor(email);
  const salems = itemFor("manual", "salems-lot-1975");
  const king = "Stephen King, publication order";
  try {
    await page.goto("/collection/shopping");
    await expect(shelf(page, king).getByText("11 of 11 to find")).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { kept: boolean }).kept = true;
    });

    await opensSheet(page, salems);
    await expect(
      sheet(page).getByRole("heading", { name: "Own a copy of Salem's Lot" }),
    ).toBeVisible();
    await expect(sheet(page).getByLabel("Format")).toHaveValue(
      "format:paperback",
    );
    await sheet(page).getByRole("button", { name: "Add it" }).click();
    await expect(sheet(page)).toHaveCount(0);

    await expect(row(page, salems)).toHaveCount(0);
    await expect(shelf(page, king).getByText("10 of 11 to find")).toBeVisible();
    await expect(page.getByText(/^313 works on your shelves/)).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { kept: boolean }).kept),
    ).toBe(true);

    await page.getByRole("link", { name: "Back to your collection" }).click();
    await expect(
      page.getByRole("link", { name: "Shopping · 313 to find" }),
    ).toBeVisible();
  } finally {
    // A3 made a printing on a fixture row: another spec's Salem's Lot has none.
    db(`delete from copies where edition in (
      select id from editions where item = '${salems}')`);
    db(`delete from editions e where e.item = '${salems}'
      and not exists (select 1 from edition_sources s where s.edition = e.id)`);
  }
});

test("a row with a printing lists it first in Format, and a film's row offers DVD, Blu-ray, 4K, Digital", async ({
  signedIn: { page },
}) => {
  const book = probe();
  printing(book.id, "paperback", "Anchor Books");
  const film = probe("film", null);
  await shelfOf(page, "Printings", [book.id, film.id]);

  await page.goto("/collection/shopping");
  await opensSheet(page, book.id);
  const options = sheet(page).getByLabel("Format").locator("option");
  await expect(options.first()).toHaveText("Paperback · Anchor Books");
  await sheet(page).getByRole("button", { name: "Cancel" }).click();
  await expect(sheet(page)).toHaveCount(0);

  await expect(row(page, book.id).getByRole("button")).toBeEnabled();
  await opensSheet(page, film.id);
  await expect(sheet(page).getByLabel("Format").locator("option")).toHaveText([
    "DVD",
    "Blu-ray",
    "4K",
    "Digital",
  ]);
});

test("a shelf heading links to its shelf; the back link; no Wishlist", async ({
  signedIn: { page },
}) => {
  const id = await shelfOf(page, "Heading shelf", [probe().id]);
  await page.goto("/collection/shopping");
  await expect(
    page.getByRole("heading", { level: 2 }).getByRole("link"),
  ).toHaveAttribute("href", `/shelves/${id}`);
  await expect(
    page.getByRole("link", { name: "Back to your collection" }),
  ).toHaveAttribute("href", "/collection");
  expect((await page.content()).toLowerCase()).not.toContain("wishlist");
  await expect(page.getByText(/^Nothing here is stored/)).toBeVisible();
});

test("one work on two shelves is listed once, with Also on", async ({
  signedIn: { page },
}) => {
  const both = probe();
  await shelfOf(page, "Made first", [both.id]);
  await shelfOf(page, "Made second", [both.id]);
  await page.goto("/collection/shopping");
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByText(/^1 work on your shelves/)).toBeVisible();
  // The nook's order: newest change first.
  const first = shelf(page, "Made second");
  await expect(first.getByTestId("shopping-row")).toHaveCount(1);
  await expect(first.getByText("Also on Made first")).toBeVisible();
  const second = shelf(page, "Made first");
  await expect(second.getByTestId("shopping-row")).toHaveCount(0);
  await expect(second.getByText("1 of 1 to find")).toBeVisible();
  await expect(second.getByText("Listed under Made second.")).toBeVisible();
});

test("a shelf with nothing to find: its heading and Everything here is yours", async ({
  signedIn: { page },
}) => {
  const held = probe();
  await post(page, "/api/v1/copies", { edition: printing(held.id) });
  await shelfOf(page, "All mine", [held.id]);
  await page.goto("/collection/shopping");
  const mine = shelf(page, "All mine");
  await expect(mine.getByText("0 of 1 to find")).toBeVisible();
  await expect(mine.getByText("Everything here is yours.")).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  await expect(
    page.getByText("Nothing to find. Every work on your shelves is yours."),
  ).toBeVisible();
});

test("a refused Add it: the sheet's line, the row stays", async ({
  signedIn: { page },
}) => {
  const work = probe();
  await shelfOf(page, "Refused", [work.id]);
  await page.route("**/api/v1/copies", (route) =>
    route.fulfill({ status: 500, body: "{}" }),
  );
  await page.goto("/collection/shopping");
  await opensSheet(page, work.id);
  await sheet(page).getByRole("button", { name: "Add it" }).click();
  await expect(sheet(page).getByRole("alert")).toHaveText(
    "Couldn't add that copy just now. Try again.",
  );
  await sheet(page).getByRole("button", { name: "Cancel" }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(row(page, work.id)).toHaveCount(1);
  expect(copiesOf(work.id)).toBe("0");
});

test.describe("the door this chapter opened (the plan's pick)", () => {
  test("Add it held past a second click posts once, and the row leaves", async ({
    signedIn: { page },
  }) => {
    const work = probe();
    await shelfOf(page, "Slow", [work.id]);
    let posts = 0;
    let release = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/v1/copies", async (route) => {
      posts += 1;
      await released;
      await route.continue();
    });
    await page.goto("/collection/shopping");
    await opensSheet(page, work.id);
    const add = sheet(page).getByRole("button", { name: "Add it" });
    await add.click();
    await expect(add).toBeDisabled();
    await add.click({ force: true });
    release();
    await expect(sheet(page)).toHaveCount(0);
    await expect(row(page, work.id)).toHaveCount(0);
    expect(posts).toBe(1);
    expect(copiesOf(work.id)).toBe("1");
  });

  test("Add it lands and its answer is lost: the sheet's line; Cancel reads the page, and the row has left", async ({
    signedIn: { page },
  }) => {
    const work = probe();
    await shelfOf(page, "Lost", [work.id]);
    await page.route("**/api/v1/copies", async (route) => {
      await route.fetch();
      await route.abort();
    });
    await page.goto("/collection/shopping");
    await opensSheet(page, work.id);
    await sheet(page).getByRole("button", { name: "Add it" }).click();
    await expect(sheet(page).getByRole("alert")).toHaveText(
      "Couldn't add that copy just now. Try again.",
    );
    expect(copiesOf(work.id)).toBe("1");
    await sheet(page).getByRole("button", { name: "Cancel" }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(row(page, work.id)).toHaveCount(0);
  });

  test("a second tab owned this work first: Add it is a second copy, as A3's two rows, the row leaves, no line", async ({
    signedIn: { page },
  }) => {
    const work = probe();
    const edition = printing(work.id);
    await shelfOf(page, "Second tab", [work.id]);
    await page.goto("/collection/shopping");
    await opensSheet(page, work.id);
    await post(page, "/api/v1/copies", { edition });
    await sheet(page).getByRole("button", { name: "Add it" }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(row(page, work.id)).toHaveCount(0);
    expect(copiesOf(work.id)).toBe("2");
  });
});

test("owned on the work's own page, Back: the row has left", async ({
  signedIn: { page },
}) => {
  const work = probe();
  const other = probe();
  await shelfOf(page, "Back", [work.id, other.id]);
  await page.goto("/collection/shopping");
  await expect(rows(page)).toHaveCount(2);
  await row(page, work.id).getByRole("link", { name: work.title }).click();
  await expect(page).toHaveURL(`/items/${work.id}`);

  const editions = page.getByRole("region", { name: "Editions" });
  const own = editions.getByRole("button", { name: "Own a copy" });
  await expect(async () => {
    await own.click();
    await expect(sheet(page)).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await sheet(page).getByRole("button", { name: "Add it" }).click();
  await expect(editions.getByTestId("copy")).toHaveCount(1);

  await page.goBack();
  await expect(page).toHaveURL("/collection/shopping");
  await expect(row(page, other.id)).toHaveCount(1);
  await expect(row(page, work.id)).toHaveCount(0);
});

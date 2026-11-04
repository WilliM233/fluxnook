import type { Page } from "@playwright/test";
import { db } from "./harness/fixtures";
import { expect, test } from "./harness/signed-in";

// A8 on a probe run this file makes for each test: three issues and one
// collected work whose hardcover holds #1 and #2, under a series key no Browse
// volume uses, so `resetComics` and the comics spec never touch them. The real
// run is `search-comics.spec.ts`'s: a second file on that key would delete its
// series mid-test.

const OWN = "I own this";

type Run = {
  series: string;
  one: string;
  two: string;
  three: string;
  trade: string;
  hardcover: string;
  title: (n: number) => string;
  tradeTitle: string;
};

const runs: { tag: string; series: string }[] = [];

/** One row back from an insert ... returning id. */
const id = (sql: string) => db(sql).split("\n")[0];

function makeRun(): Run {
  const tag = `ticks ${crypto.randomUUID().slice(0, 8)}`;
  const key = `volume/98${Math.floor(Math.random() * 1e7)}`;
  const series = id(
    `insert into series (name, volume) values ('${tag} Run', 1) returning id`,
  );
  runs.push({ tag, series });
  db(
    `insert into series_sources (series, source, key) values ('${series}', 'comicvine', '${key}')`,
  );
  const title = (n: number) => `${tag} #${n}`;
  const comic = (name: string, form: string, month: number, number: string) => {
    const item =
      id(`insert into items (type, title, form, released_on, released_precision, source_note)
      values ('comic', '${name}', '${form}', '1984-${month}-01', 'month', '${tag}') returning id`);
    db(`insert into item_comics (item, series_id, number)
      values ('${item}', '${series}', ${number})`);
    return item;
  };
  const one = comic(title(1), "issue", 1, "1");
  const two = comic(title(2), "issue", 2, "2");
  const three = comic(title(3), "issue", 3, "3");
  const tradeTitle = `${tag} Trade`;
  const trade = comic(tradeTitle, "collected", 4, "null");
  const hardcover = id(
    `insert into editions (item, format) values ('${trade}', 'hardcover') returning id`,
  );
  db(`insert into edition_contents (edition, item, position) values
    ('${hardcover}', '${one}', 1), ('${hardcover}', '${two}', 2)`);
  return { series, one, two, three, trade, hardcover, title, tradeTitle };
}

const ownerOf = (email: string) =>
  db(`select id from auth.users where email = '${email}'`);

/** A copy written by SQL: the state a test starts from, not what it tests. */
function hold(email: string, edition: string) {
  db(
    `insert into copies (owner, edition) values ('${ownerOf(email)}', '${edition}')`,
  );
}

test.afterEach(() => {
  for (const { tag, series } of runs.splice(0)) {
    db(`delete from copies where edition in (
      select e.id from editions e join items i on i.id = e.item
      where i.source_note = '${tag}')`);
    db(`delete from items where source_note = '${tag}'`);
    db(`delete from series where id = '${series}'`);
  }
});

const heading = (page: Page) =>
  page.getByText(/in the catalog, in cover-date order/);
const tile = (page: Page, title: string) =>
  page
    .getByRole("list", { name: "Issues" })
    .getByRole("listitem")
    .filter({
      has: page.getByRole("link", { name: title, exact: true }),
    });
const collectedRow = (page: Page, title: string) =>
  page
    .getByRole("list", { name: "Collected in" })
    .getByRole("listitem")
    .filter({
      has: page.getByRole("link", { name: title, exact: true }),
    });

test("nothing held: the heading has no holding, no via line, the Collected in row ends in I own this", async ({
  signedIn: { page },
}) => {
  const run = makeRun();
  await page.goto(`/series/${run.series}`);
  await expect(heading(page)).toHaveText(
    "4 in the catalog, in cover-date order",
  );
  await expect(page.getByTestId("tile-via")).toHaveCount(0);
  await expect(
    collectedRow(page, run.tradeTitle).getByRole("button"),
  ).toHaveText(OWN);
});

test("a collection held: you hold 3, 2 of them via a collection; #1 and #2 read via it; its row ends Your copy; the note and the closing line as drawn", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  hold(email, run.hardcover);
  await page.goto(`/series/${run.series}`);
  await expect(heading(page)).toHaveText(
    "4 in the catalog, in cover-date order · you hold 3, 2 of them via a collection",
  );
  await expect(tile(page, run.title(1)).getByTestId("tile-via")).toHaveText(
    `via ${run.tradeTitle}`,
  );
  await expect(tile(page, run.title(2)).getByTestId("tile-via")).toHaveText(
    `via ${run.tradeTitle}`,
  );
  await expect(tile(page, run.title(3)).getByTestId("tile-via")).toHaveCount(0);
  await expect(
    collectedRow(page, run.tradeTitle).getByText("Your copy"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "An edition whose contents hold an issue of this run. One you hold covers its issues above.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "A tick makes a floppy of that issue yours; untick to let it go. An issue a collection you hold already covers says so, and can still be ticked when you hold the floppy too.",
    ),
  ).toBeVisible();
});

test("I own this on a Collected in row: Your copy, the tiles it holds read via, the heading counts them, with no reload", async ({
  signedIn: { page },
}) => {
  const run = makeRun();
  await page.goto(`/series/${run.series}`);
  const row = collectedRow(page, run.tradeTitle);
  await expect(heading(page)).toHaveText(
    "4 in the catalog, in cover-date order",
  );
  // Prove hydration by opening a sheet first: a retry here would be a second copy.
  await expect(async () => {
    await page.getByRole("button", { name: "Add the run to a shelf" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 500 });
  }).toPass();
  await page.getByRole("button", { name: "Cancel" }).click();

  await row.getByRole("button", { name: OWN }).click();
  await expect(row.getByText("Your copy")).toBeVisible();
  await expect(tile(page, run.title(1)).getByTestId("tile-via")).toHaveText(
    `via ${run.tradeTitle}`,
  );
  await expect(heading(page)).toHaveText(
    "4 in the catalog, in cover-date order · you hold 3, 2 of them via a collection",
  );
});

test("a collected tile has no box and reads Your copy when held", async ({
  signedIn: { page, email },
}) => {
  const run = makeRun();
  await page.goto(`/series/${run.series}`);
  const trade = tile(page, run.tradeTitle);
  await expect(trade.getByRole("link", { name: run.tradeTitle })).toBeVisible();
  await expect(trade.getByRole("checkbox")).toHaveCount(0);
  await expect(trade.getByText("Your copy")).toHaveCount(0);

  hold(email, run.hardcover);
  await page.reload();
  await expect(trade.getByText("Your copy")).toBeVisible();
  await expect(trade.getByRole("checkbox")).toHaveCount(0);
});
